import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../notification/notification.service';
import { NotificationGateway } from '../notification/notification.gateway';
import { NotificationType } from '@prisma/client';
import {
  BookingCreatedEvent,
  BookingApprovedEvent,
  BookingRejectedEvent,
  BookingCancelledEvent,
} from './booking.events';

@Injectable()
export class BookingEventListener {
  private readonly logger = new Logger(BookingEventListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @OnEvent('booking.created')
  async handleBookingCreated(event: BookingCreatedEvent) {
    this.logger.log(`Handling booking.created event: ${event.bookingId}`);

    // Create notification for owner
    const notification = await this.notificationService.createNotification({
      receiverId: event.ownerId,
      senderId: event.renterId,
      type: NotificationType.BOOKING_REQUEST,
      title: 'New Booking Request',
      message: 'You have a new booking request for your vehicle',
      bookingId: event.bookingId,
      data: {
        vehicleId: event.vehicleId,
      },
    });

    // Send WebSocket notification if owner is online
    if (this.notificationGateway.isUserOnline(event.ownerId)) {
      this.notificationGateway.sendToUser(event.ownerId, 'booking_request', {
        notification,
        bookingId: event.bookingId,
      });
    }
  }

  @OnEvent('booking.approved')
  async handleBookingApproved(event: BookingApprovedEvent) {
    this.logger.log(`Handling booking.approved event: ${event.bookingId}`);

    // Create notification for renter
    const notification = await this.notificationService.createNotification({
      receiverId: event.renterId,
      senderId: event.ownerId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Booking Confirmed',
      message: 'Your booking request has been approved!',
      bookingId: event.bookingId,
      data: {
        vehicleId: event.vehicleId,
      },
    });

    // Send WebSocket notification if renter is online
    if (this.notificationGateway.isUserOnline(event.renterId)) {
      this.notificationGateway.sendToUser(event.renterId, 'booking_confirmed', {
        notification,
        bookingId: event.bookingId,
      });
    }

    // Broadcast to booking room
    this.notificationGateway.broadcastBookingUpdate(
      event.bookingId,
      'booking_status_changed',
      {
        bookingId: event.bookingId,
        status: 'CONFIRMED',
      },
    );
  }

  @OnEvent('booking.rejected')
  async handleBookingRejected(event: BookingRejectedEvent) {
    this.logger.log(`Handling booking.rejected event: ${event.bookingId}`);

    // Create notification for renter
    const notification = await this.notificationService.createNotification({
      receiverId: event.renterId,
      senderId: event.ownerId,
      type: NotificationType.BOOKING_REJECTED,
      title: 'Booking Rejected',
      message: `Your booking request was rejected. Reason: ${event.reason}`,
      bookingId: event.bookingId,
    });

    // Send WebSocket notification if renter is online
    if (this.notificationGateway.isUserOnline(event.renterId)) {
      this.notificationGateway.sendToUser(event.renterId, 'booking_rejected', {
        notification,
        bookingId: event.bookingId,
        reason: event.reason,
      });
    }

    // Broadcast to booking room
    this.notificationGateway.broadcastBookingUpdate(
      event.bookingId,
      'booking_status_changed',
      {
        bookingId: event.bookingId,
        status: 'REJECTED',
        reason: event.reason,
      },
    );
  }

  @OnEvent('booking.cancelled')
  async handleBookingCancelled(event: BookingCancelledEvent) {
    this.logger.log(`Handling booking.cancelled event: ${event.bookingId}`);

    // Determine who to notify (opposite of who cancelled)
    const receiverId = event.cancelledBy === 'renter' ? event.ownerId : event.renterId;
    const senderId = event.cancelledBy === 'renter' ? event.renterId : event.ownerId;

    // Create notification
    const notification = await this.notificationService.createNotification({
      receiverId,
      senderId,
      type: NotificationType.BOOKING_CANCELLED,
      title: 'Booking Cancelled',
      message: `Booking has been cancelled. Reason: ${event.reason}`,
      bookingId: event.bookingId,
    });

    // Send WebSocket notification if user is online
    if (this.notificationGateway.isUserOnline(receiverId)) {
      this.notificationGateway.sendToUser(receiverId, 'booking_cancelled', {
        notification,
        bookingId: event.bookingId,
        reason: event.reason,
        cancelledBy: event.cancelledBy,
      });
    }

    // Broadcast to booking room
    this.notificationGateway.broadcastBookingUpdate(
      event.bookingId,
      'booking_status_changed',
      {
        bookingId: event.bookingId,
        status: 'CANCELLED',
        reason: event.reason,
        cancelledBy: event.cancelledBy,
      },
    );
  }
}