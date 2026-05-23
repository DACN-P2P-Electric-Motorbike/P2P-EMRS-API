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
import {
  BookingStatus,
  DepositLedgerStatus,
  VehicleStatus,
  PaymentStatus,
  Prisma,
  TrustScoreEventType,
} from '@prisma/client';
import {
  BookingCreatedEvent,
  BookingCancelledEvent,
  BookingApprovedEvent,
} from '../events/booking.events';
import { TrustScoreService } from '../trust-score/trust-score.service';
import { BookingLockService } from './booking-lock.service';
import { KycService } from '../kyc/kyc.service';
import { CancellationRefundPreviewEntity } from './entities/cancellation-refund-preview.entity';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly PLATFORM_FEE_RATE = 0.15; // 15% platform fee
  private readonly MIN_BOOKING_MINUTES = 30;
  private readonly MAX_BOOKING_DAYS = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly trustScoreService: TrustScoreService,
    private readonly bookingLockService: BookingLockService,
    private readonly kycService: KycService,
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

    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = durationMs / (1000 * 60);
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

    await this.trustScoreService.assertCanCreateBooking(userId);
    await this.kycService.assertApproved(userId, 'booking');

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

    const hasConflictingLock = await this.bookingLockService.hasConflictingLock(
      dto.vehicleId,
      startTime,
      endTime,
      userId,
    );

    if (hasConflictingLock) {
      throw new ConflictException(
        'This time slot is temporarily held by another user. Please try again in a few minutes.',
      );
    }

    // Calculate pricing
    const totalPrice = this.calculateTotalPrice(
      startTime,
      endTime,
      vehicle.pricePerHour.toNumber(),
      vehicle.pricePerDay?.toNumber() ?? vehicle.pricePerHour.toNumber() * 24,
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

    // Instant book: auto-approve if vehicle has instant book enabled
    let finalBooking = booking;
    if (vehicle.instantBook) {
      finalBooking = await this.prisma.booking.update({
        where: { id: booking.id },
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

      this.logger.log(`Booking ${booking.id} auto-approved (instant book)`);

      // Emit approved event for notification
      this.eventEmitter.emit(
        'booking.approved',
        new BookingApprovedEvent(
          booking.id,
          userId,
          vehicle.ownerId,
          dto.vehicleId,
        ),
      );
    }

    await this.bookingLockService.releaseLocksByVehicleAndTime(
      dto.vehicleId,
      startTime,
      endTime,
    );

    return BookingEntity.fromPrisma(finalBooking);
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
        payment: { select: { status: true } },
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
        payment: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return bookings.map((b) => BookingEntity.fromPrisma(b));
  }

  /**
   * Preview cancellation policy and money movement before the user confirms.
   */
  async getCancellationRefundPreview(
    bookingId: string,
    userId: string,
  ): Promise<CancellationRefundPreviewEntity> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.renterId !== userId && booking.ownerId !== userId) {
      throw new BadRequestException(
        'You can only preview cancellation for bookings you are involved in',
      );
    }

    return this.buildCancellationRefundPreview(
      booking,
      booking.payment ?? null,
      userId,
      new Date(),
    );
  }

  /**
   * Cancel booking (renter or owner) with time-based cancellation policy:
   *   Renter:
   *   - >24h before start: full rental refund, full deposit refund, no trust penalty
   *   - 1-24h before start: 50% rental refund, full deposit refund, -5 trust
   *   - <1h before start: no rental refund, full deposit refund, -10 trust
   *   Owner:
   *   - Always full rental/deposit refund to renter, -10 trust penalty to owner
   */
  async cancelBooking(
    bookingId: string,
    userId: string,
    dto: CancelBookingDto,
  ): Promise<BookingEntity> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Determine caller role
    const isRenter = booking.renterId === userId;
    const isOwner = booking.ownerId === userId;

    if (!isRenter && !isOwner) {
      throw new BadRequestException(
        'You can only cancel bookings you are involved in',
      );
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

    const now = new Date();
    const preview = this.buildCancellationRefundPreview(
      booking,
      booking.payment ?? null,
      userId,
      now,
    );

    this.logger.log(
      `Cancellation by ${isOwner ? 'owner' : 'renter'}: ${preview.hoursUntilStart.toFixed(1)}h before start → rentalRefundRate=${preview.rentalRefundRate}, trustPenalty=${preview.trustPenalty}`,
    );

    // Cancel booking and handle refund atomically
    const updatedBooking = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancellationReason: dto.reason,
          cancelledBy: isOwner ? 'OWNER' : 'RENTER',
          cancelledAt: new Date(),
        },
      });

      // If a COMPLETED payment exists, handle refund based on policy
      const existingPayment = await tx.payment.findUnique({
        where: { bookingId },
      });
      if (
        existingPayment !== null &&
        existingPayment.status === PaymentStatus.COMPLETED
      ) {
        const paymentPreview = this.buildCancellationRefundPreview(
          booking,
          existingPayment,
          userId,
          now,
        );
        const refundMetadata = {
          refundType: paymentPreview.refundType,
          refundRate: paymentPreview.rentalRefundRate,
          refundAmount: paymentPreview.refundAmount,
          cancelledBy: isOwner ? 'OWNER' : 'RENTER',
          cancelledAt: now.toISOString(),
          cancellationRefundBreakdown: JSON.parse(
            JSON.stringify(paymentPreview),
          ),
        };

        await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            ...(paymentPreview.refundAmount > 0
              ? { status: PaymentStatus.REFUNDED }
              : {}),
            gatewayResponse: refundMetadata as Prisma.InputJsonValue,
          },
        });

        if (paymentPreview.refundableDepositAmount > 0) {
          await tx.depositLedger.updateMany({
            where: { bookingId },
            data: {
              status: DepositLedgerStatus.REFUNDED,
              pendingChargeAmount: 0,
              capturedAmount: 0,
              releasedAmount: 0,
              refundedAmount: paymentPreview.refundableDepositAmount,
              releasedAt: now,
              notes: `Deposit refunded on booking cancellation by ${isOwner ? 'owner' : 'renter'}`,
            },
          });
        }

        this.logger.log(
          `Payment ${existingPayment.id} cancellation refund recorded (${paymentPreview.refundType}: ${paymentPreview.refundAmount} VND)`,
        );
      }

      return cancelled;
    });

    this.logger.log(
      `Booking ${bookingId} cancelled by ${isOwner ? 'owner' : 'renter'} ${userId}`,
    );

    // Apply trust penalty based on cancellation window
    if (preview.trustPenalty > 0) {
      const eventType = isOwner
        ? TrustScoreEventType.BOOKING_REJECTED_BY_OWNER
        : TrustScoreEventType.BOOKING_CANCELLED_BY_RENTER;
      const reason = isOwner
        ? 'Owner cancelled a booking'
        : 'Renter cancelled a confirmed booking';
      await this.trustScoreService.recordViolation(
        userId,
        eventType,
        preview.trustPenalty,
        reason,
        {
          bookingId,
          hoursUntilStart: preview.hoursUntilStart,
          rentalRefundRate: preview.rentalRefundRate,
          refundAmount: preview.refundAmount,
        },
      );
    }

    // Emit event
    this.eventEmitter.emit(
      'booking.cancelled',
      new BookingCancelledEvent(
        bookingId,
        booking.renterId,
        booking.ownerId,
        dto.reason,
        isOwner ? 'owner' : 'renter',
      ),
    );

    return BookingEntity.fromPrisma(updatedBooking);
  }

  private buildCancellationRefundPreview(
    booking: {
      id: string;
      renterId: string;
      ownerId: string;
      status: BookingStatus;
      startTime: Date;
      totalPrice: number;
      deposit: number;
    },
    payment: { amount: number; status: PaymentStatus } | null,
    userId: string,
    now: Date,
  ): CancellationRefundPreviewEntity {
    const isOwner = booking.ownerId === userId;
    const hoursUntilStart =
      (booking.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    const cancellable =
      booking.status === BookingStatus.PENDING ||
      booking.status === BookingStatus.CONFIRMED;

    let rentalRefundRate = 0;
    let trustPenalty = 0;
    let policyCode = 'NOT_CANCELLABLE';

    if (cancellable && isOwner) {
      rentalRefundRate = 1;
      trustPenalty = 10;
      policyCode = 'OWNER_FULL_REFUND';
    } else if (cancellable && hoursUntilStart > 24) {
      rentalRefundRate = 1;
      policyCode = 'RENTER_EARLY_FULL_REFUND';
    } else if (cancellable && hoursUntilStart >= 1) {
      rentalRefundRate = 0.5;
      trustPenalty = booking.status === BookingStatus.CONFIRMED ? 5 : 0;
      policyCode = 'RENTER_STANDARD_PARTIAL_REFUND';
    } else if (cancellable) {
      rentalRefundRate = 0;
      trustPenalty = booking.status === BookingStatus.CONFIRMED ? 10 : 0;
      policyCode = 'RENTER_LATE_DEPOSIT_ONLY';
    }

    const isPaid = payment?.status === PaymentStatus.COMPLETED;
    const rentalAmount = this.roundMoney(booking.totalPrice);
    const depositAmount = this.roundMoney(booking.deposit);
    const paidAmount = isPaid ? this.roundMoney(payment.amount) : 0;
    const refundableDepositAmount = isPaid
      ? Math.min(depositAmount, paidAmount)
      : 0;
    const refundableRentalAmount = isPaid
      ? Math.min(rentalAmount, this.roundMoney(rentalAmount * rentalRefundRate))
      : 0;
    const refundAmount = Math.min(
      paidAmount,
      this.roundMoney(refundableDepositAmount + refundableRentalAmount),
    );
    const forfeitedRentalAmount = isPaid
      ? Math.max(0, this.roundMoney(rentalAmount - refundableRentalAmount))
      : 0;
    const forfeitedDepositAmount = 0;
    const forfeitedAmount = this.roundMoney(
      forfeitedRentalAmount + forfeitedDepositAmount,
    );
    const refundType =
      refundAmount <= 0
        ? 'none'
        : refundAmount >= paidAmount
          ? 'full'
          : 'partial';

    return new CancellationRefundPreviewEntity({
      bookingId: booking.id,
      cancelledBy: isOwner ? 'OWNER' : 'RENTER',
      cancellable,
      hoursUntilStart,
      policyCode,
      rentalRefundRate,
      trustPenalty,
      rentalAmount,
      depositAmount,
      paidAmount,
      refundableRentalAmount,
      refundableDepositAmount,
      refundAmount,
      forfeitedRentalAmount,
      forfeitedDepositAmount,
      forfeitedAmount,
      isPaid,
      paymentStatus: payment?.status ?? null,
      refundType,
    });
  }

  private roundMoney(value: number): number {
    return Math.max(0, Math.round(value));
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
        payment: { select: { status: true } },
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
        payment: { select: { status: true } },
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
