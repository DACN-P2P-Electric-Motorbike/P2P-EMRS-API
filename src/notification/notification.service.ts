import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationType } from '@prisma/client';
import * as admin from 'firebase-admin';

interface NotificationPayload {
  receiverId: string;
  senderId?: string;
  type: NotificationType;
  title: string;
  message: string;
  bookingId?: string;
  data?: Record<string, string>;
}

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private fcmInitialized = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.initializeFirebase();
  }

  private async initializeFirebase() {
    try {
      const serviceAccount = this.config.get('FIREBASE_SERVICE_ACCOUNT');

      if (!serviceAccount) {
        this.logger.warn(
          'Firebase service account not configured. Push notifications disabled.',
        );
        return;
      }

      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(serviceAccount)),
        });
        this.fcmInitialized = true;
        this.logger.log('Firebase Admin SDK initialized successfully');
      }
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error);
    }
  }

  /**
   * Create notification and send push
   */
  async createNotification(
    payload: NotificationPayload,
  ): Promise<NotificationEntity> {
    // Save to database
    const notification = await this.prisma.notification.create({
      data: {
        receiverId: payload.receiverId,
        senderId: payload.senderId ?? null,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        bookingId: payload.bookingId ?? null,
        isRead: false,
      },
    });

    this.logger.log(
      `Notification created: ${notification.id} for user ${payload.receiverId}`,
    );

    // Send push notification (async, don't block)
    this.sendPushNotification(payload).catch((error) => {
      this.logger.error('Failed to send push notification', error);
    });

    return NotificationEntity.fromPrisma(notification);
  }

  /**
   * Send push notification via FCM
   */
  private async sendPushNotification(
    payload: NotificationPayload,
  ): Promise<void> {
    if (!this.fcmInitialized) {
      this.logger.debug('FCM not initialized, skipping push notification');
      return;
    }

    try {
      // Get user's FCM tokens
      const tokens = await this.prisma.$queryRaw<any[]>`
        SELECT token FROM fcm_tokens 
        WHERE user_id = ${payload.receiverId} 
        AND is_active = true
      `;

      if (tokens.length === 0) {
        this.logger.debug(`No FCM tokens found for user ${payload.receiverId}`);
        return;
      }

      const fcmTokens = tokens.map((t) => t.token);

      // Prepare FCM message
      const message: admin.messaging.MulticastMessage = {
        tokens: fcmTokens,
        notification: {
          title: payload.title,
          body: payload.message,
        },
        data: {
          type: payload.type,
          bookingId: payload.bookingId ?? '',
          ...payload.data,
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'booking_notifications',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      // Send to all devices
      const response = await admin.messaging().sendEachForMulticast(message);

      this.logger.log(
        `Push notification sent: ${response.successCount}/${fcmTokens.length} successful`,
      );

      // Handle failed tokens
      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(fcmTokens[idx]);
            this.logger.warn(`Failed to send to token: ${resp.error?.message}`);
          }
        });

        // Deactivate invalid tokens
        if (failedTokens.length > 0) {
          await this.prisma.$executeRaw`
            UPDATE fcm_tokens 
            SET is_active = false 
            WHERE token = ANY(${failedTokens}::text[])
          `;
        }
      }
    } catch (error) {
      this.logger.error('Error sending push notification', error);
      throw error;
    }
  }

  /**
   * Register FCM token
   */
  async registerFcmToken(
    userId: string,
    token: string,
    platform: 'android' | 'ios',
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO fcm_tokens (id, user_id, token, platform, created_at, updated_at)
      VALUES (gen_random_uuid(), ${userId}, ${token}, ${platform}, NOW(), NOW())
      ON CONFLICT (user_id, platform) 
      DO UPDATE SET 
        token = ${token},
        is_active = true,
        updated_at = NOW()
    `;

    this.logger.log(`FCM token registered for user ${userId} on ${platform}`);
  }

  /**
   * Unregister FCM token
   */
  async unregisterFcmToken(userId: string, token: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE fcm_tokens 
      SET is_active = false 
      WHERE user_id = ${userId} AND token = ${token}
    `;

    this.logger.log(`FCM token unregistered for user ${userId}`);
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ notifications: NotificationEntity[]; unreadCount: number }> {
    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { receiverId: userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          sender: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.notification.count({
        where: {
          receiverId: userId,
          isRead: false,
        },
      }),
    ]);

    return {
      notifications: notifications.map(NotificationEntity.fromPrisma),
      unreadCount,
    };
  }

  /**
   * Get only the unread notifications count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        receiverId: userId,
        isRead: false,
      },
    });
  }

  /**
   * Mark notifications as read
   */
  async markAsRead(userId: string, notificationIds: string[]): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        receiverId: userId,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    this.logger.log(
      `Marked ${notificationIds.length} notifications as read for user ${userId}`,
    );
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        receiverId: userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    this.logger.log(`Marked all notifications as read for user ${userId}`);
  }

  /**
   * Delete notification
   */
  async deleteNotification(
    userId: string,
    notificationId: string,
  ): Promise<void> {
    await this.prisma.notification.deleteMany({
      where: {
        id: notificationId,
        receiverId: userId,
      },
    });

    this.logger.log(`Notification ${notificationId} deleted`);
  }
}
