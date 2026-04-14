import { Test, TestingModule } from '@nestjs/testing';
import { TripEventListener } from './trip.listener';
import { NotificationService } from '../notification/notification.service';
import { NotificationGateway } from '../notification/notification.gateway';
import { NotificationType } from '@prisma/client';
import { TripStartedEvent, TripCompletedEvent } from './trip.events';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNotificationService = () => ({
  createNotification: jest.fn(),
});

const mockNotificationGateway = () => ({
  isUserOnline: jest.fn(),
  sendToUser: jest.fn(),
});

const makeNotification = (id = 'notif-uuid') => ({ id, type: 'TRIP_STARTED' });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tripStartedEvent = new TripStartedEvent(
  'trip-1',
  'booking-1',
  'renter-1',
  'owner-1',
  'vehicle-1',
);

const tripCompletedEvent = new TripCompletedEvent(
  'trip-2',
  'booking-2',
  'renter-2',
  'owner-2',
  'vehicle-2',
  12.5,
  45,
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TripEventListener', () => {
  let listener: TripEventListener;
  let notificationService: ReturnType<typeof mockNotificationService>;
  let notificationGateway: ReturnType<typeof mockNotificationGateway>;

  beforeEach(async () => {
    notificationService = mockNotificationService();
    notificationGateway = mockNotificationGateway();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripEventListener,
        { provide: NotificationService, useValue: notificationService },
        { provide: NotificationGateway, useValue: notificationGateway },
      ],
    }).compile();

    listener = module.get<TripEventListener>(TripEventListener);
  });

  // =========================================================================
  // handleTripStarted
  // =========================================================================

  describe('handleTripStarted', () => {
    beforeEach(() => {
      notificationService.createNotification.mockResolvedValue(makeNotification());
    });

    it('should create a TRIP_STARTED notification for the owner', async () => {
      notificationGateway.isUserOnline.mockReturnValue(false);

      await listener.handleTripStarted(tripStartedEvent);

      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          receiverId: 'owner-1',
          senderId: 'renter-1',
          type: NotificationType.TRIP_STARTED,
          bookingId: 'booking-1',
        }),
      );
    });

    it('should only create one notification (for the owner)', async () => {
      notificationGateway.isUserOnline.mockReturnValue(false);

      await listener.handleTripStarted(tripStartedEvent);

      expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
    });

    it('should send WebSocket event to owner when owner is online', async () => {
      const notif = makeNotification('n1');
      notificationService.createNotification.mockResolvedValue(notif);
      notificationGateway.isUserOnline.mockImplementation(
        (userId: string) => userId === 'owner-1',
      );

      await listener.handleTripStarted(tripStartedEvent);

      expect(notificationGateway.sendToUser).toHaveBeenCalledWith(
        'owner-1',
        'trip_started',
        expect.objectContaining({
          notification: notif,
          tripId: 'trip-1',
          bookingId: 'booking-1',
        }),
      );
    });

    it('should NOT send WebSocket event when owner is offline', async () => {
      notificationGateway.isUserOnline.mockReturnValue(false);

      await listener.handleTripStarted(tripStartedEvent);

      expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
    });

    it('should include tripId and vehicleId in notification data', async () => {
      notificationGateway.isUserOnline.mockReturnValue(false);

      await listener.handleTripStarted(tripStartedEvent);

      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { tripId: 'trip-1', vehicleId: 'vehicle-1' },
        }),
      );
    });
  });

  // =========================================================================
  // handleTripCompleted
  // =========================================================================

  describe('handleTripCompleted', () => {
    beforeEach(() => {
      notificationService.createNotification
        .mockResolvedValueOnce(makeNotification('owner-notif'))
        .mockResolvedValueOnce(makeNotification('renter-notif'));
    });

    it('should create notifications for BOTH owner and renter', async () => {
      notificationGateway.isUserOnline.mockReturnValue(false);

      await listener.handleTripCompleted(tripCompletedEvent);

      expect(notificationService.createNotification).toHaveBeenCalledTimes(2);
    });

    it('should create TRIP_COMPLETED notification for the owner with distance/duration', async () => {
      notificationGateway.isUserOnline.mockReturnValue(false);

      await listener.handleTripCompleted(tripCompletedEvent);

      const ownerCall = notificationService.createNotification.mock.calls[0][0];
      expect(ownerCall.receiverId).toBe('owner-2');
      expect(ownerCall.type).toBe(NotificationType.TRIP_COMPLETED);
      expect(ownerCall.message).toContain('12.5');
      expect(ownerCall.message).toContain('45');
    });

    it('should create TRIP_COMPLETED notification for the renter', async () => {
      notificationGateway.isUserOnline.mockReturnValue(false);

      await listener.handleTripCompleted(tripCompletedEvent);

      const renterCall = notificationService.createNotification.mock.calls[1][0];
      expect(renterCall.receiverId).toBe('renter-2');
      expect(renterCall.type).toBe(NotificationType.TRIP_COMPLETED);
    });

    it('should send WebSocket events to both when both are online', async () => {
      notificationGateway.isUserOnline.mockReturnValue(true);

      await listener.handleTripCompleted(tripCompletedEvent);

      const wsRecipients = notificationGateway.sendToUser.mock.calls.map(
        (c: any) => c[0],
      );
      expect(wsRecipients).toContain('owner-2');
      expect(wsRecipients).toContain('renter-2');
    });

    it('should NOT send WebSocket event to offline users', async () => {
      // Only renter is online
      notificationGateway.isUserOnline.mockImplementation(
        (userId: string) => userId === 'renter-2',
      );

      await listener.handleTripCompleted(tripCompletedEvent);

      const wsRecipients = notificationGateway.sendToUser.mock.calls.map(
        (c: any) => c[0],
      );
      expect(wsRecipients).not.toContain('owner-2');
      expect(wsRecipients).toContain('renter-2');
    });
  });
});
