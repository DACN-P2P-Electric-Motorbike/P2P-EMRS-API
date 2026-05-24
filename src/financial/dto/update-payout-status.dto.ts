import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

const ADMIN_MUTABLE_PAYOUT_STATUSES = [
  PayoutStatus.PROCESSING,
  PayoutStatus.COMPLETED,
  PayoutStatus.FAILED,
  PayoutStatus.CANCELLED,
] as const;

export class UpdatePayoutStatusDto {
  @ApiProperty({
    enum: ADMIN_MUTABLE_PAYOUT_STATUSES,
    description: 'Admin payout processing decision',
  })
  @IsEnum(PayoutStatus)
  status: (typeof ADMIN_MUTABLE_PAYOUT_STATUSES)[number];

  @ApiPropertyOptional({
    description: 'External bank/payment reference for payout processing',
    example: 'BANK-TXN-20260524-001',
  })
  @IsOptional()
  @IsString()
  externalReference?: string;

  @ApiPropertyOptional({
    description: 'Internal admin note for payout processing',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
