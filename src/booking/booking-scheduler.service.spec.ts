import { BookingStatus, NotificationType, PaymentStatus } from '@prisma/client';
import { BookingSchedulerService } from './booking-scheduler.service';

const mockPrisma = () => ({
  booking: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  notification: {
    findFirst: jest.fn(),
  },
});

describe('BookingSchedulerService', () => {
  let service: BookingSchedulerService;
  let prisma: ReturnType<typeof mockPrisma>;
  const eventEmitter = { emit: jest.fn() };

  beforeEach(() => {
    prisma = mockPrisma();
    service = new BookingSchedulerService(prisma as any, eventEmitter as any);
    jest.clearAllMocks();
  });

  it('auto-cancels stale pending bookings after 24 hours', async () => {
    prisma.booking.findMany.mockResolvedValue([
      { id: 'booking-1', renterId: 'renter-1', ownerId: 'owner-1' },
    ]);
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });

    await service.expireStalePendingBookings();

    expect(prisma.booking.findMany).toHaveBeenCalledWith({
      where: {
        status: BookingStatus.PENDING,
        createdAt: { lt: expect.any(Date) },
      },
      select: { id: true, renterId: true, ownerId: true },
    });
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['booking-1'] } },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason:
          'Tự động hủy: không có phản hồi từ chủ xe sau 24 giờ',
        cancelledBy: 'OWNER',
        cancelledAt: expect.any(Date),
      },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'booking.cancelled',
      expect.any(Object),
    );
  });

  it('auto-cancels confirmed bookings that reached pickup time without completed payment', async () => {
    prisma.booking.findMany.mockResolvedValue([
      { id: 'unpaid', renterId: 'r1', ownerId: 'o1', payment: null },
      {
        id: 'pending-payment',
        renterId: 'r2',
        ownerId: 'o2',
        payment: { status: PaymentStatus.PENDING },
      },
      {
        id: 'paid',
        renterId: 'r3',
        ownerId: 'o3',
        payment: { status: PaymentStatus.COMPLETED },
      },
    ]);
    prisma.booking.updateMany.mockResolvedValue({ count: 2 });

    await service.cancelUnpaidConfirmedBookings();

    expect(prisma.booking.findMany).toHaveBeenCalledWith({
      where: {
        status: BookingStatus.CONFIRMED,
        startTime: { lte: expect.any(Date) },
      },
      select: {
        id: true,
        renterId: true,
        ownerId: true,
        payment: { select: { status: true } },
      },
    });
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['unpaid', 'pending-payment'] } },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason:
          'Tự động hủy: chưa hoàn tất thanh toán trước giờ nhận xe',
        cancelledBy: 'RENTER',
        cancelledAt: expect.any(Date),
      },
    });
    expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
  });

  it('does not update when every overdue confirmed booking is paid', async () => {
    prisma.booking.findMany.mockResolvedValue([
      { id: 'paid', payment: { status: PaymentStatus.COMPLETED } },
    ]);

    await service.cancelUnpaidConfirmedBookings();

    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('sends deduped pickup reminders to booking participants', async () => {
    const notificationService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };
    const notificationGateway = {
      isUserOnline: jest.fn().mockReturnValue(true),
      sendToUser: jest.fn(),
    };
    service = new BookingSchedulerService(
      prisma as any,
      eventEmitter as any,
      notificationService as any,
      notificationGateway as any,
    );
    const booking = {
      id: 'booking-1',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      startTime: new Date('2026-05-24T03:30:00.000Z'),
      endTime: new Date('2026-05-24T05:30:00.000Z'),
    };
    prisma.booking.findMany
      .mockResolvedValueOnce([booking])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.notification.findFirst.mockResolvedValue(null);

    await service.sendThresholdReminders();

    expect(prisma.booking.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        status: BookingStatus.CONFIRMED,
        startTime: { gte: expect.any(Date), lte: expect.any(Date) },
        payment: { is: { status: PaymentStatus.COMPLETED } },
      },
      select: {
        id: true,
        renterId: true,
        ownerId: true,
        startTime: true,
        endTime: true,
      },
    });
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'renter-1',
        type: NotificationType.BOOKING_REMINDER,
        title: 'Sắp đến giờ nhận xe',
        bookingId: 'booking-1',
        data: expect.objectContaining({
          recipientRole: 'renter',
          reminderKind: 'PICKUP_SOON',
        }),
      }),
    );
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'owner-1',
        type: NotificationType.BOOKING_REMINDER,
        title: 'Sắp đến giờ nhận xe',
        bookingId: 'booking-1',
        data: expect.objectContaining({
          recipientRole: 'owner',
          reminderKind: 'PICKUP_SOON',
        }),
      }),
    );
    expect(notificationGateway.sendToUser).toHaveBeenCalledWith(
      'renter-1',
      'booking_reminder',
      expect.objectContaining({
        bookingId: 'booking-1',
        reminderKind: 'PICKUP_SOON',
      }),
    );
  });

  it('sends late-return alerts for ongoing trips without check-out', async () => {
    const notificationService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };
    const notificationGateway = {
      isUserOnline: jest.fn().mockReturnValue(false),
      sendToUser: jest.fn(),
    };
    service = new BookingSchedulerService(
      prisma as any,
      eventEmitter as any,
      notificationService as any,
      notificationGateway as any,
    );
    const booking = {
      id: 'late-booking',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      startTime: new Date('2026-05-24T01:00:00.000Z'),
      endTime: new Date('2026-05-24T03:00:00.000Z'),
    };
    prisma.booking.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([booking]);
    prisma.notification.findFirst.mockResolvedValue(null);

    await service.sendThresholdReminders();

    expect(prisma.booking.findMany).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        where: expect.objectContaining({
          status: BookingStatus.ONGOING,
          endTime: { lte: expect.any(Date) },
        }),
      }),
    );
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'renter-1',
        type: NotificationType.TRIP_REMINDER,
        title: 'Xe đang trả muộn',
        bookingId: 'late-booking',
        data: expect.objectContaining({
          recipientRole: 'renter',
          reminderKind: 'LATE_RETURN',
        }),
      }),
    );
    expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
  });
});
