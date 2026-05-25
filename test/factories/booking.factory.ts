/**
 * @module Booking Tests — Factory
 * @member Member A — Dương Hoàng Long
 * @coverage target ≥80%
 */
import { BookingStatus, ProtectionPlanType } from '@prisma/client';

// ─── Stable test UUIDs ────────────────────────────────────────────────────────
/** UUID for the renter used across booking tests */
export const RENTER_ID = 'cccccccc-2222-4000-8000-cccccccccccc';

/** UUID for the owner used across booking tests */
export const BOOKING_OWNER_ID = 'dddddddd-3333-4000-8000-dddddddddddd';

/** UUID for the vehicle being booked */
export const BOOKED_VEHICLE_ID = 'eeeeeeee-4444-4000-8000-eeeeeeeeeeee';

/** UUID for the default booking */
export const BOOKING_ID = 'ffffffff-5555-4000-8000-ffffffffffff';

/** UUID for a third-party user (neither renter nor owner) */
export const THIRD_PARTY_ID = '11111111-6666-4000-8000-111111111111';

// ─── Factory ──────────────────────────────────────────────────────────────────
/** Shape of a full Prisma Booking record returned from the DB */
export type MockBooking = {
  id: string;
  renterId: string;
  ownerId: string;
  vehicleId: string;
  status: BookingStatus;
  startTime: Date;
  endTime: Date;
  totalPrice: number;
  deposit: number;
  protectionPlan: ProtectionPlanType;
  protectionFee: number;
  protectionDeductible: number;
  protectionCoverageLimit: number;
  prepaidCharging: boolean;
  prepaidChargingFee: number;
  prepaidChargingCreditPercent: number;
  notes: string | null;
  cancellationReason: string | null;
  cancelledBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
};

/**
 * Creates a valid Booking mock object.
 * Times default to tomorrow 10:00 – 14:00 (always in the future).
 * @param overrides – any field you want to override from the defaults
 */
export function createMockBooking(
  overrides: Partial<MockBooking> = {},
): MockBooking {
  // Use a fixed future date so tests don't fail based on current time
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const endTime = new Date(tomorrow);
  endTime.setHours(14, 0, 0, 0);

  return {
    id: BOOKING_ID,
    renterId: RENTER_ID,
    ownerId: BOOKING_OWNER_ID,
    vehicleId: BOOKED_VEHICLE_ID,
    status: BookingStatus.PENDING,
    startTime: tomorrow,
    endTime,
    totalPrice: 100000,
    deposit: 500000,
    protectionPlan: ProtectionPlanType.STANDARD,
    protectionFee: 0,
    protectionDeductible: 1500000,
    protectionCoverageLimit: 15000000,
    prepaidCharging: false,
    prepaidChargingFee: 0,
    prepaidChargingCreditPercent: 0,
    notes: null,
    cancellationReason: null,
    cancelledBy: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    confirmedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

/**
 * Creates a CreateBookingDto-compatible object for use in integration tests.
 */
export function createBookingDto(
  vehicleId: string,
  overrides: Record<string, any> = {},
): Record<string, any> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const endTime = new Date(tomorrow);
  endTime.setHours(14, 0, 0, 0);

  return {
    vehicleId,
    startTime: tomorrow.toISOString(),
    endTime: endTime.toISOString(),
    notes: 'Test booking',
    ...overrides,
  };
}
