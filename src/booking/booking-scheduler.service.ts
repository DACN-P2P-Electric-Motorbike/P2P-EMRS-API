import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { BookingCancelledEvent } from '../events/booking.events';

/**
 * Scheduled tasks for booking lifecycle management.
 * Runs every 15 minutes to cancel stale PENDING bookings and unpaid confirmed
 * bookings that reached pickup time.
 */
@Injectable()
export class BookingSchedulerService {
  private readonly logger = new Logger(BookingSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Auto-cancel PENDING bookings that have been waiting for owner approval
   * for more than 24 hours. Runs every 15 minutes.
   */
  @Cron('0 */15 * * * *')
  async expireStalePendingBookings(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stale = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.PENDING,
        createdAt: { lt: cutoff },
      },
      select: { id: true, renterId: true, ownerId: true },
    });

    if (stale.length === 0) return;

    const ids = stale.map((b) => b.id);
    const reason = 'Tự động hủy: không có phản hồi từ chủ xe sau 24 giờ';
    const cancelledAt = new Date();

    await this.prisma.booking.updateMany({
      where: { id: { in: ids } },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason: reason,
        cancelledBy: 'OWNER',
        cancelledAt,
      },
    });

    stale.forEach((booking) => {
      this.eventEmitter.emit(
        'booking.cancelled',
        new BookingCancelledEvent(
          booking.id,
          booking.renterId,
          booking.ownerId,
          reason,
          'owner',
        ),
      );
    });

    this.logger.log(
      `Auto-expired ${stale.length} stale PENDING booking(s): ${ids.join(', ')}`,
    );
  }

  /**
   * Auto-cancel confirmed bookings when the renter has not completed payment
   * by the scheduled pickup time.
   */
  @Cron('0 */15 * * * *')
  async cancelUnpaidConfirmedBookings(): Promise<void> {
    const now = new Date();

    const overdue = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        startTime: { lte: now },
      },
      select: {
        id: true,
        renterId: true,
        ownerId: true,
        payment: { select: { status: true } },
      },
    });

    const unpaid = overdue.filter(
      (booking) => booking.payment?.status !== PaymentStatus.COMPLETED,
    );
    const ids = unpaid.map((booking) => booking.id);

    if (ids.length === 0) return;

    const reason = 'Tự động hủy: chưa hoàn tất thanh toán trước giờ nhận xe';

    await this.prisma.booking.updateMany({
      where: { id: { in: ids } },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason: reason,
        cancelledBy: 'RENTER',
        cancelledAt: now,
      },
    });

    unpaid.forEach((booking) => {
      this.eventEmitter.emit(
        'booking.cancelled',
        new BookingCancelledEvent(
          booking.id,
          booking.renterId,
          booking.ownerId,
          reason,
          'renter',
        ),
      );
    });

    this.logger.log(
      `Auto-cancelled ${ids.length} unpaid CONFIRMED booking(s): ${ids.join(', ')}`,
    );
  }
}
