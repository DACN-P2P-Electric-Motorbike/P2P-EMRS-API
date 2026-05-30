import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Booking,
  BookingStatus,
  CancellationPolicyType,
  PaymentStatus,
  Prisma,
  ProtectionPlanType,
} from '@prisma/client';
import { Expose } from 'class-transformer';

/**
 * Renter-facing refund summary recorded when a paid booking is cancelled.
 * Surfaced so the renter can see how much money is being refunded and why,
 * instead of only seeing the cancellation reason.
 */
export interface BookingRefundInfo {
  refundType: string;
  rentalRefundRate: number;
  refundableRentalAmount: number;
  refundableProtectionAmount: number;
  refundablePrepaidChargingAmount: number;
  refundableRoadsideSupportAmount: number;
  refundableDepositAmount: number;
  refundAmount: number;
  paidAmount: number;
  forfeitedAmount: number;
  cancelledBy: string | null;
  cancelledAt: string | null;
}

export class BookingEntity implements Booking {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  renterId: string;

  @ApiProperty()
  @Expose()
  ownerId: string;

  @ApiProperty()
  @Expose()
  vehicleId: string;

  @ApiProperty({ enum: BookingStatus })
  @Expose()
  status: BookingStatus;

  @ApiProperty()
  @Expose()
  startTime: Date;

  @ApiProperty()
  @Expose()
  endTime: Date;

  @ApiProperty()
  @Expose()
  totalPrice: number;

  @ApiProperty()
  @Expose()
  deposit: number;

  @ApiProperty({ enum: ProtectionPlanType })
  @Expose()
  protectionPlan: ProtectionPlanType;

  @ApiProperty()
  @Expose()
  protectionFee: number;

  @ApiProperty()
  @Expose()
  protectionDeductible: number;

  @ApiProperty()
  @Expose()
  protectionCoverageLimit: number;

  @ApiProperty()
  @Expose()
  prepaidCharging: boolean;

  @ApiProperty()
  @Expose()
  prepaidChargingFee: number;

  @ApiProperty()
  @Expose()
  prepaidChargingCreditPercent: number;

  @ApiProperty()
  @Expose()
  roadsideSupport: boolean;

  @ApiProperty()
  @Expose()
  roadsideSupportFee: number;

  @ApiProperty()
  @Expose()
  roadsideSupportCreditAmount: number;

  @ApiProperty({ enum: CancellationPolicyType })
  @Expose()
  cancellationPolicy: CancellationPolicyType;

  @ApiPropertyOptional()
  @Expose()
  notes: string | null;

  @ApiPropertyOptional()
  @Expose()
  cancellationReason: string | null;

  @ApiPropertyOptional({ description: 'Who cancelled: OWNER or RENTER' })
  @Expose()
  cancelledBy: string | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  @ApiPropertyOptional()
  @Expose()
  confirmedAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  cancelledAt: Date | null;

  @ApiPropertyOptional({ enum: PaymentStatus, nullable: true })
  @Expose()
  paymentStatus: PaymentStatus | null;

  @ApiPropertyOptional({
    description:
      'Refund summary for a cancelled paid booking (rental/deposit split, ' +
      'total refunded). Null when no refund was recorded.',
    nullable: true,
  })
  @Expose()
  refundInfo: BookingRefundInfo | null;

  constructor(partial: Partial<BookingEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(
    booking: Booking & {
      payment?: {
        status: PaymentStatus;
        gatewayResponse?: Prisma.JsonValue | null;
      } | null;
    },
  ): BookingEntity {
    return new BookingEntity({
      ...booking,
      paymentStatus: booking.payment?.status ?? null,
      refundInfo: BookingEntity.extractRefundInfo(
        booking.payment?.gatewayResponse ?? null,
      ),
    });
  }

  /**
   * Pulls the refund breakdown recorded on the payment gateway response during
   * cancellation. Returns null when the payment has no recorded refund.
   */
  private static extractRefundInfo(
    gatewayResponse: Prisma.JsonValue | null,
  ): BookingRefundInfo | null {
    if (
      gatewayResponse === null ||
      typeof gatewayResponse !== 'object' ||
      Array.isArray(gatewayResponse)
    ) {
      return null;
    }

    const root = gatewayResponse as Record<string, unknown>;
    const breakdown =
      root.cancellationRefundBreakdown &&
      typeof root.cancellationRefundBreakdown === 'object' &&
      !Array.isArray(root.cancellationRefundBreakdown)
        ? (root.cancellationRefundBreakdown as Record<string, unknown>)
        : null;

    // Only expose refund info when a cancellation refund was actually recorded.
    if (breakdown === null && root.refundAmount === undefined) {
      return null;
    }

    const num = (value: unknown): number =>
      typeof value === 'number' && Number.isFinite(value) ? value : 0;
    const str = (value: unknown): string | null =>
      typeof value === 'string' ? value : null;

    const source = breakdown ?? root;

    return {
      refundType: str(source.refundType) ?? 'none',
      rentalRefundRate: num(source.rentalRefundRate ?? root.refundRate),
      refundableRentalAmount: num(source.refundableRentalAmount),
      refundableProtectionAmount: num(source.refundableProtectionAmount),
      refundablePrepaidChargingAmount: num(
        source.refundablePrepaidChargingAmount,
      ),
      refundableRoadsideSupportAmount: num(
        source.refundableRoadsideSupportAmount,
      ),
      refundableDepositAmount: num(source.refundableDepositAmount),
      refundAmount: num(source.refundAmount ?? root.refundAmount),
      paidAmount: num(source.paidAmount),
      forfeitedAmount: num(source.forfeitedAmount),
      cancelledBy: str(root.cancelledBy ?? source.cancelledBy),
      cancelledAt: str(root.cancelledAt ?? source.cancelledAt),
    };
  }
}
