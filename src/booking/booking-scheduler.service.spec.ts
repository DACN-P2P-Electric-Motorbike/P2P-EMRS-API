import { BookingStatus, PaymentStatus } from '@prisma/client';
import { BookingSchedulerService } from './booking-scheduler.service';

const mockPrisma = () => ({
  booking: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
});

describe('BookingSchedulerService', () => {
  let service: BookingSchedulerService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new BookingSchedulerService(prisma as any);
    jest.clearAllMocks();
  });

  it('auto-cancels stale pending bookings after 24 hours', async () => {
    prisma.booking.findMany.mockResolvedValue([{ id: 'booking-1' }]);
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });

    await service.expireStalePendingBookings();

    expect(prisma.booking.findMany).toHaveBeenCalledWith({
      where: {
        status: BookingStatus.PENDING,
        createdAt: { lt: expect.any(Date) },
      },
      select: { id: true },
    });
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['booking-1'] } },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason:
          'Tự động hủy: không có phản hồi từ chủ xe sau 24 giờ',
      },
    });
  });

  it('auto-cancels confirmed bookings that reached pickup time without completed payment', async () => {
    prisma.booking.findMany.mockResolvedValue([
      { id: 'unpaid', payment: null },
      { id: 'pending-payment', payment: { status: PaymentStatus.PENDING } },
      { id: 'paid', payment: { status: PaymentStatus.COMPLETED } },
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
        payment: { select: { status: true } },
      },
    });
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['unpaid', 'pending-payment'] } },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason:
          'Tự động hủy: chưa hoàn tất thanh toán trước giờ nhận xe',
        cancelledAt: expect.any(Date),
      },
    });
  });

  it('does not update when every overdue confirmed booking is paid', async () => {
    prisma.booking.findMany.mockResolvedValue([
      { id: 'paid', payment: { status: PaymentStatus.COMPLETED } },
    ]);

    await service.cancelUnpaidConfirmedBookings();

    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });
});
