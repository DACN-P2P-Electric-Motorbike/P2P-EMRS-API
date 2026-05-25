import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus } from '@prisma/client';
import { Expose } from 'class-transformer';

export class CancellationRefundPreviewEntity {
  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiProperty({
    description: 'Who is requesting cancellation: RENTER or OWNER',
  })
  @Expose()
  cancelledBy: 'RENTER' | 'OWNER';

  @ApiProperty()
  @Expose()
  cancellable: boolean;

  @ApiProperty()
  @Expose()
  hoursUntilStart: number;

  @ApiProperty()
  @Expose()
  policyCode: string;

  @ApiProperty()
  @Expose()
  rentalRefundRate: number;

  @ApiProperty()
  @Expose()
  trustPenalty: number;

  @ApiProperty()
  @Expose()
  rentalAmount: number;

  @ApiProperty()
  @Expose()
  protectionAmount: number;

  @ApiProperty()
  @Expose()
  prepaidChargingAmount: number;

  @ApiProperty()
  @Expose()
  roadsideSupportAmount: number;

  @ApiProperty()
  @Expose()
  depositAmount: number;

  @ApiProperty()
  @Expose()
  paidAmount: number;

  @ApiProperty()
  @Expose()
  refundableRentalAmount: number;

  @ApiProperty()
  @Expose()
  refundableProtectionAmount: number;

  @ApiProperty()
  @Expose()
  refundablePrepaidChargingAmount: number;

  @ApiProperty()
  @Expose()
  refundableRoadsideSupportAmount: number;

  @ApiProperty()
  @Expose()
  refundableDepositAmount: number;

  @ApiProperty()
  @Expose()
  refundAmount: number;

  @ApiProperty()
  @Expose()
  forfeitedRentalAmount: number;

  @ApiProperty()
  @Expose()
  forfeitedProtectionAmount: number;

  @ApiProperty()
  @Expose()
  forfeitedPrepaidChargingAmount: number;

  @ApiProperty()
  @Expose()
  forfeitedRoadsideSupportAmount: number;

  @ApiProperty()
  @Expose()
  forfeitedDepositAmount: number;

  @ApiProperty()
  @Expose()
  forfeitedAmount: number;

  @ApiProperty()
  @Expose()
  isPaid: boolean;

  @ApiPropertyOptional({ enum: PaymentStatus, nullable: true })
  @Expose()
  paymentStatus: PaymentStatus | null;

  @ApiProperty()
  @Expose()
  refundType: 'full' | 'partial' | 'none';

  constructor(partial: Partial<CancellationRefundPreviewEntity>) {
    Object.assign(this, partial);
  }
}
