import { NotificationType } from '@prisma/client';
import { NotificationGateway } from '../notification/notification.gateway';
import { NotificationService } from '../notification/notification.service';
import {
  BookingApprovedEvent,
  BookingCancelledEvent,
  BookingCreatedEvent,
  BookingRejectedEvent,
} from './booking.events';
import { BookingEventListener } from './booking.listener';

describe('BookingEventListener', () => {
  let listener: BookingEventListener;
  let notificationService: jest.Mocked<NotificationService>;
  let notificationGateway: jest.Mocked<NotificationGateway>;
  const notification = { id: 'notification-1' } as any;

  beforeEach(() => {
    notificationService = {
      createNotification: jest.fn().mockResolvedValue(notification),
    } as unknown as jest.Mocked<NotificationService>;
    notificationGateway = {
      isUserOnline: jest.fn().mockReturnValue(true),
      sendToUser: jest.fn(),
      broadcastBookingUpdate: jest.fn(),
    } as unknown as jest.Mocked<NotificationGateway>;
    listener = new BookingEventListener(
      notificationService,
      notificationGateway,
    );
  });

  it('notifies the owner when a booking is created', async () => {
    await listener.handleBookingCreated(
      new BookingCreatedEvent('booking-1', 'renter-1', 'owner-1', 'vehicle-1'),
    );

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'owner-1',
        senderId: 'renter-1',
        type: NotificationType.BOOKING_REQUEST,
        bookingId: 'booking-1',
        data: { vehicleId: 'vehicle-1' },
      }),
    );
    expect(notificationGateway.sendToUser).toHaveBeenCalledWith(
      'owner-1',
      'booking_request',
      { notification, bookingId: 'booking-1' },
    );
  });

  it('notifies the renter and broadcasts when a booking is approved', async () => {
    await listener.handleBookingApproved(
      new BookingApprovedEvent('booking-1', 'renter-1', 'owner-1', 'vehicle-1'),
    );

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'renter-1',
        type: NotificationType.BOOKING_CONFIRMED,
      }),
    );
    expect(notificationGateway.sendToUser).toHaveBeenCalledWith(
      'renter-1',
      'booking_confirmed',
      { notification, bookingId: 'booking-1' },
    );
    expect(notificationGateway.broadcastBookingUpdate).toHaveBeenCalledWith(
      'booking-1',
      'booking_status_changed',
      { bookingId: 'booking-1', status: 'CONFIRMED' },
    );
  });

  it('notifies the renter and broadcasts when a booking is rejected', async () => {
    await listener.handleBookingRejected(
      new BookingRejectedEvent(
        'booking-1',
        'renter-1',
        'owner-1',
        'Schedule conflict',
      ),
    );

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'renter-1',
        type: NotificationType.BOOKING_REJECTED,
        message: 'Your booking request was rejected. Reason: Schedule conflict',
      }),
    );
    expect(notificationGateway.sendToUser).toHaveBeenCalledWith(
      'renter-1',
      'booking_rejected',
      {
        notification,
        bookingId: 'booking-1',
        reason: 'Schedule conflict',
      },
    );
    expect(notificationGateway.broadcastBookingUpdate).toHaveBeenCalledWith(
      'booking-1',
      'booking_status_changed',
      {
        bookingId: 'booking-1',
        status: 'REJECTED',
        reason: 'Schedule conflict',
      },
    );
  });

  it('notifies the opposite party and broadcasts cancellation details', async () => {
    await listener.handleBookingCancelled(
      new BookingCancelledEvent(
        'booking-1',
        'renter-1',
        'owner-1',
        'Changed plans',
        'renter',
      ),
    );

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'owner-1',
        senderId: 'renter-1',
        type: NotificationType.BOOKING_CANCELLED,
      }),
    );
    expect(notificationGateway.sendToUser).toHaveBeenCalledWith(
      'owner-1',
      'booking_cancelled',
      {
        notification,
        bookingId: 'booking-1',
        reason: 'Changed plans',
        cancelledBy: 'renter',
      },
    );

    notificationGateway.sendToUser.mockClear();
    await listener.handleBookingCancelled(
      new BookingCancelledEvent(
        'booking-2',
        'renter-1',
        'owner-1',
        'Unavailable',
        'owner',
      ),
    );

    expect(notificationGateway.sendToUser).toHaveBeenCalledWith(
      'renter-1',
      'booking_cancelled',
      expect.objectContaining({ cancelledBy: 'owner' }),
    );
  });

  it('does not send direct socket events when the target user is offline', async () => {
    notificationGateway.isUserOnline.mockReturnValue(false);

    await listener.handleBookingCreated(
      new BookingCreatedEvent('booking-1', 'renter-1', 'owner-1', 'vehicle-1'),
    );

    expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
  });
});
