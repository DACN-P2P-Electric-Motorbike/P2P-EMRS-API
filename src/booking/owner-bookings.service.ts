import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { BookingEntity } from './entities/booking.entity';
import { ApproveBookingDto, RejectBookingDto } from './dto/owner-booking.dto';
import { BookingStatus } from '@prisma/client';
import {
  BookingApprovedEvent,
  BookingRejectedEvent,
} from '../events/booking.events';

@Injectable()
export class OwnerBookingsService {
  private readonly logger = new Logger(OwnerBookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Get owner's bookings
   */
  async getOwnerBookings(
    ownerId: string,
    status?: BookingStatus,
  ): Promise<BookingEntity[]> {
    const where: any = { ownerId };
    if (status) {
      where.status = status;
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        vehicle: true,
        renter: {
          select: {
            id: true,
            fullName: true,
            phone: true,
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
   * Get pending bookings for owner
   */
  async getPendingBookings(ownerId: string): Promise<BookingEntity[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        ownerId,
        status: BookingStatus.PENDING,
      },
      include: {
        vehicle: true,
        renter: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            avatarUrl: true,
            trustScore: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return bookings.map((b) => BookingEntity.fromPrisma(b));
  }

  /**
   * Get booking by ID (owner)
   */
  async getOwnerBookingById(
    bookingId: string,
    ownerId: string,
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
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Check if user is the owner
    if (booking.ownerId !== ownerId) {
      throw new NotFoundException('Booking not found');
    }

    return BookingEntity.fromPrisma(booking);
  }

  /**
   * Approve booking (owner)
   */
  async approveBooking(
    bookingId: string,
    ownerId: string,
    dto: ApproveBookingDto,
  ): Promise<BookingEntity> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { vehicle: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Check ownership
    if (booking.ownerId !== ownerId) {
      throw new BadRequestException('You can only approve your own bookings');
    }

    // Can only approve pending bookings
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Only pending bookings can be approved');
    }

    // Check for time conflicts again (in case another booking was approved)
    const conflictingBookings = await this.prisma.booking.findMany({
      where: {
        vehicleId: booking.vehicleId,
        id: { not: bookingId },
        status: {
          in: [BookingStatus.CONFIRMED, BookingStatus.ONGOING],
        },
        OR: [
          {
            startTime: { lte: booking.startTime },
            endTime: { gt: booking.startTime },
          },
          {
            startTime: { lt: booking.endTime },
            endTime: { gte: booking.endTime },
          },
          {
            startTime: { gte: booking.startTime },
            endTime: { lte: booking.endTime },
          },
        ],
      },
    });

    if (conflictingBookings.length > 0) {
      throw new BadRequestException(
        'Vehicle is no longer available for this time slot',
      );
    }

    // Approve booking
    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CONFIRMED,
        confirmedAt: new Date(),
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

    this.logger.log(`Booking ${bookingId} approved by owner ${ownerId}`);

    // Emit event
    this.eventEmitter.emit(
      'booking.approved',
      new BookingApprovedEvent(
        bookingId,
        booking.renterId,
        ownerId,
        booking.vehicleId,
      ),
    );

    return BookingEntity.fromPrisma(updatedBooking);
  }

  /**
   * Reject booking (owner)
   */
  async rejectBooking(
    bookingId: string,
    ownerId: string,
    dto: RejectBookingDto,
  ): Promise<BookingEntity> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Check ownership
    if (booking.ownerId !== ownerId) {
      throw new BadRequestException('You can only reject your own bookings');
    }

    // Can only reject pending bookings
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Only pending bookings can be rejected');
    }

    // Reject booking
    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.REJECTED,
        cancellationReason: dto.reason,
        cancelledAt: new Date(),
      },
    });

    this.logger.log(`Booking ${bookingId} rejected by owner ${ownerId}`);

    // Emit event
    this.eventEmitter.emit(
      'booking.rejected',
      new BookingRejectedEvent(
        bookingId,
        booking.renterId,
        ownerId,
        dto.reason,
      ),
    );

    return BookingEntity.fromPrisma(updatedBooking);
  }
}