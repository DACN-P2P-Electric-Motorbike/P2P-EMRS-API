import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../notification/notification.service';
import { NotificationGateway } from '../notification/notification.gateway';
import { NotificationType } from '@prisma/client';
import { TripStartedEvent, TripCompletedEvent } from './trip.events';

@Injectable()
export class TripEventListener {
  private readonly logger = new Logger(TripEventListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @OnEvent('trip.started')
  async handleTripStarted(event: TripStartedEvent) {
    this.logger.log(`Handling trip.started event: ${event.tripId}`);

    // Notify the vehicle owner that the renter has started the trip
    const notification = await this.notificationService.createNotification({
      receiverId: event.ownerId,
      senderId: event.renterId,
      type: NotificationType.TRIP_STARTED,
      title: 'Chuyến đi đã bắt đầu',
      message: 'Người thuê đã bắt đầu chuyến đi với xe của bạn.',
      bookingId: event.bookingId,
      data: { tripId: event.tripId, vehicleId: event.vehicleId },
    });

    if (this.notificationGateway.isUserOnline(event.ownerId)) {
      this.notificationGateway.sendToUser(event.ownerId, 'trip_started', {
        notification,
        tripId: event.tripId,
        bookingId: event.bookingId,
      });
    }
  }

  @OnEvent('trip.completed')
  async handleTripCompleted(event: TripCompletedEvent) {
    this.logger.log(`Handling trip.completed event: ${event.tripId}`);

    // Notify the vehicle owner that the trip is complete
    const ownerNotification = await this.notificationService.createNotification({
      receiverId: event.ownerId,
      senderId: event.renterId,
      type: NotificationType.TRIP_COMPLETED,
      title: 'Chuyến đi đã hoàn thành',
      message: `Người thuê đã trả xe. Quãng đường: ${event.distanceTraveled.toFixed(1)} km, thời gian: ${event.durationMinutes} phút.`,
      bookingId: event.bookingId,
      data: { tripId: event.tripId, vehicleId: event.vehicleId },
    });

    if (this.notificationGateway.isUserOnline(event.ownerId)) {
      this.notificationGateway.sendToUser(event.ownerId, 'trip_completed', {
        notification: ownerNotification,
        tripId: event.tripId,
        bookingId: event.bookingId,
      });
    }

    // Also notify the renter (confirmation that trip was recorded)
    const renterNotification = await this.notificationService.createNotification({
      receiverId: event.renterId,
      type: NotificationType.TRIP_COMPLETED,
      title: 'Chuyến đi hoàn tất',
      message: `Chuyến đi đã được ghi nhận. Quãng đường: ${event.distanceTraveled.toFixed(1)} km. Cảm ơn bạn đã sử dụng DreamRide!`,
      bookingId: event.bookingId,
      data: { tripId: event.tripId },
    });

    if (this.notificationGateway.isUserOnline(event.renterId)) {
      this.notificationGateway.sendToUser(event.renterId, 'trip_completed', {
        notification: renterNotification,
        tripId: event.tripId,
        bookingId: event.bookingId,
      });
    }
  }
}
