import { PaymentStatus } from '@prisma/client';
import { BookingEntity } from './booking.entity';
import {
  createMockBooking,
  type MockBooking,
} from '../../../test/factories/booking.factory';

/**
 * Unit tests for BookingEntity.fromPrisma — focused on the renter-facing
 * `refundInfo` surfaced from the payment gateway response. This is the data
 * that lets a renter see how much was refunded after a cancellation.
 */
describe('BookingEntity.fromPrisma — refundInfo', () => {
  const baseBooking = (): MockBooking => createMockBooking();

  it('returns null refundInfo when there is no payment', () => {
    const entity = BookingEntity.fromPrisma(baseBooking());

    expect(entity.paymentStatus).toBeNull();
    expect(entity.refundInfo).toBeNull();
  });

  it('returns null refundInfo when the payment has no refund recorded', () => {
    const entity = BookingEntity.fromPrisma({
      ...baseBooking(),
      payment: {
        status: PaymentStatus.COMPLETED,
        gatewayResponse: { orderCode: 123, checkoutUrl: 'https://x' },
      },
    });

    expect(entity.paymentStatus).toBe(PaymentStatus.COMPLETED);
    expect(entity.refundInfo).toBeNull();
  });

  it('extracts the refund breakdown recorded on cancellation', () => {
    const entity = BookingEntity.fromPrisma({
      ...baseBooking(),
      payment: {
        status: PaymentStatus.REFUNDED,
        gatewayResponse: {
          refundType: 'partial',
          refundRate: 0.5,
          refundAmount: 595000,
          cancelledBy: 'RENTER',
          cancelledAt: '2026-05-23T03:00:00.000Z',
          cancellationRefundBreakdown: {
            refundType: 'partial',
            rentalRefundRate: 0.5,
            refundableRentalAmount: 50000,
            refundableProtectionAmount: 5000,
            refundablePrepaidChargingAmount: 25000,
            refundableRoadsideSupportAmount: 15000,
            refundableDepositAmount: 500000,
            refundAmount: 595000,
            paidAmount: 690000,
            forfeitedAmount: 95000,
          },
        },
      },
    });

    expect(entity.paymentStatus).toBe(PaymentStatus.REFUNDED);
    expect(entity.refundInfo).not.toBeNull();
    expect(entity.refundInfo).toEqual(
      expect.objectContaining({
        refundType: 'partial',
        rentalRefundRate: 0.5,
        refundableRentalAmount: 50000,
        refundableProtectionAmount: 5000,
        refundablePrepaidChargingAmount: 25000,
        refundableRoadsideSupportAmount: 15000,
        refundableDepositAmount: 500000,
        refundAmount: 595000,
        paidAmount: 690000,
        forfeitedAmount: 95000,
        cancelledBy: 'RENTER',
        cancelledAt: '2026-05-23T03:00:00.000Z',
      }),
    );
  });

  it('falls back to top-level refund fields when no nested breakdown exists', () => {
    const entity = BookingEntity.fromPrisma({
      ...baseBooking(),
      payment: {
        status: PaymentStatus.REFUNDED,
        gatewayResponse: {
          refundAmount: 100000,
          refundRate: 1,
          cancelledBy: 'OWNER',
        },
      },
    });

    expect(entity.refundInfo).not.toBeNull();
    expect(entity.refundInfo?.refundAmount).toBe(100000);
    expect(entity.refundInfo?.rentalRefundRate).toBe(1);
    expect(entity.refundInfo?.cancelledBy).toBe('OWNER');
  });

  it('ignores malformed gateway responses without throwing', () => {
    const entity = BookingEntity.fromPrisma({
      ...baseBooking(),
      payment: {
        status: PaymentStatus.COMPLETED,
        gatewayResponse: ['not', 'an', 'object'] as unknown as Record<
          string,
          unknown
        >,
      },
    });

    expect(entity.refundInfo).toBeNull();
  });
});
