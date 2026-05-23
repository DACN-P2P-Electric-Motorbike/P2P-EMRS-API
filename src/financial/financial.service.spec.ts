import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  BookingStatus,
  DepositLedgerStatus,
  HandoverType,
  PaymentMethod,
  PaymentStatus,
  PostTripChargeSource,
  PostTripChargeStatus,
  PostTripChargeType,
  TripStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FinancialService } from './financial.service';

const BOOKING_ID = 'booking-uuid';
const PAYMENT_ID = 'payment-uuid';
const TRIP_ID = 'trip-uuid';
const RENTER_ID = 'renter-uuid';
const OWNER_ID = 'owner-uuid';
const ADMIN_ID = 'admin-uuid';

const decimal = (value: number) => ({ toNumber: () => value });

const makePayment = (overrides: Record<string, unknown> = {}) => ({
  id: PAYMENT_ID,
  bookingId: BOOKING_ID,
  payerId: RENTER_ID,
  receiverId: OWNER_ID,
  amount: 620000,
  platformFee: 15000,
  ownerAmount: 85000,
  method: PaymentMethod.CASH,
  status: PaymentStatus.COMPLETED,
  transactionId: null,
  gatewayResponse: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  paidAt: new Date(),
  ...overrides,
});

const makeDeposit = (overrides: Record<string, unknown> = {}) => ({
  id: 'deposit-uuid',
  bookingId: BOOKING_ID,
  paymentId: PAYMENT_ID,
  status: DepositLedgerStatus.HELD,
  heldAmount: 500000,
  pendingChargeAmount: 0,
  capturedAmount: 0,
  releasedAmount: 0,
  refundedAmount: 0,
  notes: null,
  heldAt: new Date('2026-05-23T00:00:00.000Z'),
  releaseDueAt: null,
  releasedAt: null,
  disputedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeCharge = (overrides: Record<string, unknown> = {}) => ({
  id: 'charge-uuid',
  bookingId: BOOKING_ID,
  tripId: TRIP_ID,
  type: PostTripChargeType.LATE_RETURN,
  status: PostTripChargeStatus.PENDING_REVIEW,
  source: PostTripChargeSource.SYSTEM,
  amount: 10000,
  quantity: 1,
  unitPrice: 10000,
  description: 'Late return by 70 minutes',
  evidence: {},
  reviewedBy: null,
  reviewedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeBooking = (overrides: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  renterId: RENTER_ID,
  ownerId: OWNER_ID,
  vehicleId: 'vehicle-uuid',
  status: BookingStatus.COMPLETED,
  startTime: new Date('2026-05-23T01:00:00.000Z'),
  endTime: new Date('2026-05-23T05:00:00.000Z'),
  totalPrice: 100000,
  deposit: 500000,
  payment: makePayment(),
  trip: {
    id: TRIP_ID,
    status: TripStatus.COMPLETED,
    completedAt: new Date('2026-05-23T06:10:00.000Z'),
    distanceTraveled: 80,
    endBattery: 25,
  },
  depositLedger: makeDeposit(),
  postTripCharges: [],
  handovers: [
    {
      id: 'check-in',
      type: HandoverType.CHECK_IN,
      odometerReading: 1000,
      batteryLevel: 90,
      createdAt: new Date('2026-05-23T00:50:00.000Z'),
    },
    {
      id: 'check-out',
      type: HandoverType.CHECK_OUT,
      odometerReading: 1080,
      batteryLevel: 25,
      createdAt: new Date('2026-05-23T06:10:00.000Z'),
    },
  ],
  vehicle: {
    pricePerHour: decimal(10000),
    dailyKmLimit: 50,
    excessKmPrice: 2000,
    batteryReturnMin: 50,
  },
  ...overrides,
});

const mockPrisma = () => ({
  booking: {
    findUnique: jest.fn(),
  },
  depositLedger: {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  postTripCharge: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn((operations: Promise<unknown>[]) =>
    Promise.all(operations),
  ),
});

describe('FinancialService', () => {
  let service: FinancialService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new FinancialService(prisma as unknown as PrismaService);
    process.env.LOW_BATTERY_FEE_PER_PERCENT = '5000';
  });

  it('creates a held deposit ledger when payment completes', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ depositLedger: null }),
    );
    prisma.depositLedger.create.mockResolvedValue(makeDeposit());

    const result = await service.recordPaymentCompleted(BOOKING_ID, PAYMENT_ID);

    expect(prisma.depositLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: BOOKING_ID,
        paymentId: PAYMENT_ID,
        status: DepositLedgerStatus.HELD,
        heldAmount: 500000,
      }),
    });
    expect(result?.status).toBe(DepositLedgerStatus.HELD);
  });

  it('returns not found when a non-participant reads booking financials', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      service.getBookingFinancialSummary(BOOKING_ID, 'stranger', []),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows admins to read booking financials', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    const result = await service.getBookingFinancialSummary(
      BOOKING_ID,
      ADMIN_ID,
      [UserRole.ADMIN],
    );

    expect(result.deposit?.heldAmount).toBe(500000);
  });

  it('lists active financial queue items for admins', async () => {
    prisma.depositLedger.findMany.mockResolvedValue([makeDeposit()]);
    prisma.postTripCharge.findMany.mockResolvedValue([makeCharge()]);

    const result = await service.getAdminFinancialQueue(25);

    expect(prisma.depositLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
        where: expect.objectContaining({
          status: expect.objectContaining({
            in: expect.arrayContaining([DepositLedgerStatus.PENDING_CHARGES]),
          }),
        }),
      }),
    );
    expect(result.deposits).toHaveLength(1);
    expect(result.charges).toHaveLength(1);
  });

  it('calculates late, excess-distance, and low-battery charges after trip completion', async () => {
    const createdCharges: any[] = [];
    const booking = makeBooking();
    const syncedDeposit = makeDeposit({
      status: DepositLedgerStatus.PENDING_CHARGES,
      pendingChargeAmount: 195000,
      releasedAmount: 305000,
    });

    prisma.booking.findUnique
      .mockResolvedValueOnce(booking)
      .mockImplementationOnce(async () => ({
        ...booking,
        postTripCharges: createdCharges,
      }))
      .mockResolvedValueOnce({
        ...booking,
        depositLedger: syncedDeposit,
        postTripCharges: createdCharges,
      });
    prisma.postTripCharge.create.mockImplementation(async ({ data }) => {
      const charge = makeCharge({
        ...data,
        id: `${data.type}-uuid`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      createdCharges.push(charge);
      return charge;
    });
    prisma.depositLedger.update.mockResolvedValue(syncedDeposit);

    const result =
      await service.recalculatePostTripChargesForBooking(BOOKING_ID);

    expect(prisma.postTripCharge.create).toHaveBeenCalledTimes(3);
    expect(createdCharges.map((charge) => charge.type)).toEqual([
      PostTripChargeType.LATE_RETURN,
      PostTripChargeType.EXCESS_DISTANCE,
      PostTripChargeType.LOW_BATTERY,
    ]);
    expect(prisma.depositLedger.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DepositLedgerStatus.PENDING_CHARGES,
          pendingChargeAmount: 195000,
          releasedAmount: 305000,
        }),
      }),
    );
    expect(result.totalPendingCharges).toBe(195000);
  });

  it('rejects post-trip recalculation before trip completion', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({
        status: BookingStatus.ONGOING,
        trip: { status: TripStatus.ONGOING },
      }),
    );

    await expect(
      service.recalculatePostTripChargesForBooking(BOOKING_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('approves a charge and syncs pending deposit amount', async () => {
    const charge = makeCharge();
    const approvedCharge = makeCharge({
      status: PostTripChargeStatus.APPROVED,
      amount: 12000,
    });
    const syncedDeposit = makeDeposit({
      status: DepositLedgerStatus.PENDING_CHARGES,
      pendingChargeAmount: 12000,
      releasedAmount: 488000,
    });

    prisma.postTripCharge.findUnique.mockResolvedValue(charge);
    prisma.postTripCharge.update.mockResolvedValue(approvedCharge);
    prisma.booking.findUnique
      .mockResolvedValueOnce({
        ...makeBooking(),
        postTripCharges: [approvedCharge],
      })
      .mockResolvedValueOnce({
        ...makeBooking(),
        depositLedger: syncedDeposit,
        postTripCharges: [approvedCharge],
      });
    prisma.depositLedger.update.mockResolvedValue(syncedDeposit);

    const result = await service.updateChargeStatus('charge-uuid', ADMIN_ID, {
      status: PostTripChargeStatus.APPROVED,
      amount: 12000,
      notes: 'Valid late fee',
    });

    expect(prisma.postTripCharge.update).toHaveBeenCalledWith({
      where: { id: 'charge-uuid' },
      data: expect.objectContaining({
        status: PostTripChargeStatus.APPROVED,
        amount: 12000,
        reviewedBy: ADMIN_ID,
      }),
    });
    expect(result.totalApprovedCharges).toBe(12000);
  });

  it('captures approved charges from the deposit ledger', async () => {
    const approvedCharge = makeCharge({
      status: PostTripChargeStatus.APPROVED,
      amount: 40000,
    });
    const booking = makeBooking({ postTripCharges: [approvedCharge] });
    const updatedDeposit = makeDeposit({
      status: DepositLedgerStatus.PARTIALLY_CAPTURED,
      capturedAmount: 40000,
      releasedAmount: 460000,
    });

    prisma.booking.findUnique
      .mockResolvedValueOnce(booking)
      .mockResolvedValueOnce({
        ...booking,
        depositLedger: updatedDeposit,
        postTripCharges: [
          {
            ...approvedCharge,
            status: PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
          },
        ],
      });
    prisma.postTripCharge.updateMany.mockResolvedValue({ count: 1 });
    prisma.depositLedger.update.mockResolvedValue(updatedDeposit);

    const result = await service.captureApprovedChargesFromDeposit(
      BOOKING_ID,
      ADMIN_ID,
    );

    expect(prisma.postTripCharge.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['charge-uuid'] } },
      data: expect.objectContaining({
        status: PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
        reviewedBy: ADMIN_ID,
      }),
    });
    expect(result.totalCapturedCharges).toBe(40000);
  });

  it('blocks deposit release while charges are unresolved', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ postTripCharges: [makeCharge()] }),
    );

    await expect(service.releaseDeposit(BOOKING_ID, ADMIN_ID)).rejects.toThrow(
      'Cannot release deposit while charges are pending, approved, or disputed',
    );
  });
});
