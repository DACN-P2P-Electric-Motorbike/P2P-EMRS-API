import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  BookingStatus,
  KycStatus,
  Prisma,
  TrustScoreEventType,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type TrustScoreMetadata = Prisma.InputJsonValue;

@Injectable()
export class TrustScoreService {
  private readonly logger = new Logger(TrustScoreService.name);
  private readonly MIN_SCORE = 0;
  private readonly MAX_SCORE = 150;
  private readonly WARNING_WINDOW_DAYS = 30;

  constructor(private readonly prisma: PrismaService) {}

  getTier(score: number) {
    if (score >= 120) {
      return {
        level: 5,
        label: 'Xuất sắc',
        maxConcurrentBookings: 5,
        canCreateBooking: true,
        canRegisterVehicle: true,
        searchRank: 4,
      };
    }
    if (score >= 90) {
      return {
        level: 4,
        label: 'Tốt',
        maxConcurrentBookings: 3,
        canCreateBooking: true,
        canRegisterVehicle: true,
        searchRank: 3,
      };
    }
    if (score >= 70) {
      return {
        level: 3,
        label: 'Trung bình',
        maxConcurrentBookings: 2,
        canCreateBooking: true,
        canRegisterVehicle: true,
        searchRank: 2,
      };
    }
    if (score >= 40) {
      return {
        level: 2,
        label: 'Thấp',
        maxConcurrentBookings: 1,
        canCreateBooking: true,
        canRegisterVehicle: false,
        searchRank: 1,
      };
    }
    return {
      level: 1,
      label: 'Rất thấp',
      maxConcurrentBookings: 0,
      canCreateBooking: false,
      canRegisterVehicle: false,
      searchRank: 0,
    };
  }

  async assertCanCreateBooking(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ForbiddenException('User is not allowed to create bookings');
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException('Blocked accounts cannot create bookings');
    }
    if (user.status === UserStatus.RESTRICTED || user.trustScore < 40) {
      throw new ForbiddenException(
        'Trust score is too low to create a new booking',
      );
    }

    const tier = this.getTier(user.trustScore);
    const activeBookings = await this.prisma.booking.count({
      where: {
        renterId: userId,
        status: {
          in: [
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
            BookingStatus.ONGOING,
          ],
        },
      },
    });

    if (activeBookings >= tier.maxConcurrentBookings) {
      throw new ForbiddenException(
        `Trust score tier allows ${tier.maxConcurrentBookings} active booking(s) at a time`,
      );
    }
  }

  async assertCanRegisterVehicle(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ForbiddenException('User is not allowed to register vehicles');
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException('Blocked accounts cannot register vehicles');
    }
    if (user.status === UserStatus.RESTRICTED || user.trustScore < 70) {
      throw new ForbiddenException(
        'Trust score must be at least 70 to register a new vehicle',
      );
    }
  }

  async recordPositiveEvent(
    userId: string,
    type: TrustScoreEventType,
    delta: number,
    reason?: string,
    metadata?: TrustScoreMetadata,
  ) {
    return this.applyDelta(userId, type, delta, reason, metadata);
  }

  async recordViolation(
    userId: string,
    type: TrustScoreEventType,
    delta: number,
    reason?: string,
    metadata?: TrustScoreMetadata,
    progressive = true,
  ) {
    if (!progressive) {
      return this.applyDelta(userId, type, -Math.abs(delta), reason, metadata);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const now = new Date();
    const activeWarning = await this.prisma.trustScoreWarning.findFirst({
      where: {
        userId,
        type,
        expiresAt: { gt: now },
        penalizedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeWarning) {
      const expiresAt = new Date(
        now.getTime() + this.WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
      await this.prisma.trustScoreWarning.create({
        data: { userId, type, reason, expiresAt },
      });
      const warningMetadata: Prisma.InputJsonObject = {
        ...((metadata as Prisma.InputJsonObject | undefined) ?? {}),
        violationType: type,
        expiresAt: expiresAt.toISOString(),
      };
      await this.prisma.trustScoreEvent.create({
        data: {
          userId,
          type: TrustScoreEventType.WARNING,
          delta: 0,
          scoreBefore: user.trustScore,
          scoreAfter: user.trustScore,
          reason,
          metadata: warningMetadata,
        },
      });
      this.logger.log(`Trust warning recorded for user ${userId}: ${type}`);
      return { warned: true, score: user.trustScore };
    }

    await this.prisma.trustScoreWarning.update({
      where: { id: activeWarning.id },
      data: { penalizedAt: now },
    });

    return this.applyDelta(userId, type, -Math.abs(delta), reason, metadata);
  }

  async recordTransactionMilestone(
    userId: string,
    completedTransactions: number,
  ) {
    if (completedTransactions > 0 && completedTransactions % 10 === 0) {
      return this.recordPositiveEvent(
        userId,
        TrustScoreEventType.TRANSACTION_MILESTONE,
        3,
        `Completed ${completedTransactions} transactions`,
        { completedTransactions },
      );
    }
    return null;
  }

  async recordManualAdjustment(
    userId: string,
    delta: number,
    reason: string,
    adminId?: string,
  ) {
    return this.applyDelta(
      userId,
      TrustScoreEventType.MANUAL_ADJUSTMENT,
      delta,
      reason,
      {
        adminId,
      },
    );
  }

  async getAdminOverview() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [users, recentEvents, activeWarnings] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          fullName: true,
          email: true,
          status: true,
          trustScore: true,
        },
        orderBy: { trustScore: 'asc' },
      }),
      this.prisma.trustScoreEvent.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.trustScoreWarning.findMany({
        where: { expiresAt: { gt: now }, createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const histogram = {
      veryLow: users.filter((user) => user.trustScore < 40).length,
      low: users.filter((user) => user.trustScore >= 40 && user.trustScore < 70)
        .length,
      medium: users.filter(
        (user) => user.trustScore >= 70 && user.trustScore < 90,
      ).length,
      good: users.filter(
        (user) => user.trustScore >= 90 && user.trustScore < 120,
      ).length,
      excellent: users.filter((user) => user.trustScore >= 120).length,
    };

    const eventDropsByUser = new Map<string, number>();
    for (const event of recentEvents) {
      if (event.delta < 0) {
        eventDropsByUser.set(
          event.userId,
          (eventDropsByUser.get(event.userId) ?? 0) + Math.abs(event.delta),
        );
      }
    }

    const rapidDropUserIds = new Set(
      [...eventDropsByUser.entries()]
        .filter(([, drop]) => drop > 20)
        .map(([userId]) => userId),
    );

    return {
      histogram,
      alerts: {
        lowScoreUsers: users.filter(
          (user) =>
            user.trustScore < 40 || user.status === UserStatus.RESTRICTED,
        ),
        rapidDropUsers: users.filter((user) => rapidDropUserIds.has(user.id)),
        activeWarnings,
      },
    };
  }

  async getUserTrustProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const [events, warnings] = await Promise.all([
      this.prisma.trustScoreEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.trustScoreWarning.findMany({
        where: { userId, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      trustScore: user.trustScore,
      status: user.status,
      tier: this.getTier(user.trustScore),
      recentEvents: events,
      activeWarnings: warnings,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async recalculateAllTrustScores() {
    const users = await this.prisma.user.findMany({
      select: { id: true },
    });

    for (const user of users) {
      await this.recalculateUserTrustScore(user.id);
    }
  }

  async recalculateUserTrustScore(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        trustScore: true,
        kycVerifications: {
          where: { status: KycStatus.APPROVED },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!user) return null;

    const ownedVehicles = await this.prisma.vehicle.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const ownedVehicleIds = ownedVehicles.map((v) => v.id);

    const [ratingAgg, completedTrips, allTrips, disputedTrips] =
      await Promise.all([
        ownedVehicleIds.length > 0
          ? this.prisma.review.aggregate({
              where: { vehicleId: { in: ownedVehicleIds } },
              _avg: { rating: true },
            })
          : Promise.resolve({ _avg: { rating: null } }),
        this.prisma.trip.findMany({
          where: { renterId: userId, status: 'COMPLETED' },
          include: { booking: { select: { endTime: true } } },
        }),
        this.prisma.trip.count({ where: { renterId: userId } }),
        this.prisma.trip.count({
          where: { renterId: userId, hasIssues: true },
        }),
      ]);

    const avgRating = ratingAgg._avg.rating ?? 5;
    const ratingScore = (avgRating / 5) * 100;

    const onTimeTrips = completedTrips.filter(
      (trip) =>
        trip.completedAt !== null &&
        trip.completedAt.getTime() <= trip.booking.endTime.getTime(),
    ).length;
    const punctualityScore =
      completedTrips.length > 0
        ? (onTimeTrips / completedTrips.length) * 100
        : 100;
    const disputeRate = allTrips > 0 ? (disputedTrips / allTrips) * 100 : 0;
    const kycScore = user.kycVerifications.length > 0 ? 100 : 0;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentCompletedTrips = completedTrips.filter(
      (trip) =>
        trip.completedAt !== null &&
        trip.completedAt.getTime() >= ninetyDaysAgo.getTime(),
    ).length;
    const activityScore = Math.min(100, recentCompletedTrips * 10);

    const formulaScore =
      0.45 * ratingScore +
      0.35 * punctualityScore -
      0.2 * disputeRate +
      0.2 * kycScore +
      0.1 * activityScore;
    const blendedScore = this.clamp(0.6 * formulaScore + 0.4 * user.trustScore);

    return this.setScore(
      userId,
      blendedScore,
      TrustScoreEventType.RECALCULATED,
      'Daily weighted trust score recalculation',
      {
        ratingScore,
        punctualityScore,
        disputeRate,
        kycScore,
        activityScore,
      },
    );
  }

  private async applyDelta(
    userId: string,
    type: TrustScoreEventType,
    delta: number,
    reason?: string,
    metadata?: TrustScoreMetadata,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    return this.setScore(
      userId,
      this.clamp(user.trustScore + delta),
      type,
      reason,
      metadata,
      user.trustScore,
      user.status,
    );
  }

  private async setScore(
    userId: string,
    scoreAfter: number,
    type: TrustScoreEventType,
    reason?: string,
    metadata?: TrustScoreMetadata,
    scoreBefore?: number,
    statusBefore?: UserStatus,
  ) {
    const user =
      scoreBefore === undefined || statusBefore === undefined
        ? await this.prisma.user.findUnique({ where: { id: userId } })
        : { trustScore: scoreBefore, status: statusBefore };
    if (!user) return null;

    const before = user.trustScore;
    const data: { trustScore: number; status?: UserStatus } = {
      trustScore: scoreAfter,
    };
    if (scoreAfter < 40 && user.status !== UserStatus.BLOCKED) {
      data.status = UserStatus.RESTRICTED;
    }

    const [updated] = await Promise.all([
      this.prisma.user.update({
        where: { id: userId },
        data,
      }),
      this.prisma.trustScoreEvent.create({
        data: {
          userId,
          type,
          delta: scoreAfter - before,
          scoreBefore: before,
          scoreAfter,
          reason,
          metadata,
        },
      }),
    ]);

    return {
      trustScore: updated.trustScore,
      status: updated.status,
      tier: this.getTier(updated.trustScore),
    };
  }

  private clamp(score: number): number {
    return Math.min(this.MAX_SCORE, Math.max(this.MIN_SCORE, score));
  }
}
