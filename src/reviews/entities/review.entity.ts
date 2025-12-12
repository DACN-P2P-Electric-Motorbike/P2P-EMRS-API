import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Review } from '@prisma/client';
import { Expose } from 'class-transformer';

export class ReviewEntity implements Review {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty()
  @Expose()
  vehicleId: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @Expose()
  rating: number;

  @ApiPropertyOptional()
  @Expose()
  comment: string | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  constructor(partial: Partial<ReviewEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(review: Review): ReviewEntity {
    return new ReviewEntity(review);
  }
}
