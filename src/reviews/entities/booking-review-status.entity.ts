import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { ReviewEntity } from './review.entity';

export class BookingReviewStatusEntity {
  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiProperty()
  @Expose()
  submitted: boolean;

  @ApiProperty()
  @Expose()
  counterpartSubmitted: boolean;

  @ApiProperty()
  @Expose()
  isRevealed: boolean;

  @ApiPropertyOptional({ type: ReviewEntity, nullable: true })
  @Expose()
  ownReview: ReviewEntity | null;

  @ApiPropertyOptional({ type: ReviewEntity, nullable: true })
  @Expose()
  receivedReview: ReviewEntity | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  revealAt: Date | null;

  constructor(partial: Partial<BookingReviewStatusEntity>) {
    Object.assign(this, partial);
  }
}
