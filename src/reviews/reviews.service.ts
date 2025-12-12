import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ReviewEntity } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    // Check if user has completed a trip with this vehicle
    const completedTrip = await this.prisma.trip.findFirst({
      where: {
        renterId: userId,
        vehicleId: dto.vehicleId,
        status: 'COMPLETED',
      },
    });

    if (!completedTrip) {
      throw new BadRequestException(
        'You can only review vehicles you have rented',
      );
    }

    // Check if user already reviewed this vehicle
    const existingReview = await this.prisma.review.findFirst({
      where: {
        userId,
        vehicleId: dto.vehicleId,
      },
    });

    if (existingReview) {
      throw new BadRequestException('You have already reviewed this vehicle');
    }

    // Create review
    const review = await this.prisma.review.create({
      data: {
        userId,
        vehicleId: dto.vehicleId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    // Update vehicle rating
    await this.updateVehicleRating(dto.vehicleId);

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
   * Get reviews for a vehicle
   */
  async getVehicleReviews(vehicleId: string): Promise<ReviewEntity[]> {
    const reviews = await this.prisma.review.findMany({
      where: { vehicleId },
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
}
