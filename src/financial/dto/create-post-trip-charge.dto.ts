import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PostTripChargeType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const MANUAL_POST_TRIP_CHARGE_TYPES = [
  PostTripChargeType.CLEANING,
  PostTripChargeType.DAMAGE,
  PostTripChargeType.ROADSIDE_ASSISTANCE,
  PostTripChargeType.OTHER,
] as const;

export class CreatePostTripChargeDto {
  @ApiProperty({
    enum: MANUAL_POST_TRIP_CHARGE_TYPES,
    description: 'Manual charge category submitted by an owner or admin',
  })
  @IsIn(MANUAL_POST_TRIP_CHARGE_TYPES)
  type: (typeof MANUAL_POST_TRIP_CHARGE_TYPES)[number];

  @ApiProperty({ example: 50000 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiProperty({
    description: 'Human-readable explanation shown to admins and participants',
    example: 'Rear panel scratch found during check-out',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @ApiPropertyOptional({
    description:
      'Evidence URLs from handover photos or uploaded incident images',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  evidenceUrls?: string[];
}
