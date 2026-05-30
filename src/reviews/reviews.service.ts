import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Review, ReviewType, TrustScoreEventType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ReviewEntity } from './entities/review.entity';
import { BookingReviewStatusEntity } from './entities/booking-review-status.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { TrustScoreService } from '../trust-score/trust-score.service';

const REVIEW_REVEAL_WINDOW_DAYS = 14;

type ReviewForEffects = Review & {
  vehicle?: { ownerId: string } | null;
};

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trustScoreService: TrustScoreService,
  ) {}

  /**
   * Create a blind trip-bound review. Renter reviews owner/vehicle; owner
   * reviews renter. Reviews reveal only after both parties submit or after the
   * 14-day reveal window expires.
   */
  async createReview(
    userId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewEntity> {
    this.logger.log(
      `User ${userId} creating review for vehicle ${dto.vehicleId}`,
    );

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const completedTrip = await this.prisma.trip.findFirst({
      where: {
        vehicleId: dto.vehicleId,
        status: 'COMPLETED',
        ...(dto.bookingId ? { bookingId: dto.bookingId } : {}),
        OR: [{ renterId: userId }, { booking: { ownerId: userId } }],
      },
      include: {
        booking: true,
      },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!completedTrip) {
      throw new BadRequestException(
        'You can only review after completing a trip as renter or owner',
      );
    }

    const reviewType =
      completedTrip.renterId === userId
        ? ReviewType.RENTER_TO_OWNER
        : ReviewType.OWNER_TO_RENTER;
    const revieweeId =
      reviewType === ReviewType.RENTER_TO_OWNER
        ? completedTrip.booking.ownerId
        : completedTrip.renterId;

    const existingReview = await this.prisma.review.findFirst({
      where: { tripId: completedTrip.id, userId },
    });

    if (existingReview) {
      throw new BadRequestException('Bạn đã đánh giá chuyến đi này rồi');
    }

    const revealBase =
      completedTrip.completedAt ?? completedTrip.updatedAt ?? new Date();
    const visibleAt = this.addDays(revealBase, REVIEW_REVEAL_WINDOW_DAYS);

    const review = await this.prisma.review.create({
      data: {
        userId,
        revieweeId,
        vehicleId: dto.vehicleId,
        tripId: completedTrip.id,
        reviewType,
        rating: dto.rating,
        comment: dto.comment,
        visibleAt,
      },
    });

    await this.trustScoreService.recordPositiveEvent(
      userId,
      TrustScoreEventType.REVIEW_SUBMITTED,
      1,
      'Submitted a review after a completed rental',
      {
        reviewId: review.id,
        vehicleId: dto.vehicleId,
        tripId: completedTrip.id,
        reviewType,
      },
    );

    await this.revealTripReviewsIfComplete(completedTrip.id);

    const updatedReview =
      (await this.prisma.review.findFirst({
        where: { id: review.id },
      })) ?? review;

    this.logger.log(`Review ${review.id} created successfully`);

    return ReviewEntity.fromPrisma(updatedReview);
  }

  @Cron('0 */15 * * * *')
  async revealEligibleReviews(): Promise<number> {
    const now = new Date();
    const dueReviews = await this.prisma.review.findMany({
      where: {
        revealedAt: null,
        visibleAt: { lte: now },
      },
      include: {
        vehicle: {
          select: { ownerId: true },
        },
      },
      take: 100,
    });

    if (dueReviews.length === 0) {
      return 0;
    }

    const reviewIds = dueReviews.map((review) => review.id);
    await this.prisma.review.updateMany({
      where: { id: { in: reviewIds }, revealedAt: null },
      data: { revealedAt: now },
    });

    await this.applyRevealedReviewEffects(
      dueReviews.map((review) => ({ ...review, revealedAt: now })),
    );

    return dueReviews.length;
  }

  private async revealTripReviewsIfComplete(tripId: string): Promise<void> {
    const tripReviews = await this.prisma.review.findMany({
      where: { tripId },
      include: {
        vehicle: {
          select: { ownerId: true },
        },
      },
    });

    const hasRenterReview = tripReviews.some(
      (review) => review.reviewType === ReviewType.RENTER_TO_OWNER,
    );
    const hasOwnerReview = tripReviews.some(
      (review) => review.reviewType === ReviewType.OWNER_TO_RENTER,
    );

    if (!hasRenterReview || !hasOwnerReview) {
      return;
    }

    const now = new Date();
    await this.prisma.review.updateMany({
      where: { tripId, revealedAt: null },
      data: { revealedAt: now },
    });

    await this.applyRevealedReviewEffects(
      tripReviews.map((review) => ({
        ...review,
        revealedAt: review.revealedAt ?? now,
      })),
    );
  }

  private async applyRevealedReviewEffects(
    reviews: ReviewForEffects[],
  ): Promise<void> {
    for (const review of reviews) {
      if (review.trustAppliedAt) {
        continue;
      }

      if (review.reviewType === ReviewType.RENTER_TO_OWNER) {
        await this.updateVehicleRating(review.vehicleId);
        await this.adjustUserTrustFromRating(
          review.revieweeId ?? review.vehicle?.ownerId ?? null,
          review.rating,
          review.id,
          review.vehicleId,
        );
      } else {
        await this.adjustUserTrustFromRating(
          review.revieweeId,
          review.rating,
          review.id,
          review.vehicleId,
        );
      }

      await this.prisma.review.update({
        where: { id: review.id },
        data: { trustAppliedAt: new Date() },
      });
    }
  }

  /**
   * Update vehicle average from revealed renter-to-owner reviews only.
   */
  private async updateVehicleRating(vehicleId: string): Promise<void> {
    const reviews = await this.prisma.review.findMany({
      where: {
        vehicleId,
        reviewType: ReviewType.RENTER_TO_OWNER,
        revealedAt: { not: null },
      },
    });

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = reviews.length > 0 ? totalRating / reviews.length : 0;

    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        totalRating: averageRating,
        reviewCount: reviews.length,
      },
    });
  }

  /**
   * Adjust reviewed user's trust score based on revealed rating:
   * 1-2 stars => -3, 3 stars => 0, 4-5 stars => +1.
   */
  private async adjustUserTrustFromRating(
    revieweeId: string | null,
    rating: number,
    reviewId: string,
    vehicleId: string,
  ): Promise<void> {
    if (!revieweeId) {
      return;
    }

    if (rating <= 2) {
      await this.trustScoreService.recordViolation(
        revieweeId,
        TrustScoreEventType.BAD_REVIEW_RECEIVED,
        3,
        'Received a low rating',
        { reviewId, vehicleId, rating },
      );
      await this.applyConsecutiveLowRatingPenalty(revieweeId);
    } else if (rating >= 4) {
      await this.trustScoreService.recordPositiveEvent(
        revieweeId,
        TrustScoreEventType.GOOD_REVIEW_RECEIVED,
        1,
        'Received a good rating',
        { reviewId, vehicleId, rating },
      );
    }
  }

  private async applyConsecutiveLowRatingPenalty(ownerId: string) {
    const ownedVehicleIds =
      (await this.prisma.vehicle.findMany({
        where: { ownerId },
        select: { id: true },
      })) ?? [];
    const vehicleIds = ownedVehicleIds.map((vehicle) => vehicle.id);
    if (vehicleIds.length === 0) return;

    const recentReviews = await this.prisma.review.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        reviewType: ReviewType.RENTER_TO_OWNER,
        revealedAt: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    if (
      recentReviews.length === 3 &&
      recentReviews.every((review) => review.rating <= 2)
    ) {
      await this.trustScoreService.recordViolation(
        ownerId,
        TrustScoreEventType.BAD_REVIEW_RECEIVED,
        5,
        'Received 3 consecutive low ratings',
        { reviewIds: recentReviews.map((review) => review.id), streak: 3 },
        false,
      );
    }
  }

  /**
   * Get revealed renter-to-owner reviews for a vehicle.
   */
  async getVehicleReviews(
    vehicleId: string,
    rating?: number,
  ): Promise<ReviewEntity[]> {
    const reviews = await this.prisma.review.findMany({
      where: {
        vehicleId,
        reviewType: ReviewType.RENTER_TO_OWNER,
        revealedAt: { not: null },
        ...(rating ? { rating } : {}),
      },
      include: {
        user: {
          select: {
            fullName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reviews.map((r) => ReviewEntity.fromPrisma(r));
  }

  /**
   * Get reviews created by a user, including unrevealed own submissions.
   */
  async getUserReviews(userId: string): Promise<ReviewEntity[]> {
    const reviews = await this.prisma.review.findMany({
      where: { userId },
      include: {
        user: {
          select: { fullName: true, avatarUrl: true },
        },
        vehicle: {
          select: { name: true, brand: true, model: true, images: true },
        },
        trip: {
          select: { bookingId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reviews.map((r) => ReviewEntity.fromPrisma(r));
  }

  /**
   * Get the blind-review exchange visible to one booking participant.
   * Counterpart text stays hidden until the persisted reveal has occurred.
   */
  async getBookingReviewStatus(
    userId: string,
    bookingId: string,
  ): Promise<BookingReviewStatusEntity> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        renterId: true,
        ownerId: true,
        trip: { select: { id: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.renterId !== userId && booking.ownerId !== userId) {
      throw new ForbiddenException(
        'You can only view reviews for your own bookings',
      );
    }

    if (!booking.trip) {
      return new BookingReviewStatusEntity({
        bookingId,
        submitted: false,
        counterpartSubmitted: false,
        isRevealed: false,
        ownReview: null,
        receivedReview: null,
        revealAt: null,
      });
    }

    const reviews = await this.prisma.review.findMany({
      where: { tripId: booking.trip.id },
      include: {
        user: { select: { fullName: true, avatarUrl: true } },
      },
    });
    const own = reviews.find((review) => review.userId === userId);
    const counterpart = reviews.find((review) => review.userId !== userId);
    const isRevealed = reviews.some((review) => Boolean(review.revealedAt));
    const ownReview = own
      ? new ReviewEntity({
          ...ReviewEntity.fromPrisma({ ...own, bookingId }),
          isRevealed,
        })
      : null;
    const receivedReview =
      counterpart?.revealedAt != null
        ? new ReviewEntity({
            ...ReviewEntity.fromPrisma({ ...counterpart, bookingId }),
            isRevealed: true,
          })
        : null;

    return new BookingReviewStatusEntity({
      bookingId,
      submitted: ownReview !== null,
      counterpartSubmitted: counterpart !== undefined,
      isRevealed,
      ownReview,
      receivedReview,
      revealAt: own?.visibleAt ?? counterpart?.visibleAt ?? null,
    });
  }

  /**
   * Get trust score breakdown for a user.
   */
  async getTrustScoreBreakdown(userId: string, includeAudit = false) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const reviewsGiven = await this.prisma.review.count({
      where: { userId },
    });

    const ownedVehicleIds = await this.prisma.vehicle.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const vehicleIds = ownedVehicleIds.map((v) => v.id);

    let avgRatingReceived: number | null = null;
    let totalReviewsReceived = 0;
    if (vehicleIds.length > 0) {
      const ratingAgg = await this.prisma.review.aggregate({
        where: {
          vehicleId: { in: vehicleIds },
          reviewType: ReviewType.RENTER_TO_OWNER,
          revealedAt: { not: null },
        },
        _avg: { rating: true },
        _count: { id: true },
      });
      avgRatingReceived = ratingAgg._avg.rating;
      totalReviewsReceived = ratingAgg._count.id;
    }

    const cancelledBookings = await this.prisma.booking.count({
      where: { renterId: userId, status: 'CANCELLED' },
    });

    const rejectedBookings = await this.prisma.booking.count({
      where: { ownerId: userId, status: 'REJECTED' },
    });

    const completedTrips = await this.prisma.trip.count({
      where: { renterId: userId, status: 'COMPLETED' },
    });

    const tripsWithIssues = await this.prisma.trip.count({
      where: { renterId: userId, hasIssues: true },
    });

    // Penalties must reflect the score actually deducted, not a theoretical
    // `count * weight`. The progressive-warning policy means the first matching
    // violation inside the 30-day window only records a WARNING (delta 0), so a
    // single cancellation must NOT be shown as "-5". We therefore sum the real
    // applied deltas from trust-score events (penalised events carry a negative
    // delta; warning-only events carry delta 0) and surface how many violations
    // are still in the warning-only state.
    const sumAppliedPenalty = async (
      types: TrustScoreEventType[],
    ): Promise<number> => {
      const agg = await this.prisma.trustScoreEvent.aggregate({
        where: { userId, type: { in: types } },
        _sum: { delta: true },
      });
      return agg._sum.delta ?? 0;
    };

    const countActiveWarnings = (
      types: TrustScoreEventType[],
    ): Promise<number> =>
      this.prisma.trustScoreWarning.count({
        where: {
          userId,
          type: { in: types },
          penalizedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

    const [
      cancellationPenalty,
      rejectionPenalty,
      violationPenalty,
      cancellationWarnings,
      rejectionWarnings,
      violationWarnings,
    ] = await Promise.all([
      sumAppliedPenalty([TrustScoreEventType.BOOKING_CANCELLED_BY_RENTER]),
      sumAppliedPenalty([TrustScoreEventType.BOOKING_REJECTED_BY_OWNER]),
      sumAppliedPenalty([
        TrustScoreEventType.LATE_RETURN,
        TrustScoreEventType.CONFIRMED_REPORT,
        TrustScoreEventType.SERIOUS_VIOLATION,
        TrustScoreEventType.BAD_REVIEW_RECEIVED,
      ]),
      countActiveWarnings([TrustScoreEventType.BOOKING_CANCELLED_BY_RENTER]),
      countActiveWarnings([TrustScoreEventType.BOOKING_REJECTED_BY_OWNER]),
      countActiveWarnings([
        TrustScoreEventType.LATE_RETURN,
        TrustScoreEventType.CONFIRMED_REPORT,
        TrustScoreEventType.SERIOUS_VIOLATION,
        TrustScoreEventType.BAD_REVIEW_RECEIVED,
      ]),
    ]);

    const trustProfile =
      includeAudit || userId
        ? await this.trustScoreService.getUserTrustProfile(userId)
        : null;

    return {
      trustScore: user.trustScore,
      tier: trustProfile?.tier,
      ...(includeAudit
        ? {
            recentEvents: trustProfile?.recentEvents ?? [],
            activeWarnings: trustProfile?.activeWarnings ?? [],
          }
        : {}),
      breakdown: {
        reviewsGiven,
        reviewsGivenBonus: reviewsGiven,
        avgRatingReceived,
        totalReviewsReceived,
        cancelledBookings,
        // Actual deducted points (0 while only a warning has been issued).
        cancellationPenalty,
        cancellationWarnings,
        rejectedBookings,
        rejectionPenalty,
        rejectionWarnings,
        completedTrips,
        tripsWithIssues,
        violationPenalty,
        violationWarnings,
      },
    };
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
