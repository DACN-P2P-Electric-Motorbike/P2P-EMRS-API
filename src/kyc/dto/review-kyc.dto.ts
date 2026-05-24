import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KycStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewKycDto {
  @ApiProperty({
    description: 'Admin review decision',
    enum: [KycStatus.APPROVED, KycStatus.REJECTED],
    example: KycStatus.APPROVED,
  })
  @IsEnum(KycStatus)
  status: KycStatus;

  @ApiPropertyOptional({
    description: 'Required when rejecting a KYC submission',
    example: 'ID card photo is blurry. Please resubmit a clearer image.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
