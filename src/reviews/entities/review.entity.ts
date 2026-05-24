import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Review, ReviewType } from '@prisma/client';
import { Expose } from 'class-transformer';

export class ReviewEntity implements Review {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  revieweeId: string | null;

  @ApiProperty()
  @Expose()
  vehicleId: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  tripId: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  bookingId?: string | null;

  @ApiProperty({ enum: ReviewType })
  @Expose()
  reviewType: ReviewType;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @Expose()
  rating: number;

  @ApiPropertyOptional()
  @Expose()
  comment: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  visibleAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  revealedAt: Date | null;

  @ApiProperty()
  @Expose()
  isRevealed: boolean;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  trustAppliedAt: Date | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Reviewer info' })
  @Expose()
  user?: { fullName: string; avatarUrl: string | null };

  @ApiPropertyOptional({ description: 'Vehicle info' })
  @Expose()
  vehicle?: { name: string; brand: string; model: string; images: string[] };

  @ApiPropertyOptional({ description: 'Trip info for trip-bound reviews' })
  @Expose()
  trip?: { bookingId: string };

  constructor(partial: Partial<ReviewEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(review: any): ReviewEntity {
    const visibleAt =
      review.visibleAt instanceof Date
        ? review.visibleAt
        : review.visibleAt
          ? new Date(review.visibleAt)
          : null;
    const revealedAt =
      review.revealedAt instanceof Date
        ? review.revealedAt
        : review.revealedAt
          ? new Date(review.revealedAt)
          : null;
    return new ReviewEntity({
      ...review,
      bookingId: review.bookingId ?? review.trip?.bookingId ?? null,
      isRevealed:
        Boolean(revealedAt) || Boolean(visibleAt && visibleAt <= new Date()),
    });
  }
}
