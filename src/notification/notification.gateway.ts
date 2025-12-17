import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Extract JWT token from handshake
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`Client ${client.id} rejected: No token provided`);
        client.disconnect();
        return;
      }

      // Verify JWT
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get('JWT_SECRET'),
      });

      const userId = payload.sub || payload.id;

      if (!userId) {
        this.logger.warn(`Client ${client.id} rejected: Invalid token payload`);
        client.disconnect();
        return;
      }

      // Store user-socket mapping
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      // Store userId in socket data
      client.data.userId = userId;

      // Join user's personal room
      client.join(`user_${userId}`);

      this.logger.log(`User ${userId} connected via socket ${client.id}`);
      this.logger.debug(`Active connections for user ${userId}: ${this.userSockets.get(userId)!.size}`);

      // Send connection confirmation
      client.emit('connected', {
        message: 'Connected to notification service',
        userId,
      });
    } catch (error) {
      this.logger.error(`Connection error for client ${client.id}:`, error.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;

    if (userId) {
      const userSocketSet = this.userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(client.id);
        if (userSocketSet.size === 0) {
          this.userSockets.delete(userId);
        }
      }
      this.logger.log(`User ${userId} disconnected from socket ${client.id}`);
    } else {
      this.logger.log(`Client ${client.id} disconnected`);
    }
  }

  /**
   * Send notification to specific user
   */
  sendToUser(userId: string, event: string, data: any) {
    const room = `user_${userId}`;
    this.server.to(room).emit(event, data);
    this.logger.debug(`Sent ${event} to user ${userId}`);
  }

  /**
   * Send notification to multiple users
   */
  sendToUsers(userIds: string[], event: string, data: any) {
    userIds.forEach((userId) => {
      this.sendToUser(userId, event, data);
    });
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  /**
   * Get online users count
   */
  getOnlineUsersCount(): number {
    return this.userSockets.size;
  }

  /**
   * Client subscribes to booking updates
   */
  @SubscribeMessage('subscribe_booking')
  handleSubscribeBooking(
    @MessageBody() data: { bookingId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `booking_${data.bookingId}`;
    client.join(room);
    this.logger.debug(`Socket ${client.id} subscribed to ${room}`);
    return { event: 'subscribed', data: { bookingId: data.bookingId } };
  }

  /**
   * Client unsubscribes from booking updates
   */
  @SubscribeMessage('unsubscribe_booking')
  handleUnsubscribeBooking(
    @MessageBody() data: { bookingId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `booking_${data.bookingId}`;
    client.leave(room);
    this.logger.debug(`Socket ${client.id} unsubscribed from ${room}`);
    return { event: 'unsubscribed', data: { bookingId: data.bookingId } };
  }

  /**
   * Broadcast booking update to all subscribers
   */
  broadcastBookingUpdate(bookingId: string, event: string, data: any) {
    const room = `booking_${bookingId}`;
    this.server.to(room).emit(event, data);
    this.logger.debug(`Broadcast ${event} to ${room}`);
  }
}