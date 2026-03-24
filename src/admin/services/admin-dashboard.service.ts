import { Injectable, Logger } from '@nestjs/common';
import { AdminDashboardRepository } from '../repositories/admin-dashboard.repository';
import { DashboardQueryDto, DashboardPeriod } from '../dto/dashboard-query.dto';

interface DateRange {
  start: Date;
  end: Date;
}

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(private readonly dashboardRepository: AdminDashboardRepository) {}

  /**
   * Resolve period string or custom dates into DateRange objects
   */
  private resolvePeriods(query: DashboardQueryDto): {
    current: DateRange;
    previous: DateRange;
  } {
    const now = new Date();

    // Custom date range overrides period
    if (query.startDate && query.endDate) {
      const start = new Date(query.startDate);
      const end = new Date(new Date(query.endDate).setHours(23, 59, 59, 999));
      const durationMs = end.getTime() - start.getTime();

      // Previous period has same duration, ending just before current
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - durationMs);

      return {
        current: { start, end },
        previous: { start: prevStart, end: prevEnd },
      };
    }

    const period = query.period ?? DashboardPeriod.THIS_MONTH;

    switch (period) {
      case DashboardPeriod.THIS_MONTH: {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        );
        const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevEnd = new Date(
          now.getFullYear(),
          now.getMonth(),
          0,
          23,
          59,
          59,
          999,
        );
        return {
          current: { start, end },
          previous: { start: prevStart, end: prevEnd },
        };
      }

      case DashboardPeriod.LAST_MONTH: {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(
          now.getFullYear(),
          now.getMonth(),
          0,
          23,
          59,
          59,
          999,
        );
        const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const prevEnd = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          0,
          23,
          59,
          59,
          999,
        );
        return {
          current: { start, end },
          previous: { start: prevStart, end: prevEnd },
        };
      }

      case DashboardPeriod.THIS_YEAR: {
        const start = new Date(now.getFullYear(), 0, 1);
        const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        const prevStart = new Date(now.getFullYear() - 1, 0, 1);
        const prevEnd = new Date(
          now.getFullYear() - 1,
          11,
          31,
          23,
          59,
          59,
          999,
        );
        return {
          current: { start, end },
          previous: { start: prevStart, end: prevEnd },
        };
      }

      case DashboardPeriod.ALL_TIME:
      default: {
        const start = new Date(0); // epoch
        const end = now;
        return {
          current: { start, end },
          previous: { start: new Date(0), end: new Date(0) },
        };
      }
    }
  }

  /**
   * Calculate percentage growth. Returns 0 when previous is 0.
   */
  private calcGrowth(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Number.parseFloat(
      (((current - previous) / previous) * 100).toFixed(2),
    );
  }

  /**
   * Main dashboard aggregation
   */
  async getDashboard(query: DashboardQueryDto) {
    const { current, previous } = this.resolvePeriods(query);

    this.logger.log(
      `Fetching dashboard: ${current.start.toISOString()} → ${current.end.toISOString()}`,
    );

    const [
      revenueStats,
      bookingStats,
      userStats,
      vehicleStats,
      chartData,
      recentTransactions,
    ] = await Promise.all([
      this.dashboardRepository.getRevenueStats(
        current.start,
        current.end,
        previous.start,
        previous.end,
      ),
      this.dashboardRepository.getBookingStats(
        current.start,
        current.end,
        previous.start,
        previous.end,
      ),
      this.dashboardRepository.getUserStats(
        current.start,
        current.end,
        previous.start,
        previous.end,
      ),
      this.dashboardRepository.getVehicleStats(),
      this.dashboardRepository.getChartData(12),
      this.dashboardRepository.getRecentTransactions(10),
    ]);

    return {
      metrics: {
        revenue: {
          total: revenueStats.current,
          previous_period: revenueStats.previous,
          growth_percent: this.calcGrowth(
            revenueStats.current,
            revenueStats.previous,
          ),
        },
        bookings: {
          total: bookingStats.total,
          active: bookingStats.active,
          pending: bookingStats.pending,
          this_period: bookingStats.current,
          growth_percent: this.calcGrowth(
            bookingStats.current,
            bookingStats.previous,
          ),
        },
        users: {
          total: userStats.total,
          new_this_period: userStats.currentNew,
          growth_percent: this.calcGrowth(
            userStats.currentNew,
            userStats.prevNew,
          ),
        },
        vehicles: vehicleStats,
      },
      chart_data: chartData,
      recent_transactions: recentTransactions.map((b) => ({
        id: b.id,
        user_name: b.renter?.fullName ?? '',
        vehicle_name: b.vehicle ? `${b.vehicle.brand} ${b.vehicle.model}` : '',
        amount: b.payment?.amount ?? b.totalPrice,
        status: b.status,
        date: b.createdAt.toISOString(),
      })),
    };
  }
}
