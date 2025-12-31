import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { BookingEntity } from './entities/booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { BookingStatus, VehicleStatus } from '@prisma/client';
import {
  BookingCreatedEvent,
  BookingCancelledEvent,
} from '../events/booking.events';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly PLATFORM_FEE_RATE = 0.15; // 15% platform fee

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Calculate total price based on vehicle pricing and duration
   */
  private calculateTotalPrice(
    startTime: Date,
    endTime: Date,
    pricePerHour: number,
    pricePerDay: number,
  ): number {
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    const durationDays = durationHours / 24;

    // If booking is more than 1 day, use daily rate
    if (durationDays >= 1) {
      return Math.ceil(durationDays) * pricePerDay;
    }

    // Otherwise use hourly rate
    return Math.ceil(durationHours) * pricePerHour;
  }

  /**
   * Check if vehicle is available for the requested time period
   */
  private async isVehicleAvailable(
    vehicleId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string,
  ): Promise<boolean> {
    const conflictingBookings = await this.prisma.booking.findMany({
      where: {
        vehicleId,
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
        status: {
          in: [
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
            BookingStatus.ONGOING,
          ],
        },
        OR: [
          // New booking starts during existing booking
          {
            startTime: { lte: startTime },
            endTime: { gt: startTime },
          },
          // New booking ends during existing booking
          {
            startTime: { lt: endTime },
            endTime: { gte: endTime },
          },
          // New booking contains existing booking
          {
            startTime: { gte: startTime },
            endTime: { lte: endTime },
          },
        ],
      },
    });

    return conflictingBookings.length === 0;
  }

  /**
   * Create a new booking
   */
  async createBooking(
    userId: string,
    dto: CreateBookingDto,
  ): Promise<BookingEntity> {
    this.logger.log(
      `User ${userId} creating booking for vehicle ${dto.vehicleId}`,
    );

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    // Validate time range
    if (startTime >= endTime) {
      throw new BadRequestException('End time must be after start time');
    }

    if (startTime < new Date()) {
      throw new BadRequestException('Start time must be in the future');
    }

    // Get vehicle details
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
      include: { owner: true },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    // Check if user is trying to book their own vehicle
    if (vehicle.ownerId === userId) {
      throw new BadRequestException('You cannot book your own vehicle');
    }

    // Check if vehicle is available
    if (!vehicle.isAvailable || vehicle.status !== VehicleStatus.AVAILABLE) {
      throw new ConflictException('Vehicle is not available for booking');
    }

    // Check for time conflicts
    const isAvailable = await this.isVehicleAvailable(
      dto.vehicleId,
      startTime,
      endTime,
    );

    if (!isAvailable) {
      throw new ConflictException(
        'Vehicle is already booked for the selected time period',
      );
    }

    // Calculate pricing
    const totalPrice = this.calculateTotalPrice(
      startTime,
      endTime,
      vehicle.pricePerHour.toNumber(),
      vehicle.pricePerDay!.toNumber(),
    );

    // Create booking
    const booking = await this.prisma.booking.create({
      data: {
        renterId: userId,
        ownerId: vehicle.ownerId,
        vehicleId: dto.vehicleId,
        startTime,
        endTime,
        totalPrice,
        deposit: vehicle.deposit ?? 0,
        notes: dto.notes,
        status: BookingStatus.PENDING,
      },
      include: {
        vehicle: true,
        renter: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    this.logger.log(`Booking ${booking.id} created successfully`);

    // Emit event for notifications
    this.eventEmitter.emit(
      'booking.created',
      new BookingCreatedEvent(
        booking.id,
        userId,
        vehicle.ownerId,
        dto.vehicleId,
      ),
    );

    return BookingEntity.fromPrisma(booking);
  }

  /**
   * Get booking by ID
   */
  async getBookingById(
    bookingId: string,
    userId: string,
  ): Promise<BookingEntity> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        vehicle: true,
        renter: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            trustScore: true,
          },
        },
        owner: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            trustScore: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Check if user has access to this booking
    if (booking.renterId !== userId && booking.ownerId !== userId) {
      throw new NotFoundException('Booking not found');
    }

    return BookingEntity.fromPrisma(booking);
  }

  /**
   * Get user's bookings (as renter)
   */
  async getRenterBookings(
    userId: string,
    status?: BookingStatus,
  ): Promise<BookingEntity[]> {
    const where: any = { renterId: userId };
    if (status) {
      where.status = status;
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        vehicle: true,
        owner: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            trustScore: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return bookings.map((b) => BookingEntity.fromPrisma(b));
  }

  /**
   * Cancel booking (renter)
   */
  async cancelBooking(
    bookingId: string,
    userId: string,
    dto: CancelBookingDto,
  ): Promise<BookingEntity> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Only renter can cancel
    if (booking.renterId !== userId) {
      throw new BadRequestException('You can only cancel your own bookings');
    }

    // Can only cancel pending or confirmed bookings
    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        'Only pending or confirmed bookings can be cancelled',
      );
    }

    // Cancel booking
    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason: dto.reason,
        cancelledAt: new Date(),
      },
    });

    this.logger.log(`Booking ${bookingId} cancelled by renter ${userId}`);

    // Emit event
    this.eventEmitter.emit(
      'booking.cancelled',
      new BookingCancelledEvent(
        bookingId,
        userId,
        booking.ownerId,
        dto.reason,
        'renter',
      ),
    );

    return BookingEntity.fromPrisma(updatedBooking);
  }

  /**
   * Get upcoming bookings for renter
   */
  async getUpcomingBookings(userId: string): Promise<BookingEntity[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        renterId: userId,
        status: {
          in: [BookingStatus.CONFIRMED, BookingStatus.ONGOING],
        },
        startTime: {
          gte: new Date(),
        },
      },
      include: {
        vehicle: true,
        owner: {
          select: {
            fullName: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    return bookings.map((b) => BookingEntity.fromPrisma(b));
  }

  /**
   * Get booking history for renter
   */
  async getBookingHistory(userId: string): Promise<BookingEntity[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        renterId: userId,
        status: {
          in: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
        },
      },
      include: {
        vehicle: true,
        owner: {
          select: {
            fullName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return bookings.map((b) => BookingEntity.fromPrisma(b));
  }

  /**
   * Get booking schedule for a specific vehicle (public endpoint for renters)
   * Returns confirmed/ongoing bookings to show occupied time slots
   */
  async getVehicleSchedule(vehicleId: string): Promise<BookingEntity[]> {
    const now = new Date();

    const bookings = await this.prisma.booking.findMany({
      where: {
        vehicleId,
        status: {
          in: [
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
            BookingStatus.ONGOING,
          ],
        },
        // Only get bookings that haven't ended yet
        endTime: {
          gte: now,
        },
      },
      orderBy: { startTime: 'asc' },
      take: 30, // Limit to upcoming 30 bookings
    });

    // Return bookings without sensitive renter info
    return bookings.map((b) => BookingEntity.fromPrisma(b));
  }
}