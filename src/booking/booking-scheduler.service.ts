import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import {
  BookingStatus,
  HandoverType,
  NotificationType,
  PaymentStatus,
  TripStatus,
} from '@prisma/client';
import { BookingCancelledEvent } from '../events/booking.events';
import { NotificationGateway } from '../notification/notification.gateway';
import { NotificationService } from '../notification/notification.service';

type ReminderRecipient = 'renter' | 'owner';

/**
 * Scheduled tasks for booking lifecycle management.
 * Runs every 15 minutes to cancel stale PENDING bookings and unpaid confirmed
 * bookings that reached pickup time.
 */
@Injectable()
export class BookingSchedulerService {
  private readonly logger = new Logger(BookingSchedulerService.name);
  private readonly pickupReminderFromMs = 15 * 60 * 1000;
  private readonly pickupReminderToMs = 45 * 60 * 1000;
  private readonly checkInOverdueWindowMs = 2 * 60 * 60 * 1000;
  private readonly checkoutReminderWindowMs = 30 * 60 * 1000;
  private readonly lateReturnThresholdMs = 30 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Optional()
    private readonly notificationService?: NotificationService,
    @Optional()
    private readonly notificationGateway?: NotificationGateway,
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

  /**
   * Send threshold reminders for pickup/check-in/check-out/late return.
   * Dedupe uses one notification title per booking/recipient/type so the
   * 15-minute cron cadence does not spam users.
   */
  @Cron('0 */15 * * * *')
  async sendThresholdReminders(): Promise<void> {
    if (!this.notificationService) return;

    await this.sendPickupReminders();
    await this.sendCheckInOverdueReminders();
    await this.sendCheckoutReminders();
    await this.sendLateReturnAlerts();
  }

  private async sendPickupReminders(): Promise<void> {
    const now = Date.now();
    const from = new Date(now + this.pickupReminderFromMs);
    const to = new Date(now + this.pickupReminderToMs);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        startTime: { gte: from, lte: to },
        payment: { is: { status: PaymentStatus.COMPLETED } },
      },
      select: {
        id: true,
        renterId: true,
        ownerId: true,
        startTime: true,
        endTime: true,
      },
    });

    for (const booking of bookings) {
      await this.notifyReminder({
        booking,
        type: NotificationType.BOOKING_REMINDER,
        socketEvent: 'booking_reminder',
        title: 'Sắp đến giờ nhận xe',
        message: `Lượt thuê sẽ bắt đầu lúc ${this.formatVietnamTime(booking.startTime)}. Vui lòng chuẩn bị check-in bàn giao xe.`,
        recipients: ['renter', 'owner'],
        data: {
          reminderKind: 'PICKUP_SOON',
          startTime: booking.startTime,
        },
      });
    }
  }

  private async sendCheckInOverdueReminders(): Promise<void> {
    const now = new Date();
    const from = new Date(now.getTime() - this.checkInOverdueWindowMs);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        startTime: { lte: now, gte: from },
        payment: { is: { status: PaymentStatus.COMPLETED } },
        handovers: { none: { type: HandoverType.CHECK_IN } },
      },
      select: {
        id: true,
        renterId: true,
        ownerId: true,
        startTime: true,
        endTime: true,
      },
    });

    for (const booking of bookings) {
      await this.notifyReminder({
        booking,
        type: NotificationType.BOOKING_REMINDER,
        socketEvent: 'booking_reminder',
        title: 'Cần hoàn tất check-in',
        message:
          'Lượt thuê đã đến giờ nhận xe nhưng chưa có biên bản check-in. Vui lòng hoàn tất bàn giao trước khi bắt đầu chuyến đi.',
        recipients: ['renter', 'owner'],
        data: {
          reminderKind: 'CHECK_IN_OVERDUE',
          startTime: booking.startTime,
        },
      });
    }
  }

  private async sendCheckoutReminders(): Promise<void> {
    const now = new Date();
    const to = new Date(now.getTime() + this.checkoutReminderWindowMs);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.ONGOING,
        endTime: { gte: now, lte: to },
        trip: { is: { status: TripStatus.ONGOING } },
        handovers: { none: { type: HandoverType.CHECK_OUT } },
      },
      select: {
        id: true,
        renterId: true,
        ownerId: true,
        startTime: true,
        endTime: true,
      },
    });

    for (const booking of bookings) {
      await this.notifyReminder({
        booking,
        type: NotificationType.TRIP_REMINDER,
        socketEvent: 'trip_reminder',
        title: 'Sắp đến giờ trả xe',
        message: `Chuyến đi kết thúc lúc ${this.formatVietnamTime(booking.endTime)}. Vui lòng chuẩn bị check-out và bàn giao xe.`,
        recipients: ['renter', 'owner'],
        data: {
          reminderKind: 'CHECK_OUT_SOON',
          endTime: booking.endTime,
        },
      });
    }
  }

  private async sendLateReturnAlerts(): Promise<void> {
    const cutoff = new Date(Date.now() - this.lateReturnThresholdMs);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.ONGOING,
        endTime: { lte: cutoff },
        trip: { is: { status: TripStatus.ONGOING } },
        handovers: { none: { type: HandoverType.CHECK_OUT } },
      },
      select: {
        id: true,
        renterId: true,
        ownerId: true,
        startTime: true,
        endTime: true,
      },
    });

    for (const booking of bookings) {
      await this.notifyReminder({
        booking,
        type: NotificationType.TRIP_REMINDER,
        socketEvent: 'trip_reminder',
        title: 'Xe đang trả muộn',
        message:
          'Chuyến đi đã quá giờ trả xe hơn 30 phút và chưa có check-out. Vui lòng liên hệ nhau để hoàn tất bàn giao hoặc báo cáo sự cố nếu cần.',
        recipients: ['renter', 'owner'],
        data: {
          reminderKind: 'LATE_RETURN',
          endTime: booking.endTime,
        },
      });
    }
  }

  private async notifyReminder(input: {
    booking: {
      id: string;
      renterId: string;
      ownerId: string;
      startTime: Date;
      endTime: Date;
    };
    type: NotificationType;
    socketEvent: string;
    title: string;
    message: string;
    recipients: ReminderRecipient[];
    data?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.notificationService) return;

    const receivers = input.recipients.reduce<
      Array<{ id: string; role: ReminderRecipient }>
    >((acc, recipient) => {
      const id =
        recipient === 'renter' ? input.booking.renterId : input.booking.ownerId;
      if (!acc.some((receiver) => receiver.id === id)) {
        acc.push({ id, role: recipient });
      }
      return acc;
    }, []);

    try {
      for (const receiver of receivers) {
        const existing = await this.prisma.notification.findFirst({
          where: {
            receiverId: receiver.id,
            bookingId: input.booking.id,
            type: input.type,
            title: input.title,
          },
          select: { id: true },
        });

        if (existing) continue;

        const data = this.stringifyNotificationData({
          bookingId: input.booking.id,
          recipientRole: receiver.role,
          ...input.data,
        });

        const notification = await this.notificationService.createNotification({
          receiverId: receiver.id,
          type: input.type,
          title: input.title,
          message: input.message,
          bookingId: input.booking.id,
          data,
        });

        if (this.notificationGateway?.isUserOnline(receiver.id)) {
          this.notificationGateway.sendToUser(receiver.id, input.socketEvent, {
            notification,
            bookingId: input.booking.id,
            ...data,
          });
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to send ${input.type} reminder for booking ${input.booking.id}: ${(err as Error).message}`,
      );
    }
  }

  private stringifyNotificationData(
    data: Record<string, unknown>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [
          key,
          value instanceof Date ? value.toISOString() : String(value),
        ]),
    );
  }

  private formatVietnamTime(date: Date): string {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}
