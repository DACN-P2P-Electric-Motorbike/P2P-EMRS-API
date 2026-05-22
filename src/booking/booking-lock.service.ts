import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { BookingStatus, VehicleStatus } from '@prisma/client';

/**
 * Manages temporary calendar locks during the booking checkout process.
 * When a renter initiates a booking, a 15-minute soft lock is placed on the
 * vehicle's calendar to prevent double-booking while the renter completes checkout.
 */
@Injectable()
export class BookingLockService {
  private readonly logger = new Logger(BookingLockService.name);
  private readonly LOCK_DURATION_MINUTES = 15;
  private readonly MIN_BOOKING_MINUTES = 30;
  private readonly MAX_BOOKING_DAYS = 30;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a soft lock on a vehicle's calendar for the given time slot.
   * The lock expires after 15 minutes if the booking is not completed.
   */
  async createLock(
    vehicleId: string,
    userId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<{ id: string; expiresAt: Date }> {
    this.validateLockWindow(startTime, endTime);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        ownerId: true,
        isAvailable: true,
        status: true,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.ownerId === userId) {
      throw new BadRequestException('You cannot book your own vehicle');
    }

    if (!vehicle.isAvailable || vehicle.status !== VehicleStatus.AVAILABLE) {
      throw new ConflictException('Vehicle is not available for booking');
    }

    // Check for existing locks on the same time slot
    const existingLock = await this.prisma.bookingLock.findFirst({
      where: {
        vehicleId,
        expiresAt: { gt: new Date() },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (existingLock) {
      throw new ConflictException(
        'This time slot is temporarily held by another user. Please try again in a few minutes.',
      );
    }

    // Check for existing confirmed bookings
    const conflictingBooking = await this.prisma.booking.findFirst({
      where: {
        vehicleId,
        status: {
          in: [
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
            BookingStatus.ONGOING,
          ],
        },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (conflictingBooking) {
      throw new ConflictException(
        'Vehicle is already booked for the selected time period',
      );
    }

    const expiresAt = new Date(
      Date.now() + this.LOCK_DURATION_MINUTES * 60 * 1000,
    );

    const lock = await this.prisma.bookingLock.create({
      data: {
        vehicleId,
        userId,
        startTime,
        endTime,
        expiresAt,
      },
    });

    this.logger.log(
      `Booking lock created: ${lock.id} for vehicle ${vehicleId} (expires ${expiresAt.toISOString()})`,
    );

    return { id: lock.id, expiresAt };
  }

  /**
   * Release a lock manually (e.g., when user cancels checkout)
   */
  async releaseLock(lockId: string, userId: string): Promise<void> {
    const lock = await this.prisma.bookingLock.findFirst({
      where: { id: lockId, userId },
    });

    if (!lock) {
      return; // Lock doesn't exist or belongs to someone else — silently ignore
    }

    await this.prisma.bookingLock.delete({
      where: { id: lockId },
    });

    this.logger.log(`Booking lock released: ${lockId}`);
  }

  /**
   * Release all locks for a specific vehicle + time slot.
   * Called after a booking is successfully created.
   */
  async releaseLocksByVehicleAndTime(
    vehicleId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<void> {
    const result = await this.prisma.bookingLock.deleteMany({
      where: {
        vehicleId,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Released ${result.count} lock(s) for vehicle ${vehicleId}`,
      );
    }
  }

  /**
   * Check if there's an active lock on the given time slot for this vehicle,
   * optionally excluding a specific user (the one who holds the lock).
   */
  async hasConflictingLock(
    vehicleId: string,
    startTime: Date,
    endTime: Date,
    excludeUserId?: string,
  ): Promise<boolean> {
    const lock = await this.prisma.bookingLock.findFirst({
      where: {
        vehicleId,
        expiresAt: { gt: new Date() },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
      },
    });

    return lock !== null;
  }

  /**
   * Cleanup expired locks — runs every 5 minutes
   */
  @Cron('0 */5 * * * *')
  async cleanupExpiredLocks(): Promise<void> {
    const result = await this.prisma.bookingLock.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired booking lock(s)`);
    }
  }

  private validateLockWindow(startTime: Date, endTime: Date): void {
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestException('Invalid booking time range');
    }

    if (startTime >= endTime) {
      throw new BadRequestException('End time must be after start time');
    }

    if (startTime < new Date()) {
      throw new BadRequestException('Start time must be in the future');
    }

    const durationMinutes =
      (endTime.getTime() - startTime.getTime()) / (1000 * 60);

    if (durationMinutes < this.MIN_BOOKING_MINUTES) {
      throw new BadRequestException(
        `Booking duration must be at least ${this.MIN_BOOKING_MINUTES} minutes`,
      );
    }

    if (durationMinutes > this.MAX_BOOKING_DAYS * 24 * 60) {
      throw new BadRequestException(
        `Booking duration cannot exceed ${this.MAX_BOOKING_DAYS} days`,
      );
    }
  }
}
