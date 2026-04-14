import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../notification/notification.service';
import { NotificationGateway } from '../notification/notification.gateway';
import { NotificationType } from '@prisma/client';
import { PaymentCompletedEvent, PaymentFailedEvent } from './payment.events';

@Injectable()
export class PaymentEventListener {
  private readonly logger = new Logger(PaymentEventListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @OnEvent('payment.completed')
  async handlePaymentCompleted(event: PaymentCompletedEvent) {
    this.logger.log(`Handling payment.completed event: ${event.paymentId}`);

    const amountFormatted = new Intl.NumberFormat('vi-VN').format(event.amount);

    // Notify the renter that payment was successful
    const renterNotification = await this.notificationService.createNotification({
      receiverId: event.payerId,
      type: NotificationType.PAYMENT_SUCCESS,
      title: 'Thanh toán thành công',
      message: `Thanh toán ${amountFormatted} VND đã được xác nhận. Chuyến đi của bạn đã sẵn sàng!`,
      bookingId: event.bookingId,
      data: { paymentId: event.paymentId },
    });

    if (this.notificationGateway.isUserOnline(event.payerId)) {
      this.notificationGateway.sendToUser(event.payerId, 'payment_success', {
        notification: renterNotification,
        bookingId: event.bookingId,
      });
    }

    // Notify the owner that they received payment
    const ownerNotification = await this.notificationService.createNotification({
      receiverId: event.receiverId,
      senderId: event.payerId,
      type: NotificationType.PAYMENT_SUCCESS,
      title: 'Đã nhận thanh toán',
      message: `Bạn vừa nhận được ${amountFormatted} VND từ chuyến thuê xe.`,
      bookingId: event.bookingId,
      data: { paymentId: event.paymentId },
    });

    if (this.notificationGateway.isUserOnline(event.receiverId)) {
      this.notificationGateway.sendToUser(event.receiverId, 'payment_received', {
        notification: ownerNotification,
        bookingId: event.bookingId,
      });
    }
  }

  @OnEvent('payment.failed')
  async handlePaymentFailed(event: PaymentFailedEvent) {
    this.logger.log(`Handling payment.failed event: ${event.paymentId}`);

    const notification = await this.notificationService.createNotification({
      receiverId: event.payerId,
      type: NotificationType.PAYMENT_FAILED,
      title: 'Thanh toán thất bại',
      message: 'Giao dịch thanh toán không thành công. Vui lòng thử lại.',
      bookingId: event.bookingId,
      data: { paymentId: event.paymentId },
    });

    if (this.notificationGateway.isUserOnline(event.payerId)) {
      this.notificationGateway.sendToUser(event.payerId, 'payment_failed', {
        notification,
        bookingId: event.bookingId,
      });
    }
  }
}
