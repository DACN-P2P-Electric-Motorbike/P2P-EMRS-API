import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PostTripChargeStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const ADMIN_MUTABLE_STATUSES = [
  PostTripChargeStatus.APPROVED,
  PostTripChargeStatus.WAIVED,
  PostTripChargeStatus.DISPUTED,
  PostTripChargeStatus.CANCELLED,
] as const;

export class UpdateChargeStatusDto {
  @ApiProperty({
    enum: ADMIN_MUTABLE_STATUSES,
    description: 'Admin review decision for a post-trip charge',
  })
  @IsEnum(PostTripChargeStatus)
  status: (typeof ADMIN_MUTABLE_STATUSES)[number];

  @ApiPropertyOptional({
    description: 'Optional reviewed amount. Only used when approving a charge.',
    example: 50000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Internal admin note for the charge decision',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
