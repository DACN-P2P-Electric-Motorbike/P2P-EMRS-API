import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationGateway } from './notification.gateway';

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;
  let jwtService: jest.Mocked<JwtService>;
  let client: any;
  let server: any;

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;
    const config = {
      get: jest.fn().mockReturnValue('jwt-secret'),
    } as unknown as ConfigService;

    gateway = new NotificationGateway(jwtService, config);
    server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    gateway.server = server;
    client = {
      id: 'socket-1',
      handshake: { auth: { token: 'jwt' }, headers: {} },
      data: {},
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
  });

  it('accepts a valid JWT connection and stores the user socket', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      roles: ['RENTER'],
    });

    await gateway.handleConnection(client);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('jwt', {
      secret: 'jwt-secret',
    });
    expect(client.join).toHaveBeenCalledWith('user_user-1');
    expect(client.emit).toHaveBeenCalledWith('connected', {
      message: 'Connected to notification service',
      userId: 'user-1',
    });
    expect(gateway.isUserOnline('user-1')).toBe(true);
    expect(gateway.getOnlineUsersCount()).toBe(1);
  });

  it('rejects missing tokens and invalid JWT payloads', async () => {
    client.handshake.auth = {};

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledTimes(1);

    client.disconnect.mockClear();
    client.handshake.headers.authorization = 'Bearer header-token';
    jwtService.verifyAsync.mockResolvedValue({});

    await gateway.handleConnection(client);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('header-token', {
      secret: 'jwt-secret',
    });
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it('removes user socket mappings on disconnect', async () => {
    jwtService.verifyAsync.mockResolvedValue({ id: 'user-1', role: 'OWNER' });
    await gateway.handleConnection(client);

    gateway.handleDisconnect(client);

    expect(gateway.isUserOnline('user-1')).toBe(false);
    expect(gateway.getOnlineUsersCount()).toBe(0);
  });

  it('sends and broadcasts socket events to the expected rooms', () => {
    gateway.sendToUser('user-1', 'notification', { id: 'n1' });
    gateway.sendToUsers(['user-1', 'user-2'], 'refresh', {});
    gateway.broadcastBookingUpdate('booking-1', 'booking_updated', {
      id: 'booking-1',
    });
    gateway.broadcastToAdmins('admin_event', { id: 'event-1' });

    expect(server.to).toHaveBeenCalledWith('user_user-1');
    expect(server.to).toHaveBeenCalledWith('user_user-2');
    expect(server.to).toHaveBeenCalledWith('booking_booking-1');
    expect(server.to).toHaveBeenCalledWith('admin_room');
  });

  it('handles booking subscriptions and admin room authorization', () => {
    expect(
      gateway.handleSubscribeBooking({ bookingId: 'booking-1' }, client),
    ).toEqual({
      event: 'subscribed',
      data: { bookingId: 'booking-1' },
    });
    expect(client.join).toHaveBeenCalledWith('booking_booking-1');

    expect(
      gateway.handleUnsubscribeBooking({ bookingId: 'booking-1' }, client),
    ).toEqual({
      event: 'unsubscribed',
      data: { bookingId: 'booking-1' },
    });
    expect(client.leave).toHaveBeenCalledWith('booking_booking-1');

    client.data = { userId: 'admin-1', role: ['ADMIN'] };
    expect(gateway.handleJoinAdminRoom(client)).toEqual({
      event: 'joined_admin_room',
      data: { success: true },
    });
    expect(client.join).toHaveBeenCalledWith('admin_room');

    client.data = { userId: 'user-1', role: 'RENTER' };
    expect(gateway.handleJoinAdminRoom(client)).toEqual({
      event: 'error',
      data: { message: 'Unauthorized' },
    });
  });
});
