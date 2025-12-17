import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { NotificationEntity } from './entities/notification.entity';
import { MarkAsReadDto, RegisterFcmTokenDto } from './dto/notification.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: 'Get user notifications',
    description: 'Get all notifications for the current user',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'List of notifications',
  })
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<{ notifications: NotificationEntity[]; unreadCount: number }> {
    return this.notificationService.getUserNotifications(
      userId,
      limit ? parseInt(String(limit)) : 50,
      offset ? parseInt(String(offset)) : 0,
    );
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notifications count',
    description:
      'Returns only the number of unread notifications for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread count',
    schema: {
      oneOf: [
        { type: 'object', example: { count: 8 } },
        { type: 'integer', example: 8 },
      ],
    },
  })
  async getUnreadCount(
    @CurrentUser('id') userId: string,
  ): Promise<{ count: number }> {
    const count = await this.notificationService.getUnreadCount(userId);
    return { count };
  }

  @Patch('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark notifications as read',
    description: 'Mark specific notifications as read',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications marked as read',
  })
  async markAsRead(
    @CurrentUser('id') userId: string,
    @Body() dto: MarkAsReadDto,
  ): Promise<{ success: boolean }> {
    await this.notificationService.markAsRead(userId, dto.notificationIds);
    return { success: true };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Mark all notifications as read for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read',
  })
  async markAllAsRead(
    @CurrentUser('id') userId: string,
  ): Promise<{ success: boolean }> {
    await this.notificationService.markAllAsRead(userId);
    return { success: true };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete notification',
    description: 'Delete a specific notification',
  })
  @ApiResponse({
    status: 204,
    description: 'Notification deleted',
  })
  async deleteNotification(
    @CurrentUser('id') userId: string,
    @Param('id') notificationId: string,
  ): Promise<void> {
    await this.notificationService.deleteNotification(userId, notificationId);
  }

  @Post('fcm-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register FCM token',
    description: 'Register device token for push notifications',
  })
  @ApiResponse({
    status: 201,
    description: 'FCM token registered',
  })
  async registerFcmToken(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterFcmTokenDto,
  ): Promise<{ success: boolean }> {
    await this.notificationService.registerFcmToken(
      userId,
      dto.token,
      dto.platform,
    );
    return { success: true };
  }

  @Delete('fcm-token/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unregister FCM token',
    description: 'Unregister device token',
  })
  @ApiResponse({
    status: 204,
    description: 'FCM token unregistered',
  })
  async unregisterFcmToken(
    @CurrentUser('id') userId: string,
    @Param('token') token: string,
  ): Promise<void> {
    await this.notificationService.unregisterFcmToken(userId, token);
  }
}
