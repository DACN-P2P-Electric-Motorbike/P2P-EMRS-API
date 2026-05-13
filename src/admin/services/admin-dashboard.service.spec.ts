import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDashboardRepository } from '../repositories/admin-dashboard.repository';
import { DashboardPeriod } from '../dto/dashboard-query.dto';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let repository: jest.Mocked<AdminDashboardRepository>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-13T09:00:00.000Z'));
    repository = {
      getRevenueStats: jest.fn().mockResolvedValue({
        current: 1200,
        previous: 1000,
      }),
      getBookingStats: jest.fn().mockResolvedValue({
        total: 30,
        active: 4,
        pending: 3,
        current: 12,
        previous: 6,
      }),
      getUserStats: jest.fn().mockResolvedValue({
        total: 20,
        currentNew: 5,
        prevNew: 0,
      }),
      getVehicleStats: jest.fn().mockResolvedValue({
        total: 10,
        available: 7,
        rented: 1,
        maintenance: 1,
        pendingApproval: 1,
      }),
      getChartData: jest.fn().mockResolvedValue([{ month: 'May', revenue: 1 }]),
      getRecentTransactions: jest.fn().mockResolvedValue([
        {
          id: 'booking-1',
          renter: { fullName: 'Renter One' },
          vehicle: { brand: 'VinFast', model: 'Klara' },
          payment: { amount: 150 },
          totalPrice: 140,
          status: 'COMPLETED',
          createdAt: new Date('2026-05-10T00:00:00.000Z'),
        },
        {
          id: 'booking-2',
          renter: null,
          vehicle: null,
          payment: null,
          totalPrice: 90,
          status: 'PENDING',
          createdAt: new Date('2026-05-11T00:00:00.000Z'),
        },
      ]),
    } as unknown as jest.Mocked<AdminDashboardRepository>;

    service = new AdminDashboardService(repository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aggregates dashboard metrics and maps recent transactions', async () => {
    const result = await service.getDashboard({
      period: DashboardPeriod.THIS_MONTH,
    });

    expect(result.metrics.revenue).toEqual({
      total: 1200,
      previous_period: 1000,
      growth_percent: 20,
    });
    expect(result.metrics.bookings.growth_percent).toBe(100);
    expect(result.metrics.users.growth_percent).toBe(100);
    expect(result.metrics.vehicles.total).toBe(10);
    expect(result.chart_data).toEqual([{ month: 'May', revenue: 1 }]);
    expect(result.recent_transactions).toEqual([
      {
        id: 'booking-1',
        user_name: 'Renter One',
        vehicle_name: 'VinFast Klara',
        amount: 150,
        status: 'COMPLETED',
        date: '2026-05-10T00:00:00.000Z',
      },
      {
        id: 'booking-2',
        user_name: '',
        vehicle_name: '',
        amount: 90,
        status: 'PENDING',
        date: '2026-05-11T00:00:00.000Z',
      },
    ]);
  });

  it('resolves built-in date periods and custom date ranges', async () => {
    await service.getDashboard({ period: DashboardPeriod.LAST_MONTH });
    expect(repository.getRevenueStats).toHaveBeenLastCalledWith(
      new Date(2026, 3, 1),
      new Date(2026, 4, 0, 23, 59, 59, 999),
      new Date(2026, 2, 1),
      new Date(2026, 3, 0, 23, 59, 59, 999),
    );

    await service.getDashboard({ period: DashboardPeriod.THIS_YEAR });
    expect(repository.getRevenueStats).toHaveBeenLastCalledWith(
      new Date(2026, 0, 1),
      new Date(2026, 11, 31, 23, 59, 59, 999),
      new Date(2025, 0, 1),
      new Date(2025, 11, 31, 23, 59, 59, 999),
    );

    await service.getDashboard({ period: DashboardPeriod.ALL_TIME });
    expect(repository.getRevenueStats.mock.calls.at(-1)?.[0]).toEqual(
      new Date(0),
    );

    await service.getDashboard({
      startDate: '2026-05-01',
      endDate: '2026-05-10',
    });
    expect(repository.getRevenueStats).toHaveBeenLastCalledWith(
      new Date('2026-05-01T00:00:00.000Z'),
      new Date('2026-05-10T16:59:59.999Z'),
      new Date('2026-04-21T07:00:00.000Z'),
      new Date('2026-04-30T23:59:59.999Z'),
    );
  });

  it('returns zero growth when current and previous values are zero', async () => {
    repository.getRevenueStats.mockResolvedValueOnce({
      current: 0,
      previous: 0,
    });

    const result = await service.getDashboard({});

    expect(result.metrics.revenue.growth_percent).toBe(0);
  });
});
