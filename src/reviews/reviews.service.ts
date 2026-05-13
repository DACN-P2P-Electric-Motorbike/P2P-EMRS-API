import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ReviewEntity } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { TrustScoreEventType } from '@prisma/client';
import { TrustScoreService } from '../trust-score/trust-score.service';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trustScoreService: TrustScoreService,
  ) {}

  /**
   * Create a review for a vehicle
   */
  async createReview(
    userId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewEntity> {
    this.logger.log(
      `User ${userId} creating review for vehicle ${dto.vehicleId}`,
    );

    // Check if vehicle exists
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    // Check if user has completed a trip with this vehicle. When a bookingId
    // is supplied, bind the review to that exact completed trip.
    const completedTrip = await this.prisma.trip.findFirst({
      where: {
        renterId: userId,
        vehicleId: dto.vehicleId,
        status: 'COMPLETED',
        ...(dto.bookingId ? { bookingId: dto.bookingId } : {}),
      },
    });

    if (!completedTrip) {
      throw new BadRequestException(
        'You can only review vehicles you have rented',
      );
    }

    if (dto.bookingId) {
      const existingReview = await this.prisma.review.findFirst({
        where: { tripId: completedTrip.id },
      });

      if (existingReview) {
        throw new BadRequestException('Bạn đã đánh giá chuyến đi này rồi');
      }
    } else {
      const existingReview = await this.prisma.review.findFirst({
        where: { userId, vehicleId: dto.vehicleId },
      });
      if (existingReview) {
        throw new BadRequestException('Bạn đã đánh giá xe này rồi');
      }
    }

    // Create review
    const review = await this.prisma.review.create({
      data: {
        userId,
        vehicleId: dto.vehicleId,
        tripId: dto.bookingId ? completedTrip.id : undefined,
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    // Update vehicle rating
    await this.updateVehicleRating(dto.vehicleId);

    await this.trustScoreService.recordPositiveEvent(
      userId,
      TrustScoreEventType.REVIEW_SUBMITTED,
      1,
      'Submitted a review after a completed rental',
      {
        reviewId: review.id,
        vehicleId: dto.vehicleId,
        tripId: completedTrip.id,
      },
    );

    await this.adjustOwnerTrustFromRating(
      vehicle.ownerId,
      dto.rating,
      review.id,
      dto.vehicleId,
    );

    this.logger.log(`Review ${review.id} created successfully`);

    return ReviewEntity.fromPrisma(review);
  }

  /**
   * Update vehicle average rating
   */
  private async updateVehicleRating(vehicleId: string): Promise<void> {
    const reviews = await this.prisma.review.findMany({
      where: { vehicleId },
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
   * Adjust owner trust score based on received rating:
   * 1-2 stars => -3, 3 stars => 0, 4-5 stars => +1
   */
  private async adjustOwnerTrustFromRating(
    ownerId: string,
    rating: number,
    reviewId: string,
    vehicleId: string,
  ): Promise<void> {
    if (rating <= 2) {
      await this.trustScoreService.recordViolation(
        ownerId,
        TrustScoreEventType.BAD_REVIEW_RECEIVED,
        3,
        'Received a low rating',
        { reviewId, vehicleId, rating },
      );
      await this.applyConsecutiveLowRatingPenalty(ownerId);
    } else if (rating >= 4) {
      await this.trustScoreService.recordPositiveEvent(
        ownerId,
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
      where: { vehicleId: { in: vehicleIds } },
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
   * Get reviews for a vehicle
   */
  async getVehicleReviews(
    vehicleId: string,
    rating?: number,
  ): Promise<ReviewEntity[]> {
    const reviews = await this.prisma.review.findMany({
      where: { vehicleId, ...(rating ? { rating } : {}) },
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
   * Get reviews created by a user
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
   * Get trust score breakdown for a user
   */
  async getTrustScoreBreakdown(userId: string, includeAudit = false) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Count reviews left by this user
    const reviewsGiven = await this.prisma.review.count({
      where: { userId },
    });

    // Average rating received (as vehicle owner)
    const ownedVehicleIds = await this.prisma.vehicle.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const vehicleIds = ownedVehicleIds.map((v) => v.id);

    let avgRatingReceived: number | null = null;
    let totalReviewsReceived = 0;
    if (vehicleIds.length > 0) {
      const ratingAgg = await this.prisma.review.aggregate({
        where: { vehicleId: { in: vehicleIds } },
        _avg: { rating: true },
        _count: { id: true },
      });
      avgRatingReceived = ratingAgg._avg.rating;
      totalReviewsReceived = ratingAgg._count.id;
    }

    // Cancelled bookings (as renter)
    const cancelledBookings = await this.prisma.booking.count({
      where: { renterId: userId, status: 'CANCELLED' },
    });

    // Rejected bookings (as owner)
    const rejectedBookings = await this.prisma.booking.count({
      where: { ownerId: userId, status: 'REJECTED' },
    });

    // Completed trips
    const completedTrips = await this.prisma.trip.count({
      where: { renterId: userId, status: 'COMPLETED' },
    });

    // Trips with issues reported
    const tripsWithIssues = await this.prisma.trip.count({
      where: { renterId: userId, hasIssues: true },
    });

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
        reviewsGivenBonus: reviewsGiven, // +1 each
        avgRatingReceived,
        totalReviewsReceived,
        cancelledBookings,
        cancellationPenalty: cancelledBookings * -5,
        rejectedBookings,
        rejectionPenalty: rejectedBookings * -2,
        completedTrips,
        tripsWithIssues,
        violationPenalty: tripsWithIssues * -3,
      },
    };
  }
}
