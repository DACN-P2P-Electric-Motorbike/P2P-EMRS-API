import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import { NotificationService } from './notification.service';

jest.mock('firebase-admin', () => ({
  __mockState: {
    apps: [],
    initializeApp: jest.fn(),
    cert: jest.fn((serviceAccount) => ({ serviceAccount })),
    sendEachForMulticast: jest.fn(),
  },
  get apps() {
    return this.__mockState.apps;
  },
  initializeApp(...args: unknown[]) {
    return this.__mockState.initializeApp(...args);
  },
  credential: {
    cert(...args: unknown[]) {
      const state = jest.requireMock('firebase-admin').__mockState;
      return state.cert(...args);
    },
  },
  messaging: jest.fn(() => {
    const state = jest.requireMock('firebase-admin').__mockState;
    return {
      sendEachForMulticast: state.sendEachForMulticast,
    };
  }),
}));

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: any;
  let config: jest.Mocked<ConfigService>;
  let firebaseState: any;

  const notification = {
    id: 'notification-1',
    receiverId: 'user-1',
    senderId: null,
    type: NotificationType.SYSTEM_ALERT,
    title: 'Title',
    message: 'Message',
    bookingId: null,
    isRead: false,
    createdAt: new Date('2026-05-13T00:00:00.000Z'),
    readAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    firebaseState = jest.requireMock('firebase-admin').__mockState;
    firebaseState.apps = [];
    firebaseState.sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });

    prisma = {
      notification: {
        create: jest.fn().mockResolvedValue(notification),
        findMany: jest.fn().mockResolvedValue([notification]),
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ token: 'fcm-token' }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    config = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    service = new NotificationService(prisma, config);
  });

  it('skips Firebase initialization when service account is absent', async () => {
    config.get.mockReturnValue(undefined);

    await service.onModuleInit();

    expect(firebaseState.initializeApp).not.toHaveBeenCalled();
  });

  it('initializes Firebase from configured service account', async () => {
    config.get.mockReturnValue(
      JSON.stringify({ projectId: 'dreamride', clientEmail: 'fcm@test' }),
    );

    await service.onModuleInit();

    expect(firebaseState.cert).toHaveBeenCalledWith({
      projectId: 'dreamride',
      clientEmail: 'fcm@test',
    });
    expect(firebaseState.initializeApp).toHaveBeenCalledTimes(1);
  });

  it('does not reinitialize Firebase when an app already exists', async () => {
    firebaseState.apps = [{}];
    config.get.mockReturnValue(JSON.stringify({ projectId: 'dreamride' }));

    await service.onModuleInit();

    expect(firebaseState.initializeApp).not.toHaveBeenCalled();
    expect((service as any).fcmInitialized).toBe(true);
  });

  it('creates a notification and does not block on push delivery', async () => {
    await (service as any).initializeFirebase();

    const result = await service.createNotification({
      receiverId: 'user-1',
      senderId: 'sender-1',
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Booking confirmed',
      message: 'Your booking was confirmed',
      bookingId: 'booking-1',
      data: { screen: 'booking' },
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        receiverId: 'user-1',
        senderId: 'sender-1',
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'Booking confirmed',
        message: 'Your booking was confirmed',
        bookingId: 'booking-1',
        isRead: false,
      },
    });
    expect(result.id).toBe('notification-1');
  });

  it('sends multicast push notifications and deactivates failed tokens', async () => {
    (service as any).fcmInitialized = true;
    prisma.$queryRaw.mockResolvedValue([
      { token: 'good-token' },
      { token: 'bad-token' },
    ]);
    firebaseState.sendEachForMulticast.mockResolvedValueOnce({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        { success: false, error: { message: 'not registered' } },
      ],
    });

    await (service as any).sendPushNotification({
      receiverId: 'user-1',
      type: NotificationType.PAYMENT_SUCCESS,
      title: 'Paid',
      message: 'Payment completed',
      bookingId: 'booking-1',
      data: { custom: 'value' },
    });

    expect(firebaseState.sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['good-token', 'bad-token'],
        notification: { title: 'Paid', body: 'Payment completed' },
        data: expect.objectContaining({
          type: NotificationType.PAYMENT_SUCCESS,
          bookingId: 'booking-1',
          custom: 'value',
        }),
      }),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('skips push delivery when FCM is disabled or no active tokens exist', async () => {
    await (service as any).sendPushNotification({
      receiverId: 'user-1',
      type: NotificationType.SYSTEM_ALERT,
      title: 'Title',
      message: 'Message',
    });

    expect(firebaseState.sendEachForMulticast).not.toHaveBeenCalled();

    (service as any).fcmInitialized = true;
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await (service as any).sendPushNotification({
      receiverId: 'user-1',
      type: NotificationType.SYSTEM_ALERT,
      title: 'Title',
      message: 'Message',
    });

    expect(firebaseState.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('registers and unregisters FCM tokens through raw SQL', async () => {
    await service.registerFcmToken('user-1', 'token-1', 'ios');
    await service.unregisterFcmToken('user-1', 'token-1');

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('returns notifications with unread counts', async () => {
    const result = await service.getUserNotifications('user-1', 25, 5);

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { receiverId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 25,
      skip: 5,
      include: {
        sender: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });
    expect(result.unreadCount).toBe(1);
    expect(result.notifications[0].id).toBe('notification-1');
  });

  it('marks notifications read and deletes only the current users notifications', async () => {
    await expect(service.getUnreadCount('user-1')).resolves.toBe(1);
    await service.markAsRead('user-1', ['notification-1']);
    await service.markAllAsRead('user-1');
    await service.deleteNotification('user-1', 'notification-1');

    expect(prisma.notification.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: { in: ['notification-1'] }, receiverId: 'user-1' },
        data: expect.objectContaining({ isRead: true }),
      }),
    );
    expect(prisma.notification.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { receiverId: 'user-1', isRead: false },
        data: expect.objectContaining({ isRead: true }),
      }),
    );
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { id: 'notification-1', receiverId: 'user-1' },
    });
  });
});
