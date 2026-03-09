import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BookingStatus, PaymentStatus } from '@prisma/client';

@Injectable()
export class AdminDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get revenue stats for a given period and previous period (for growth calc)
   */
  async getRevenueStats(
    currentStart: Date,
    currentEnd: Date,
    prevStart: Date,
    prevEnd: Date,
  ) {
    const [currentRevenue, prevRevenue] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.COMPLETED,
          paidAt: { gte: currentStart, lte: currentEnd },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.COMPLETED,
          paidAt: { gte: prevStart, lte: prevEnd },
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      current: currentRevenue._sum.amount ?? 0,
      previous: prevRevenue._sum.amount ?? 0,
    };
  }

  /**
   * Get booking stats for a given period
   */
  async getBookingStats(
    currentStart: Date,
    currentEnd: Date,
    prevStart: Date,
    prevEnd: Date,
  ) {
    const [total, active, pending, currentPeriodCount, prevPeriodCount] =
      await Promise.all([
        this.prisma.booking.count(),
        this.prisma.booking.count({
          where: {
            status: { in: [BookingStatus.CONFIRMED, BookingStatus.ONGOING] },
          },
        }),
        this.prisma.booking.count({
          where: { status: BookingStatus.PENDING },
        }),
        this.prisma.booking.count({
          where: { createdAt: { gte: currentStart, lte: currentEnd } },
        }),
        this.prisma.booking.count({
          where: { createdAt: { gte: prevStart, lte: prevEnd } },
        }),
      ]);

    return {
      total,
      active,
      pending,
      current: currentPeriodCount,
      previous: prevPeriodCount,
    };
  }

  /**
   * Get user stats
   */
  async getUserStats(
    currentStart: Date,
    currentEnd: Date,
    prevStart: Date,
    prevEnd: Date,
  ) {
    const [total, currentNew, prevNew] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { createdAt: { gte: currentStart, lte: currentEnd } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: prevStart, lte: prevEnd } },
      }),
    ]);

    return { total, currentNew, prevNew };
  }

  /**
   * Get vehicle stats (count by status)
   */
  async getVehicleStats() {
    const [total, available, rented, maintenance, pendingApproval] =
      await Promise.all([
        this.prisma.vehicle.count(),
        this.prisma.vehicle.count({ where: { status: 'AVAILABLE' } }),
        this.prisma.vehicle.count({ where: { status: 'RENTED' } }),
        this.prisma.vehicle.count({ where: { status: 'MAINTENANCE' } }),
        this.prisma.vehicle.count({ where: { status: 'PENDING_APPROVAL' } }),
      ]);

    return { total, available, rented, maintenance, pendingApproval };
  }

  /**
   * Get monthly chart data (revenue + booking count) for the last N months
   */
  async getChartData(
    months: number,
  ): Promise<Array<{ month: string; revenue: number; bookings: number }>> {
    const results: Array<{ month: string; revenue: number; bookings: number }> =
      [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        0,
        23,
        59,
        59,
        999,
      );

      const [revenueAgg, bookingCount] = await Promise.all([
        this.prisma.payment.aggregate({
          where: {
            status: PaymentStatus.COMPLETED,
            paidAt: { gte: start, lte: end },
          },
          _sum: { amount: true },
        }),
        this.prisma.booking.count({
          where: { createdAt: { gte: start, lte: end } },
        }),
      ]);

      const monthLabel = start.toLocaleString('en-US', { month: 'short' });
      results.push({
        month: monthLabel,
        revenue: revenueAgg._sum.amount ?? 0,
        bookings: bookingCount,
      });
    }

    return results;
  }

  /**
   * Get recent transactions (latest bookings)
   */
  async getRecentTransactions(limit: number = 10) {
    return this.prisma.booking.findMany({
      include: {
        renter: { select: { id: true, fullName: true } },
        vehicle: { select: { id: true, model: true, brand: true } },
        payment: { select: { amount: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
