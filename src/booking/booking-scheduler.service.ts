import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { BookingStatus } from '@prisma/client';

/**
 * Scheduled tasks for booking lifecycle management.
 * Runs hourly to cancel stale PENDING bookings (no owner response after 24h).
 */
@Injectable()
export class BookingSchedulerService {
  private readonly logger = new Logger(BookingSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Auto-cancel PENDING bookings that have been waiting for owner approval
   * for more than 24 hours. Runs every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireStalePendingBookings(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stale = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.PENDING,
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });

    if (stale.length === 0) return;

    const ids = stale.map((b) => b.id);

    await this.prisma.booking.updateMany({
      where: { id: { in: ids } },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason: 'Tự động hủy: không có phản hồi từ chủ xe sau 24 giờ',
      },
    });

    this.logger.log(
      `Auto-expired ${stale.length} stale PENDING booking(s): ${ids.join(', ')}`,
    );
  }
}
