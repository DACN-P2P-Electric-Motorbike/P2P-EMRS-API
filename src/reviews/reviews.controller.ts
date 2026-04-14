import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { ReviewEntity } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('my-reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my reviews',
    description: 'Get all reviews created by the current user',
  })
  @ApiResponse({ status: 200, type: [ReviewEntity] })
  async getMyReviews(
    @CurrentUser('id') userId: string,
  ): Promise<ReviewEntity[]> {
    return this.reviewsService.getUserReviews(userId);
  }

  @Get('trust-score')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get trust score breakdown',
    description:
      'Get current user trust score with detailed breakdown (rating, cancellations, violations)',
  })
  @ApiResponse({ status: 200 })
  async getTrustScoreBreakdown(@CurrentUser('id') userId: string) {
    return this.reviewsService.getTrustScoreBreakdown(userId);
  }

  @Get('trust-score/:userId')
  @ApiOperation({
    summary: 'Get trust score breakdown for a user',
    description: 'Get trust score with breakdown for any user (public)',
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200 })
  async getUserTrustScore(@Param('userId') userId: string) {
    return this.reviewsService.getTrustScoreBreakdown(userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a review',
    description:
      'Renter creates a review for a vehicle after completing a trip',
  })
  @ApiResponse({
    status: 201,
    description: 'Review created successfully',
    type: ReviewEntity,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot review - no completed trips',
  })
  async createReview(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewEntity> {
    return this.reviewsService.createReview(userId, dto);
  }

  @Get('vehicle/:vehicleId')
  @ApiOperation({
    summary: 'Get vehicle reviews',
    description: 'Get all reviews for a specific vehicle',
  })
  @ApiParam({
    name: 'vehicleId',
    description: 'Vehicle ID',
  })
  @ApiQuery({
    name: 'rating',
    required: false,
    type: Number,
    description: 'Filter by star rating (1-5)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of reviews',
    type: [ReviewEntity],
  })
  async getVehicleReviews(
    @Param('vehicleId') vehicleId: string,
    @Query('rating') rating?: string,
  ): Promise<ReviewEntity[]> {
    return this.reviewsService.getVehicleReviews(
      vehicleId,
      rating ? Number.parseInt(rating, 10) : undefined,
    );
  }
}
