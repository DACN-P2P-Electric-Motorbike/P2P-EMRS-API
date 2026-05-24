import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DepositLedger,
  DepositLedgerStatus,
  PostTripCharge,
  PostTripChargeSource,
  PostTripChargeStatus,
  PostTripChargeType,
} from '@prisma/client';
import { Expose } from 'class-transformer';

export class DepositLedgerEntity implements DepositLedger {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiPropertyOptional()
  @Expose()
  paymentId: string | null;

  @ApiProperty({ enum: DepositLedgerStatus })
  @Expose()
  status: DepositLedgerStatus;

  @ApiProperty()
  @Expose()
  heldAmount: number;

  @ApiProperty()
  @Expose()
  pendingChargeAmount: number;

  @ApiProperty()
  @Expose()
  capturedAmount: number;

  @ApiProperty()
  @Expose()
  releasedAmount: number;

  @ApiProperty()
  @Expose()
  refundedAmount: number;

  @ApiPropertyOptional()
  @Expose()
  notes: string | null;

  @ApiPropertyOptional()
  @Expose()
  heldAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  releaseDueAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  releasedAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  disputedAt: Date | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  constructor(partial: Partial<DepositLedgerEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(deposit: DepositLedger): DepositLedgerEntity {
    return new DepositLedgerEntity(deposit);
  }
}

export class PostTripChargeEntity implements PostTripCharge {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiPropertyOptional()
  @Expose()
  tripId: string | null;

  @ApiProperty({ enum: PostTripChargeType })
  @Expose()
  type: PostTripChargeType;

  @ApiProperty({ enum: PostTripChargeStatus })
  @Expose()
  status: PostTripChargeStatus;

  @ApiProperty({ enum: PostTripChargeSource })
  @Expose()
  source: PostTripChargeSource;

  @ApiProperty()
  @Expose()
  amount: number;

  @ApiPropertyOptional()
  @Expose()
  quantity: number | null;

  @ApiPropertyOptional()
  @Expose()
  unitPrice: number | null;

  @ApiProperty()
  @Expose()
  description: string;

  @ApiPropertyOptional()
  @Expose()
  evidence: any;

  @ApiPropertyOptional()
  @Expose()
  reviewedBy: string | null;

  @ApiPropertyOptional()
  @Expose()
  reviewedAt: Date | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  constructor(partial: Partial<PostTripChargeEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(charge: PostTripCharge): PostTripChargeEntity {
    return new PostTripChargeEntity(charge);
  }
}

export class FinancialSummaryEntity {
  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiPropertyOptional({ type: DepositLedgerEntity, nullable: true })
  @Expose()
  deposit: DepositLedgerEntity | null;

  @ApiProperty({ type: [PostTripChargeEntity] })
  @Expose()
  charges: PostTripChargeEntity[];

  @ApiProperty()
  @Expose()
  totalPendingCharges: number;

  @ApiProperty()
  @Expose()
  totalApprovedCharges: number;

  @ApiProperty()
  @Expose()
  totalCapturedCharges: number;

  @ApiProperty()
  @Expose()
  releasableDeposit: number;

  constructor(partial: Partial<FinancialSummaryEntity>) {
    Object.assign(this, partial);
  }
}
