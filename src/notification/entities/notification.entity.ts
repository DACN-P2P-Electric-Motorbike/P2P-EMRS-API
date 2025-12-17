import { ApiProperty } from '@nestjs/swagger';
import { Notification, NotificationType } from '@prisma/client';
import { Expose } from 'class-transformer';

export class NotificationEntity implements Notification {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  receiverId: string;

  @ApiProperty()
  @Expose()
  senderId: string | null;

  @ApiProperty({ enum: NotificationType })
  @Expose()
  type: NotificationType;

  @ApiProperty()
  @Expose()
  title: string;

  @ApiProperty()
  @Expose()
  message: string;

  @ApiProperty()
  @Expose()
  bookingId: string | null;

  @ApiProperty()
  @Expose()
  isRead: boolean;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  readAt: Date | null;

  constructor(partial: Partial<NotificationEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(notification: Notification): NotificationEntity {
    return new NotificationEntity(notification);
  }
}