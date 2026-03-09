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

  @ApiPropertyOptional({ description: 'Reviewer info' })
  @Expose()
  user?: { fullName: string; avatarUrl: string | null };

  @ApiPropertyOptional({ description: 'Vehicle info' })
  @Expose()
  vehicle?: { name: string; brand: string; model: string; images: string[] };

  constructor(partial: Partial<ReviewEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(review: any): ReviewEntity {
    return new ReviewEntity(review);
  }
}
