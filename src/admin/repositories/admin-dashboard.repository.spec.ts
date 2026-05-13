import { BookingStatus, PaymentStatus } from '@prisma/client';
import { AdminDashboardRepository } from './admin-dashboard.repository';

describe('AdminDashboardRepository', () => {
  let repository: AdminDashboardRepository;
  let prisma: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-13T09:00:00.000Z'));
    prisma = {
      payment: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { amount: 1200 } })
          .mockResolvedValueOnce({ _sum: { amount: null } })
          .mockResolvedValue({ _sum: { amount: 50 } }),
      },
      booking: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([{ id: 'booking-1' }]),
      },
      user: {
        count: jest.fn().mockResolvedValue(4),
      },
      vehicle: {
        count: jest.fn().mockResolvedValue(5),
      },
    };
    repository = new AdminDashboardRepository(prisma);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aggregates completed payment revenue for current and previous periods', async () => {
    const currentStart = new Date('2026-05-01');
    const currentEnd = new Date('2026-05-31');
    const prevStart = new Date('2026-04-01');
    const prevEnd = new Date('2026-04-30');

    await expect(
      repository.getRevenueStats(currentStart, currentEnd, prevStart, prevEnd),
    ).resolves.toEqual({ current: 1200, previous: 0 });

    expect(prisma.payment.aggregate).toHaveBeenNthCalledWith(1, {
      where: {
        status: PaymentStatus.COMPLETED,
        paidAt: { gte: currentStart, lte: currentEnd },
      },
      _sum: { amount: true },
    });
  });

  it('counts booking and user stats with period filters', async () => {
    await expect(
      repository.getBookingStats(
        new Date('2026-05-01'),
        new Date('2026-05-31'),
        new Date('2026-04-01'),
        new Date('2026-04-30'),
      ),
    ).resolves.toEqual({
      total: 3,
      active: 3,
      pending: 3,
      current: 3,
      previous: 3,
    });

    expect(prisma.booking.count).toHaveBeenCalledWith({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.ONGOING] },
      },
    });

    await expect(
      repository.getUserStats(
        new Date('2026-05-01'),
        new Date('2026-05-31'),
        new Date('2026-04-01'),
        new Date('2026-04-30'),
      ),
    ).resolves.toEqual({ total: 4, currentNew: 4, prevNew: 4 });
  });

  it('counts vehicle statuses', async () => {
    await expect(repository.getVehicleStats()).resolves.toEqual({
      total: 5,
      available: 5,
      rented: 5,
      maintenance: 5,
      pendingApproval: 5,
    });

    expect(prisma.vehicle.count).toHaveBeenCalledWith({
      where: { status: 'PENDING_APPROVAL' },
    });
  });

  it('builds monthly chart rows and fetches recent transactions', async () => {
    prisma.payment.aggregate.mockReset().mockResolvedValue({
      _sum: { amount: 50 },
    });
    const chart = await repository.getChartData(2);

    expect(chart).toEqual([
      { month: 'Apr', revenue: 50, bookings: 3 },
      { month: 'May', revenue: 50, bookings: 3 },
    ]);
    expect(prisma.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: PaymentStatus.COMPLETED }),
      }),
    );

    await expect(repository.getRecentTransactions()).resolves.toEqual([
      { id: 'booking-1' },
    ]);
    expect(prisma.booking.findMany).toHaveBeenCalledWith({
      include: {
        renter: { select: { id: true, fullName: true } },
        vehicle: { select: { id: true, model: true, brand: true } },
        payment: { select: { amount: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  });
});
