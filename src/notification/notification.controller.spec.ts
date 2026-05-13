import { NotificationType } from '@prisma/client';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

describe('NotificationController', () => {
  let controller: NotificationController;
  let service: jest.Mocked<NotificationService>;

  beforeEach(() => {
    service = {
      getUserNotifications: jest.fn(),
      getUnreadCount: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      deleteNotification: jest.fn(),
      registerFcmToken: jest.fn(),
      unregisterFcmToken: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    controller = new NotificationController(service);
  });

  it('parses pagination query params with defaults', async () => {
    const response = {
      notifications: [
        {
          id: 'notification-1',
          receiverId: 'user-1',
          senderId: null,
          type: NotificationType.SYSTEM_ALERT,
          title: 'Title',
          message: 'Message',
          bookingId: null,
          isRead: false,
          createdAt: new Date(),
          readAt: null,
        },
      ],
      unreadCount: 1,
    };
    service.getUserNotifications.mockResolvedValue(response);

    await expect(
      controller.getNotifications('user-1', '25' as any, '5' as any),
    ).resolves.toBe(response);
    await controller.getNotifications('user-1');

    expect(service.getUserNotifications).toHaveBeenNthCalledWith(
      1,
      'user-1',
      25,
      5,
    );
    expect(service.getUserNotifications).toHaveBeenNthCalledWith(
      2,
      'user-1',
      50,
      0,
    );
  });

  it('wraps unread counts and write operations in simple API responses', async () => {
    service.getUnreadCount.mockResolvedValue(7);

    await expect(controller.getUnreadCount('user-1')).resolves.toEqual({
      count: 7,
    });
    await expect(
      controller.markAsRead('user-1', { notificationIds: ['n1', 'n2'] }),
    ).resolves.toEqual({ success: true });
    await expect(controller.markAllAsRead('user-1')).resolves.toEqual({
      success: true,
    });
    await expect(
      controller.registerFcmToken('user-1', {
        token: 'token-1',
        platform: 'android',
      }),
    ).resolves.toEqual({ success: true });

    expect(service.markAsRead).toHaveBeenCalledWith('user-1', ['n1', 'n2']);
    expect(service.markAllAsRead).toHaveBeenCalledWith('user-1');
    expect(service.registerFcmToken).toHaveBeenCalledWith(
      'user-1',
      'token-1',
      'android',
    );
  });

  it('delegates delete and FCM unregister commands', async () => {
    await controller.deleteNotification('user-1', 'notification-1');
    await controller.unregisterFcmToken('user-1', 'token-1');

    expect(service.deleteNotification).toHaveBeenCalledWith(
      'user-1',
      'notification-1',
    );
    expect(service.unregisterFcmToken).toHaveBeenCalledWith(
      'user-1',
      'token-1',
    );
  });
});
