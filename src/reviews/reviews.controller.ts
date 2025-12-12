import {
  Controller,
  Post,
  Get,
  Body,
  Param,
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
  @ApiResponse({
    status: 200,
    description: 'List of reviews',
    type: [ReviewEntity],
  })
  async getVehicleReviews(
    @Param('vehicleId') vehicleId: string,
  ): Promise<ReviewEntity[]> {
    return this.reviewsService.getVehicleReviews(vehicleId);
  }
}
