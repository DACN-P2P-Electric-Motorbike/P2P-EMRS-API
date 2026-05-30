import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  BookingStatus,
  DepositLedgerStatus,
  HandoverType,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  PayoutStatus,
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

const makePayout = (overrides: Record<string, unknown> = {}) => ({
  id: 'payout-uuid',
  bookingId: BOOKING_ID,
  ownerId: OWNER_ID,
  paymentId: PAYMENT_ID,
  status: PayoutStatus.PENDING,
  grossRentalAmount: 100000,
  platformFee: 15000,
  ownerRentalAmount: 85000,
  postTripChargeAmount: 0,
  payoutAmount: 85000,
  holdReason: null,
  externalReference: null,
  notes: null,
  createdBy: ADMIN_ID,
  processedBy: null,
  processedAt: null,
  completedAt: null,
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
  prepaidCharging: false,
  prepaidChargingFee: 0,
  prepaidChargingCreditPercent: 0,
  roadsideSupport: false,
  roadsideSupportFee: 0,
  roadsideSupportCreditAmount: 0,
  payment: makePayment(),
  trip: {
    id: TRIP_ID,
    status: TripStatus.COMPLETED,
    completedAt: new Date('2026-05-23T06:10:00.000Z'),
    distanceTraveled: 80,
    endBattery: 25,
  },
  depositLedger: makeDeposit(),
  ownerPayout: null,
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
  incidentReport: {
    findFirst: jest.fn(),
  },
  ownerPayout: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
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

  it('notifies the renter when a deposit is held', async () => {
    const notificationService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };
    const notificationGateway = {
      isUserOnline: jest.fn().mockReturnValue(true),
      sendToUser: jest.fn(),
    };
    service = new FinancialService(
      prisma as unknown as PrismaService,
      notificationService as any,
      notificationGateway as any,
    );
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ depositLedger: null }),
    );
    prisma.depositLedger.create.mockResolvedValue(makeDeposit());

    await service.recordPaymentCompleted(BOOKING_ID, PAYMENT_ID);

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: RENTER_ID,
        type: NotificationType.DEPOSIT_UPDATED,
        bookingId: BOOKING_ID,
      }),
    );
    expect(notificationGateway.sendToUser).toHaveBeenCalledWith(
      RENTER_ID,
      'deposit_updated',
      expect.objectContaining({
        bookingId: BOOKING_ID,
        transition: 'HELD',
      }),
    );
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
    prisma.ownerPayout.findMany.mockResolvedValue([makePayout()]);

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
    expect(result.payouts).toHaveLength(1);
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

  it('bills only battery shortfall beyond prepaid charging credit', () => {
    const charges = (service as any).computeSystemCharges(
      makeBooking({
        prepaidCharging: true,
        prepaidChargingFee: 50000,
        prepaidChargingCreditPercent: 10,
      }),
    );
    const lowBatteryCharge = charges.find(
      (charge: any) => charge.type === PostTripChargeType.LOW_BATTERY,
    );

    expect(lowBatteryCharge).toEqual(
      expect.objectContaining({
        amount: 75000,
        quantity: 15,
        unitPrice: 5000,
        evidence: expect.objectContaining({
          shortByPercent: 25,
          prepaidCreditPercent: 10,
          billableShortfallPercent: 15,
        }),
      }),
    );
  });

  it('suppresses low-battery charge when prepaid credit covers the shortfall', () => {
    const booking = makeBooking({
      prepaidCharging: true,
      prepaidChargingFee: 50000,
      prepaidChargingCreditPercent: 10,
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
          batteryLevel: 45,
          createdAt: new Date('2026-05-23T06:10:00.000Z'),
        },
      ],
    });

    const charges = (service as any).computeSystemCharges(booking);

    expect(
      charges.some(
        (charge: any) => charge.type === PostTripChargeType.LOW_BATTERY,
      ),
    ).toBe(false);
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

  it('lets owners submit manual damage charges for admin review', async () => {
    const manualCharge = makeCharge({
      type: PostTripChargeType.DAMAGE,
      source: PostTripChargeSource.OWNER,
      status: PostTripChargeStatus.PENDING_REVIEW,
      amount: 75000,
      quantity: null,
      unitPrice: null,
      description: 'Rear panel scratch',
      evidence: {
        manual: {
          createdBy: OWNER_ID,
          createdRole: UserRole.OWNER,
        },
      },
    });
    const syncedDeposit = makeDeposit({
      status: DepositLedgerStatus.PENDING_CHARGES,
      pendingChargeAmount: 75000,
      releasedAmount: 425000,
    });

    prisma.booking.findUnique
      .mockResolvedValueOnce(makeBooking({ postTripCharges: [] }))
      .mockResolvedValueOnce(makeBooking({ postTripCharges: [manualCharge] }))
      .mockResolvedValueOnce(
        makeBooking({
          depositLedger: syncedDeposit,
          postTripCharges: [manualCharge],
        }),
      );
    prisma.postTripCharge.create.mockResolvedValue(manualCharge);
    prisma.depositLedger.update.mockResolvedValue(syncedDeposit);

    const result = await service.createManualPostTripCharge(
      BOOKING_ID,
      OWNER_ID,
      [UserRole.OWNER],
      {
        type: PostTripChargeType.DAMAGE,
        amount: 75000,
        description: 'Rear panel scratch',
        evidenceUrls: ['https://example.com/scratch.jpg'],
      },
    );

    expect(prisma.postTripCharge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: BOOKING_ID,
        tripId: TRIP_ID,
        type: PostTripChargeType.DAMAGE,
        source: PostTripChargeSource.OWNER,
        status: PostTripChargeStatus.PENDING_REVIEW,
        amount: 75000,
        description: 'Rear panel scratch',
        reviewedBy: null,
        reviewedAt: null,
        evidence: expect.objectContaining({
          manual: expect.objectContaining({
            createdBy: OWNER_ID,
            createdRole: UserRole.OWNER,
            evidenceUrls: ['https://example.com/scratch.jpg'],
          }),
        }),
      }),
    });
    expect(result.totalPendingCharges).toBe(75000);
  });

  it('lets admins create immediately approved manual cleaning charges', async () => {
    const manualCharge = makeCharge({
      type: PostTripChargeType.CLEANING,
      source: PostTripChargeSource.ADMIN,
      status: PostTripChargeStatus.APPROVED,
      amount: 30000,
      description: 'Cleaning fee approved by support',
      reviewedBy: ADMIN_ID,
      reviewedAt: new Date(),
    });
    const syncedDeposit = makeDeposit({
      status: DepositLedgerStatus.PENDING_CHARGES,
      pendingChargeAmount: 30000,
      releasedAmount: 470000,
    });

    prisma.booking.findUnique
      .mockResolvedValueOnce(makeBooking({ postTripCharges: [] }))
      .mockResolvedValueOnce(makeBooking({ postTripCharges: [manualCharge] }))
      .mockResolvedValueOnce(
        makeBooking({
          depositLedger: syncedDeposit,
          postTripCharges: [manualCharge],
        }),
      );
    prisma.postTripCharge.create.mockResolvedValue(manualCharge);
    prisma.depositLedger.update.mockResolvedValue(syncedDeposit);

    const result = await service.createManualPostTripCharge(
      BOOKING_ID,
      ADMIN_ID,
      [UserRole.ADMIN],
      {
        type: PostTripChargeType.CLEANING,
        amount: 30000,
        description: 'Cleaning fee approved by support',
      },
    );

    expect(prisma.postTripCharge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: PostTripChargeSource.ADMIN,
        status: PostTripChargeStatus.APPROVED,
        reviewedBy: ADMIN_ID,
        reviewedAt: expect.any(Date),
      }),
    });
    expect(result.totalApprovedCharges).toBe(30000);
  });

  it('applies roadside support credit to manual roadside assistance charges', async () => {
    const manualCharge = makeCharge({
      type: PostTripChargeType.ROADSIDE_ASSISTANCE,
      source: PostTripChargeSource.OWNER,
      status: PostTripChargeStatus.PENDING_REVIEW,
      amount: 50000,
      description: 'Roadside tire support',
      evidence: {
        manual: {
          createdBy: OWNER_ID,
          createdRole: UserRole.OWNER,
          roadsideSupport: {
            creditAmount: 200000,
            creditUsedBefore: 0,
            creditAppliedAmount: 200000,
            billableAmount: 50000,
          },
        },
      },
    });
    const syncedDeposit = makeDeposit({
      status: DepositLedgerStatus.PENDING_CHARGES,
      pendingChargeAmount: 50000,
      releasedAmount: 450000,
    });

    prisma.booking.findUnique
      .mockResolvedValueOnce(
        makeBooking({
          roadsideSupport: true,
          roadsideSupportFee: 30000,
          roadsideSupportCreditAmount: 200000,
          postTripCharges: [],
        }),
      )
      .mockResolvedValueOnce(makeBooking({ postTripCharges: [manualCharge] }))
      .mockResolvedValueOnce(
        makeBooking({
          depositLedger: syncedDeposit,
          postTripCharges: [manualCharge],
        }),
      );
    prisma.postTripCharge.create.mockResolvedValue(manualCharge);
    prisma.depositLedger.update.mockResolvedValue(syncedDeposit);

    const result = await service.createManualPostTripCharge(
      BOOKING_ID,
      OWNER_ID,
      [UserRole.OWNER],
      {
        type: PostTripChargeType.ROADSIDE_ASSISTANCE,
        amount: 250000,
        description: 'Roadside tire support',
      },
    );

    expect(prisma.postTripCharge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: PostTripChargeType.ROADSIDE_ASSISTANCE,
        status: PostTripChargeStatus.PENDING_REVIEW,
        amount: 50000,
        evidence: expect.objectContaining({
          manual: expect.objectContaining({
            requestedAmount: 250000,
            roadsideSupport: expect.objectContaining({
              creditAppliedAmount: 200000,
              billableAmount: 50000,
            }),
          }),
        }),
      }),
    });
    expect(result.totalPendingCharges).toBe(50000);
  });

  it('waives manual roadside assistance charges fully covered by roadside support credit', async () => {
    const manualCharge = makeCharge({
      type: PostTripChargeType.ROADSIDE_ASSISTANCE,
      source: PostTripChargeSource.OWNER,
      status: PostTripChargeStatus.WAIVED,
      amount: 0,
      description: 'Roadside battery rescue',
      reviewedBy: OWNER_ID,
      reviewedAt: new Date(),
      evidence: {
        manual: {
          createdBy: OWNER_ID,
          createdRole: UserRole.OWNER,
          roadsideSupport: {
            creditAmount: 200000,
            creditUsedBefore: 0,
            creditAppliedAmount: 150000,
            billableAmount: 0,
          },
        },
      },
    });
    const syncedDeposit = makeDeposit({
      status: DepositLedgerStatus.RELEASE_PENDING,
      pendingChargeAmount: 0,
      releasedAmount: 500000,
    });

    prisma.booking.findUnique
      .mockResolvedValueOnce(
        makeBooking({
          roadsideSupport: true,
          roadsideSupportFee: 30000,
          roadsideSupportCreditAmount: 200000,
          postTripCharges: [],
        }),
      )
      .mockResolvedValueOnce(makeBooking({ postTripCharges: [manualCharge] }))
      .mockResolvedValueOnce(
        makeBooking({
          depositLedger: syncedDeposit,
          postTripCharges: [manualCharge],
        }),
      );
    prisma.postTripCharge.create.mockResolvedValue(manualCharge);
    prisma.depositLedger.update.mockResolvedValue(syncedDeposit);

    const result = await service.createManualPostTripCharge(
      BOOKING_ID,
      OWNER_ID,
      [UserRole.OWNER],
      {
        type: PostTripChargeType.ROADSIDE_ASSISTANCE,
        amount: 150000,
        description: 'Roadside battery rescue',
      },
    );

    expect(prisma.postTripCharge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: PostTripChargeStatus.WAIVED,
        amount: 0,
        reviewedBy: OWNER_ID,
        reviewedAt: expect.any(Date),
      }),
    });
    expect(result.totalPendingCharges).toBe(0);
  });

  it('lets renters dispute pending or approved charges and marks deposit disputed', async () => {
    const approvedCharge = makeCharge({
      status: PostTripChargeStatus.APPROVED,
      amount: 40000,
      evidence: {
        manual: {
          createdBy: OWNER_ID,
        },
      },
    });
    const disputedCharge = makeCharge({
      ...approvedCharge,
      status: PostTripChargeStatus.DISPUTED,
      evidence: {
        manual: {
          createdBy: OWNER_ID,
        },
        dispute: {
          reason: 'Damage existed before pickup',
          disputedBy: RENTER_ID,
        },
      },
    });
    const disputedDeposit = makeDeposit({
      status: DepositLedgerStatus.DISPUTED,
      pendingChargeAmount: 40000,
      releasedAmount: 460000,
      disputedAt: new Date('2026-05-23T08:00:00.000Z'),
    });

    prisma.postTripCharge.findUnique.mockResolvedValue(approvedCharge);
    prisma.booking.findUnique
      .mockResolvedValueOnce(makeBooking({ postTripCharges: [approvedCharge] }))
      .mockResolvedValueOnce(makeBooking({ postTripCharges: [disputedCharge] }))
      .mockResolvedValueOnce(
        makeBooking({
          depositLedger: disputedDeposit,
          postTripCharges: [disputedCharge],
        }),
      );
    prisma.postTripCharge.update.mockResolvedValue(disputedCharge);
    prisma.depositLedger.update.mockResolvedValue(disputedDeposit);

    const result = await service.disputePostTripCharge(
      'charge-uuid',
      RENTER_ID,
      {
        reason: 'Damage existed before pickup',
        evidenceUrls: ['https://example.com/check-in.jpg'],
      },
    );

    expect(prisma.postTripCharge.update).toHaveBeenCalledWith({
      where: { id: 'charge-uuid' },
      data: expect.objectContaining({
        status: PostTripChargeStatus.DISPUTED,
        evidence: expect.objectContaining({
          manual: expect.objectContaining({ createdBy: OWNER_ID }),
          dispute: expect.objectContaining({
            reason: 'Damage existed before pickup',
            disputedBy: RENTER_ID,
            evidenceUrls: ['https://example.com/check-in.jpg'],
          }),
        }),
      }),
    });
    expect(prisma.depositLedger.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DepositLedgerStatus.DISPUTED,
          pendingChargeAmount: 40000,
          releasedAmount: 460000,
          disputedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.deposit?.status).toBe(DepositLedgerStatus.DISPUTED);
    expect(result.releasableDeposit).toBe(460000);
  });

  it('hides charge disputes from non-renters', async () => {
    prisma.postTripCharge.findUnique.mockResolvedValue(makeCharge());
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      service.disputePostTripCharge('charge-uuid', OWNER_ID, {
        reason: 'Owner cannot dispute as renter',
      }),
    ).rejects.toThrow(NotFoundException);
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

  it('blocks deposit release while incident reports are open', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ postTripCharges: [] }),
    );
    prisma.incidentReport.findFirst.mockResolvedValue({ id: 'incident-uuid' });

    await expect(service.releaseDeposit(BOOKING_ID, ADMIN_ID)).rejects.toThrow(
      'Cannot release deposit while incident reports are open or under review',
    );
  });

  it('releases clean deposits and prepares an owner payout', async () => {
    const finalizedCharge = makeCharge({
      status: PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
      amount: 40000,
    });
    const booking = makeBooking({
      depositLedger: makeDeposit({
        status: DepositLedgerStatus.PARTIALLY_CAPTURED,
        capturedAmount: 40000,
        releasedAmount: 460000,
      }),
      postTripCharges: [finalizedCharge],
    });
    const releasedDeposit = makeDeposit({
      status: DepositLedgerStatus.RELEASED,
      capturedAmount: 40000,
      releasedAmount: 460000,
      releasedAt: new Date(),
    });
    const payout = makePayout({
      postTripChargeAmount: 40000,
      payoutAmount: 125000,
    });

    prisma.booking.findUnique
      .mockResolvedValueOnce(booking)
      .mockResolvedValueOnce(
        makeBooking({
          depositLedger: releasedDeposit,
          postTripCharges: [finalizedCharge],
        }),
      )
      .mockResolvedValueOnce(
        makeBooking({
          depositLedger: releasedDeposit,
          ownerPayout: payout,
          postTripCharges: [finalizedCharge],
        }),
      );
    prisma.incidentReport.findFirst.mockResolvedValue(null);
    prisma.depositLedger.update.mockResolvedValue(releasedDeposit);
    prisma.ownerPayout.upsert.mockResolvedValue(payout);

    const result = await service.releaseDeposit(BOOKING_ID, ADMIN_ID);

    expect(prisma.depositLedger.update).toHaveBeenCalledWith({
      where: { id: 'deposit-uuid' },
      data: expect.objectContaining({
        status: DepositLedgerStatus.RELEASED,
        releasedAmount: 460000,
      }),
    });
    expect(prisma.ownerPayout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          bookingId: BOOKING_ID,
          ownerId: OWNER_ID,
          status: PayoutStatus.PENDING,
          ownerRentalAmount: 85000,
          postTripChargeAmount: 40000,
          payoutAmount: 125000,
        }),
      }),
    );
    expect(result.ownerPayout?.status).toBe(PayoutStatus.PENDING);
  });

  it('creates a ready owner payout from completed financials', async () => {
    const finalizedCharge = makeCharge({
      status: PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
      amount: 40000,
    });
    const payout = makePayout({
      postTripChargeAmount: 40000,
      payoutAmount: 125000,
    });

    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({
        depositLedger: makeDeposit({ status: DepositLedgerStatus.RELEASED }),
        postTripCharges: [finalizedCharge],
      }),
    );
    prisma.incidentReport.findFirst.mockResolvedValue(null);
    prisma.ownerPayout.upsert.mockResolvedValue(payout);

    const result = await service.createOrRefreshOwnerPayout(
      BOOKING_ID,
      ADMIN_ID,
    );

    expect(prisma.ownerPayout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: BOOKING_ID },
        create: expect.objectContaining({
          status: PayoutStatus.PENDING,
          grossRentalAmount: 100000,
          platformFee: 15000,
          ownerRentalAmount: 85000,
          postTripChargeAmount: 40000,
          payoutAmount: 125000,
          holdReason: null,
        }),
      }),
    );
    expect(result.payoutAmount).toBe(125000);
  });

  it('holds owner payouts while charges remain unresolved', async () => {
    const heldPayout = makePayout({
      status: PayoutStatus.ON_HOLD,
      holdReason: 'post-trip charge charge-uuid is unresolved',
    });

    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({
        depositLedger: makeDeposit({
          status: DepositLedgerStatus.PENDING_CHARGES,
        }),
        postTripCharges: [makeCharge()],
      }),
    );
    prisma.ownerPayout.upsert.mockResolvedValue(heldPayout);

    const result = await service.createOrRefreshOwnerPayout(
      BOOKING_ID,
      ADMIN_ID,
    );

    expect(prisma.ownerPayout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: PayoutStatus.ON_HOLD,
          holdReason: 'post-trip charge charge-uuid is unresolved',
        }),
      }),
    );
    expect(result.status).toBe(PayoutStatus.ON_HOLD);
  });

  it('blocks processing payouts while blockers remain', async () => {
    const payout = makePayout({
      status: PayoutStatus.ON_HOLD,
      holdReason: 'post-trip charge charge-uuid is unresolved',
    });

    prisma.ownerPayout.findUnique.mockResolvedValue(payout);
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({
        ownerPayout: payout,
        postTripCharges: [makeCharge()],
      }),
    );

    await expect(
      service.updateOwnerPayoutStatus('payout-uuid', ADMIN_ID, {
        status: PayoutStatus.PROCESSING,
      }),
    ).rejects.toThrow('Cannot process payout while');
  });

  it('marks owner payouts completed with processing metadata', async () => {
    const payout = makePayout({ status: PayoutStatus.PROCESSING });
    const completedPayout = makePayout({
      status: PayoutStatus.COMPLETED,
      externalReference: 'BANK-TXN-1',
      processedBy: ADMIN_ID,
      processedAt: new Date(),
      completedAt: new Date(),
      notes: 'Paid by bank transfer',
    });

    prisma.ownerPayout.findUnique.mockResolvedValue(payout);
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({
        depositLedger: makeDeposit({ status: DepositLedgerStatus.RELEASED }),
        ownerPayout: payout,
      }),
    );
    prisma.incidentReport.findFirst.mockResolvedValue(null);
    prisma.ownerPayout.update.mockResolvedValue(completedPayout);

    const result = await service.updateOwnerPayoutStatus(
      'payout-uuid',
      ADMIN_ID,
      {
        status: PayoutStatus.COMPLETED,
        externalReference: 'BANK-TXN-1',
        notes: 'Paid by bank transfer',
      },
    );

    expect(prisma.ownerPayout.update).toHaveBeenCalledWith({
      where: { id: 'payout-uuid' },
      data: expect.objectContaining({
        status: PayoutStatus.COMPLETED,
        externalReference: 'BANK-TXN-1',
        notes: 'Paid by bank transfer',
        processedBy: ADMIN_ID,
        processedAt: expect.any(Date),
        completedAt: expect.any(Date),
        holdReason: null,
      }),
    });
    expect(result.status).toBe(PayoutStatus.COMPLETED);
  });

  // =========================================================================
  // Coverage — recordPaymentCompleted guards + ledger update path
  // =========================================================================
  describe('recordPaymentCompleted — guards and update path', () => {
    it('returns null when the booking is missing', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      const result = await service.recordPaymentCompleted(
        BOOKING_ID,
        PAYMENT_ID,
      );

      expect(result).toBeNull();
      expect(prisma.depositLedger.create).not.toHaveBeenCalled();
    });

    it('returns null when the payment is not completed', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          depositLedger: null,
          payment: makePayment({ status: PaymentStatus.PENDING }),
        }),
      );

      const result = await service.recordPaymentCompleted(
        BOOKING_ID,
        PAYMENT_ID,
      );

      expect(result).toBeNull();
      expect(prisma.depositLedger.create).not.toHaveBeenCalled();
    });

    it('returns null when the booking has no payment record at all', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ depositLedger: null, payment: null }),
      );

      const result = await service.recordPaymentCompleted(
        BOOKING_ID,
        PAYMENT_ID,
      );

      expect(result).toBeNull();
      expect(prisma.depositLedger.create).not.toHaveBeenCalled();
    });

    it('creates a NOT_HELD ledger when no deposit is required', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ deposit: 0, depositLedger: null }),
      );
      prisma.depositLedger.create.mockResolvedValue(
        makeDeposit({ status: DepositLedgerStatus.NOT_HELD, heldAmount: 0 }),
      );

      const result = await service.recordPaymentCompleted(
        BOOKING_ID,
        PAYMENT_ID,
      );

      expect(prisma.depositLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: DepositLedgerStatus.NOT_HELD,
          heldAmount: 0,
          heldAt: null,
          notes: 'No deposit required for this booking',
        }),
      });
      expect(result?.status).toBe(DepositLedgerStatus.NOT_HELD);
    });

    it('promotes an existing NOT_HELD ledger to HELD when a deposit appears', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          depositLedger: makeDeposit({
            status: DepositLedgerStatus.NOT_HELD,
            heldAmount: 0,
            heldAt: null,
            notes: null,
          }),
        }),
      );
      prisma.depositLedger.update.mockResolvedValue(
        makeDeposit({ status: DepositLedgerStatus.HELD }),
      );

      const result = await service.recordPaymentCompleted(
        BOOKING_ID,
        PAYMENT_ID,
      );

      expect(prisma.depositLedger.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deposit-uuid' },
          data: expect.objectContaining({
            status: DepositLedgerStatus.HELD,
            heldAmount: 500000,
          }),
        }),
      );
      expect(result?.status).toBe(DepositLedgerStatus.HELD);
    });

    it('leaves an already-held ledger untouched without re-notifying', async () => {
      const notificationService = {
        createNotification: jest.fn().mockResolvedValue({ id: 'n1' }),
      };
      const notificationGateway = {
        isUserOnline: jest.fn().mockReturnValue(false),
        sendToUser: jest.fn(),
      };
      service = new FinancialService(
        prisma as unknown as PrismaService,
        notificationService as any,
        notificationGateway as any,
      );
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          depositLedger: makeDeposit({
            status: DepositLedgerStatus.HELD,
            heldAmount: 500000,
            heldAt: new Date('2026-05-23T00:00:00.000Z'),
            notes: 'already held',
          }),
        }),
      );
      prisma.depositLedger.update.mockResolvedValue(
        makeDeposit({ status: DepositLedgerStatus.HELD }),
      );

      await service.recordPaymentCompleted(BOOKING_ID, PAYMENT_ID);

      // No state change → no notification emitted.
      expect(notificationService.createNotification).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Coverage — getAdminFinancialQueue limit clamping
  // =========================================================================
  describe('getAdminFinancialQueue — limit clamping', () => {
    beforeEach(() => {
      prisma.depositLedger.findMany.mockResolvedValue([]);
      prisma.postTripCharge.findMany.mockResolvedValue([]);
      prisma.ownerPayout.findMany.mockResolvedValue([]);
    });

    it('defaults to 50 when limit is zero', async () => {
      await service.getAdminFinancialQueue(0);
      expect(prisma.depositLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('clamps to a maximum of 100', async () => {
      await service.getAdminFinancialQueue(5000);
      expect(prisma.depositLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('clamps to a minimum of 1 for negative limits', async () => {
      await service.getAdminFinancialQueue(-10);
      expect(prisma.depositLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });

    it('uses the default page size when called with no args', async () => {
      await service.getAdminFinancialQueue();
      expect(prisma.ownerPayout.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });
  });

  // =========================================================================
  // Coverage — recalculatePostTripChargesForBooking branches
  // =========================================================================
  describe('recalculatePostTripChargesForBooking — branches', () => {
    it('throws NotFound when the booking does not exist', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(
        service.recalculatePostTripChargesForBooking(BOOKING_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates the deposit ledger lazily when missing but payment completed', async () => {
      const booking = makeBooking({
        depositLedger: null,
        // No late/excess/low-battery charges so no creates happen.
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
            odometerReading: 1010,
            batteryLevel: 80,
            createdAt: new Date('2026-05-23T05:05:00.000Z'),
          },
        ],
        trip: {
          id: TRIP_ID,
          status: TripStatus.COMPLETED,
          completedAt: new Date('2026-05-23T05:05:00.000Z'),
          distanceTraveled: 10,
          endBattery: 80,
        },
      });

      prisma.booking.findUnique
        // 1) recalculate's initial load
        .mockResolvedValueOnce(booking)
        // 2) recordPaymentCompleted's own load (depositLedger null)
        .mockResolvedValueOnce(
          makeBooking({ depositLedger: null, postTripCharges: [] }),
        )
        // 3) syncDepositForBooking load (depositLedger present)
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [] }))
        // 4) final findBookingWithFinancials
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [] }));
      prisma.depositLedger.create.mockResolvedValue(makeDeposit());
      prisma.depositLedger.update.mockResolvedValue(makeDeposit());

      await service.recalculatePostTripChargesForBooking(BOOKING_ID);

      expect(prisma.depositLedger.create).toHaveBeenCalled();
    });

    it('updates an existing pending system charge and cancels obsolete ones', async () => {
      // Existing LATE_RETURN pending charge will be updated; an existing
      // pending CLEANING system charge becomes obsolete and is cancelled.
      const existingLate = makeCharge({
        id: 'late-uuid',
        type: PostTripChargeType.LATE_RETURN,
        source: PostTripChargeSource.SYSTEM,
        status: PostTripChargeStatus.PENDING_REVIEW,
      });
      const obsolete = makeCharge({
        id: 'cleaning-uuid',
        type: PostTripChargeType.CLEANING,
        source: PostTripChargeSource.SYSTEM,
        status: PostTripChargeStatus.PENDING_REVIEW,
      });
      const bookingWithExisting = makeBooking({
        postTripCharges: [existingLate, obsolete],
      });

      prisma.booking.findUnique
        .mockResolvedValueOnce(bookingWithExisting)
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [] }))
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [] }));
      prisma.postTripCharge.update.mockResolvedValue(existingLate);
      prisma.postTripCharge.create.mockImplementation(async ({ data }) =>
        makeCharge({ ...data, id: `${data.type}-new` }),
      );
      prisma.depositLedger.update.mockResolvedValue(makeDeposit());

      await service.recalculatePostTripChargesForBooking(BOOKING_ID);

      // The pending LATE_RETURN gets updated in place...
      expect(prisma.postTripCharge.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'late-uuid' } }),
      );
      // ...and the obsolete CLEANING system charge is cancelled.
      expect(prisma.postTripCharge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cleaning-uuid' },
          data: expect.objectContaining({
            status: PostTripChargeStatus.CANCELLED,
          }),
        }),
      );
    });

    it('skips updating an existing system charge that is no longer pending', async () => {
      const approvedLate = makeCharge({
        id: 'late-uuid',
        type: PostTripChargeType.LATE_RETURN,
        source: PostTripChargeSource.SYSTEM,
        status: PostTripChargeStatus.APPROVED,
      });
      const booking = makeBooking({ postTripCharges: [approvedLate] });

      prisma.booking.findUnique
        .mockResolvedValueOnce(booking)
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [approvedLate] }))
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [approvedLate] }));
      prisma.depositLedger.update.mockResolvedValue(makeDeposit());

      await service.recalculatePostTripChargesForBooking(BOOKING_ID);

      // The already-approved LATE_RETURN must not be re-updated as a recompute.
      const updatedLate = prisma.postTripCharge.update.mock.calls.some(
        (call) =>
          call[0].where.id === 'late-uuid' &&
          call[0].data?.status !== PostTripChargeStatus.CANCELLED,
      );
      expect(updatedLate).toBe(false);
    });

    it('throws NotFound when the booking vanishes after recalculation', async () => {
      const booking = makeBooking({ postTripCharges: [] });
      prisma.booking.findUnique
        .mockResolvedValueOnce(booking) // initial load
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [] })) // sync internal
        .mockResolvedValueOnce(null); // final re-fetch → gone
      prisma.depositLedger.update.mockResolvedValue(makeDeposit());

      await expect(
        service.recalculatePostTripChargesForBooking(BOOKING_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // Coverage — createManualPostTripCharge guards
  // =========================================================================
  describe('createManualPostTripCharge — guards', () => {
    const dto = {
      type: PostTripChargeType.CLEANING,
      amount: 30000,
      description: 'Cleaning',
    };

    it('throws NotFound when booking is missing', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(
        service.createManualPostTripCharge(BOOKING_ID, OWNER_ID, [], dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('hides the booking from users who are neither owner nor admin', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      await expect(
        service.createManualPostTripCharge(BOOKING_ID, 'stranger', [], dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects manual charges before trip completion', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          status: BookingStatus.ONGOING,
          trip: { id: TRIP_ID, status: TripStatus.ONGOING },
        }),
      );
      await expect(
        service.createManualPostTripCharge(BOOKING_ID, OWNER_ID, [], dto),
      ).rejects.toThrow('after trip completion');
    });

    it('rejects unsupported manual charge types', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      await expect(
        service.createManualPostTripCharge(BOOKING_ID, OWNER_ID, [], {
          ...dto,
          type: PostTripChargeType.LATE_RETURN,
        }),
      ).rejects.toThrow('Unsupported manual post-trip charge type');
    });

    it('rejects manual charges once the deposit is finalized', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          depositLedger: makeDeposit({
            status: DepositLedgerStatus.CAPTURED,
          }),
        }),
      );
      await expect(
        service.createManualPostTripCharge(BOOKING_ID, OWNER_ID, [], dto),
      ).rejects.toThrow('after the deposit is finalized');
    });
  });

  // =========================================================================
  // Coverage — updateChargeStatus guards
  // =========================================================================
  describe('updateChargeStatus — guards', () => {
    it('throws NotFound when the charge does not exist', async () => {
      prisma.postTripCharge.findUnique.mockResolvedValue(null);
      await expect(
        service.updateChargeStatus('missing', ADMIN_ID, {
          status: PostTripChargeStatus.APPROVED,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects unsupported review statuses', async () => {
      prisma.postTripCharge.findUnique.mockResolvedValue(makeCharge());
      await expect(
        service.updateChargeStatus('charge-uuid', ADMIN_ID, {
          status: PostTripChargeStatus.PENDING_REVIEW,
        }),
      ).rejects.toThrow('Unsupported charge review status');
    });

    it('rejects changes to finalized charges', async () => {
      prisma.postTripCharge.findUnique.mockResolvedValue(
        makeCharge({ status: PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT }),
      );
      await expect(
        service.updateChargeStatus('charge-uuid', ADMIN_ID, {
          status: PostTripChargeStatus.WAIVED,
        }),
      ).rejects.toThrow('Finalized charges cannot be changed');
    });

    it('throws NotFound when the booking vanishes after the charge update', async () => {
      const charge = makeCharge();
      const reviewed = makeCharge({ status: PostTripChargeStatus.WAIVED });
      prisma.postTripCharge.findUnique.mockResolvedValue(charge);
      prisma.postTripCharge.update.mockResolvedValue(reviewed);
      // syncDepositForBooking's own read, then the post-sync re-fetch → null.
      prisma.booking.findUnique
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [reviewed] }))
        .mockResolvedValueOnce(null);
      prisma.depositLedger.update.mockResolvedValue(makeDeposit());

      await expect(
        service.updateChargeStatus('charge-uuid', ADMIN_ID, {
          status: PostTripChargeStatus.WAIVED,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('keeps the original amount when approving without an explicit amount', async () => {
      const charge = makeCharge({ amount: 10000 });
      const reviewed = makeCharge({ status: PostTripChargeStatus.APPROVED });
      prisma.postTripCharge.findUnique.mockResolvedValue(charge);
      prisma.postTripCharge.update.mockResolvedValue(reviewed);
      prisma.booking.findUnique
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [reviewed] }))
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [reviewed] }));
      prisma.depositLedger.update.mockResolvedValue(makeDeposit());

      await service.updateChargeStatus('charge-uuid', ADMIN_ID, {
        status: PostTripChargeStatus.APPROVED,
      });

      expect(prisma.postTripCharge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 10000 }),
        }),
      );
    });

    it('waives a charge and merges review evidence with notes', async () => {
      const charge = makeCharge({ evidence: { manual: { createdBy: OWNER_ID } } });
      const waived = makeCharge({ status: PostTripChargeStatus.WAIVED });
      prisma.postTripCharge.findUnique.mockResolvedValue(charge);
      prisma.postTripCharge.update.mockResolvedValue(waived);
      prisma.booking.findUnique
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [waived] }))
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [waived] }));
      prisma.depositLedger.update.mockResolvedValue(makeDeposit());

      await service.updateChargeStatus('charge-uuid', ADMIN_ID, {
        status: PostTripChargeStatus.WAIVED,
        notes: '  edge case  ',
      });

      expect(prisma.postTripCharge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PostTripChargeStatus.WAIVED,
            evidence: expect.objectContaining({
              manual: expect.objectContaining({ createdBy: OWNER_ID }),
              review: expect.objectContaining({ reviewNotes: 'edge case' }),
            }),
          }),
        }),
      );
    });
  });

  // =========================================================================
  // Coverage — disputePostTripCharge guards
  // =========================================================================
  describe('disputePostTripCharge — guards', () => {
    it('throws NotFound when the charge is missing', async () => {
      prisma.postTripCharge.findUnique.mockResolvedValue(null);
      await expect(
        service.disputePostTripCharge('missing', RENTER_ID, {
          reason: 'x',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects disputing a charge that is neither pending nor approved', async () => {
      prisma.postTripCharge.findUnique.mockResolvedValue(
        makeCharge({ status: PostTripChargeStatus.WAIVED }),
      );
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      await expect(
        service.disputePostTripCharge('charge-uuid', RENTER_ID, {
          reason: 'too late',
        }),
      ).rejects.toThrow('Only pending or approved charges can be disputed');
    });
  });

  // =========================================================================
  // Coverage — captureApprovedChargesFromDeposit guards
  // =========================================================================
  describe('captureApprovedChargesFromDeposit — guards', () => {
    it('throws NotFound when the booking is missing', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(
        service.captureApprovedChargesFromDeposit(BOOKING_ID, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when the deposit ledger has not been created', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ depositLedger: null }),
      );
      await expect(
        service.captureApprovedChargesFromDeposit(BOOKING_ID, ADMIN_ID),
      ).rejects.toThrow('Deposit ledger has not been created');
    });

    it('rejects when there are no approved charges to capture', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ postTripCharges: [] }),
      );
      await expect(
        service.captureApprovedChargesFromDeposit(BOOKING_ID, ADMIN_ID),
      ).rejects.toThrow('No approved charges to capture');
    });

    it('rejects when approved charges exceed the available deposit', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          depositLedger: makeDeposit({
            heldAmount: 10000,
            capturedAmount: 0,
          }),
          postTripCharges: [
            makeCharge({
              status: PostTripChargeStatus.APPROVED,
              amount: 50000,
            }),
          ],
        }),
      );
      await expect(
        service.captureApprovedChargesFromDeposit(BOOKING_ID, ADMIN_ID),
      ).rejects.toThrow('exceed the available deposit balance');
    });

    it('fully captures the deposit when nothing remains to release', async () => {
      const approvedCharge = makeCharge({
        status: PostTripChargeStatus.APPROVED,
        amount: 500000,
      });
      const booking = makeBooking({ postTripCharges: [approvedCharge] });
      const capturedDeposit = makeDeposit({
        status: DepositLedgerStatus.CAPTURED,
        capturedAmount: 500000,
        releasedAmount: 0,
      });

      prisma.booking.findUnique
        .mockResolvedValueOnce(booking)
        .mockResolvedValueOnce(
          makeBooking({
            depositLedger: capturedDeposit,
            postTripCharges: [
              {
                ...approvedCharge,
                status: PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
              },
            ],
          }),
        );
      prisma.postTripCharge.updateMany.mockResolvedValue({ count: 1 });
      prisma.depositLedger.update.mockResolvedValue(capturedDeposit);

      const result = await service.captureApprovedChargesFromDeposit(
        BOOKING_ID,
        ADMIN_ID,
      );

      expect(prisma.depositLedger.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DepositLedgerStatus.CAPTURED,
            capturedAmount: 500000,
            releasedAmount: 0,
          }),
        }),
      );
      expect(result.totalCapturedCharges).toBe(500000);
    });
  });

  // =========================================================================
  // Coverage — releaseDeposit branches
  // =========================================================================
  describe('releaseDeposit — branches', () => {
    it('throws NotFound when the booking is missing', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(
        service.releaseDeposit(BOOKING_ID, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when the deposit ledger has not been created', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ depositLedger: null }),
      );
      await expect(
        service.releaseDeposit(BOOKING_ID, ADMIN_ID),
      ).rejects.toThrow('Deposit ledger has not been created');
    });

    it('marks the deposit CAPTURED when there is nothing left to release', async () => {
      const booking = makeBooking({
        depositLedger: makeDeposit({
          status: DepositLedgerStatus.CAPTURED,
          heldAmount: 500000,
          capturedAmount: 500000,
        }),
        postTripCharges: [],
      });
      const capturedDeposit = makeDeposit({
        status: DepositLedgerStatus.CAPTURED,
        heldAmount: 500000,
        capturedAmount: 500000,
        releasedAmount: 0,
      });

      prisma.booking.findUnique
        .mockResolvedValueOnce(booking)
        .mockResolvedValueOnce(
          makeBooking({ depositLedger: capturedDeposit, postTripCharges: [] }),
        )
        .mockResolvedValueOnce(
          makeBooking({
            depositLedger: capturedDeposit,
            ownerPayout: makePayout(),
            postTripCharges: [],
          }),
        );
      prisma.incidentReport.findFirst.mockResolvedValue(null);
      prisma.depositLedger.update.mockResolvedValue(capturedDeposit);
      prisma.ownerPayout.upsert.mockResolvedValue(makePayout());

      await service.releaseDeposit(BOOKING_ID, ADMIN_ID);

      expect(prisma.depositLedger.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DepositLedgerStatus.CAPTURED,
            releasedAmount: 0,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // Coverage — createOrRefreshOwnerPayout branches
  // =========================================================================
  describe('createOrRefreshOwnerPayout — branches', () => {
    it('throws NotFound when the booking is missing', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(
        service.createOrRefreshOwnerPayout(BOOKING_ID, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the existing payout untouched when already completed', async () => {
      const completed = makePayout({ status: PayoutStatus.COMPLETED });
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ ownerPayout: completed }),
      );

      const result = await service.createOrRefreshOwnerPayout(
        BOOKING_ID,
        ADMIN_ID,
      );

      expect(prisma.ownerPayout.upsert).not.toHaveBeenCalled();
      expect(result.status).toBe(PayoutStatus.COMPLETED);
    });

    it('preserves a non-pending existing status when there is no hold reason', async () => {
      const existing = makePayout({ status: PayoutStatus.FAILED });
      const refreshed = makePayout({ status: PayoutStatus.FAILED });
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          depositLedger: makeDeposit({ status: DepositLedgerStatus.RELEASED }),
          ownerPayout: existing,
          postTripCharges: [],
        }),
      );
      prisma.incidentReport.findFirst.mockResolvedValue(null);
      prisma.ownerPayout.upsert.mockResolvedValue(refreshed);

      const result = await service.createOrRefreshOwnerPayout(
        BOOKING_ID,
        ADMIN_ID,
      );

      expect(prisma.ownerPayout.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ status: PayoutStatus.FAILED }),
        }),
      );
      // Status unchanged from existing → no notification path needed.
      expect(result.status).toBe(PayoutStatus.FAILED);
    });
  });

  // =========================================================================
  // Coverage — updateOwnerPayoutStatus branches
  // =========================================================================
  describe('updateOwnerPayoutStatus — branches', () => {
    it('throws NotFound when the payout is missing', async () => {
      prisma.ownerPayout.findUnique.mockResolvedValue(null);
      await expect(
        service.updateOwnerPayoutStatus('missing', ADMIN_ID, {
          status: PayoutStatus.COMPLETED,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects unsupported payout statuses', async () => {
      prisma.ownerPayout.findUnique.mockResolvedValue(makePayout());
      await expect(
        service.updateOwnerPayoutStatus('payout-uuid', ADMIN_ID, {
          status: PayoutStatus.ON_HOLD,
        }),
      ).rejects.toThrow('Unsupported payout status');
    });

    it('throws NotFound when the booking is missing during a processing transition', async () => {
      prisma.ownerPayout.findUnique.mockResolvedValue(
        makePayout({ status: PayoutStatus.PENDING }),
      );
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(
        service.updateOwnerPayoutStatus('payout-uuid', ADMIN_ID, {
          status: PayoutStatus.PROCESSING,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects processing when the payout amount is not positive', async () => {
      prisma.ownerPayout.findUnique.mockResolvedValue(
        makePayout({ status: PayoutStatus.PENDING, payoutAmount: 0 }),
      );
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          depositLedger: makeDeposit({ status: DepositLedgerStatus.RELEASED }),
        }),
      );
      prisma.incidentReport.findFirst.mockResolvedValue(null);
      await expect(
        service.updateOwnerPayoutStatus('payout-uuid', ADMIN_ID, {
          status: PayoutStatus.PROCESSING,
        }),
      ).rejects.toThrow('Payout amount must be greater than zero');
    });

    it('cancels a payout and keeps the existing hold reason and processedAt', async () => {
      const payout = makePayout({
        status: PayoutStatus.ON_HOLD,
        holdReason: 'manual hold',
        processedAt: new Date('2026-05-20T00:00:00.000Z'),
        externalReference: 'EXT-1',
        notes: 'prev note',
      });
      const cancelled = makePayout({ status: PayoutStatus.CANCELLED });
      prisma.ownerPayout.findUnique.mockResolvedValue(payout);
      prisma.ownerPayout.update.mockResolvedValue(cancelled);
      prisma.booking.findUnique.mockResolvedValue(makeBooking());

      await service.updateOwnerPayoutStatus('payout-uuid', ADMIN_ID, {
        status: PayoutStatus.CANCELLED,
      });

      expect(prisma.ownerPayout.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PayoutStatus.CANCELLED,
            completedAt: null,
            holdReason: 'manual hold',
            processedAt: new Date('2026-05-20T00:00:00.000Z'),
            externalReference: 'EXT-1',
            notes: 'prev note',
          }),
        }),
      );
    });

    it('marks a payout FAILED with a fresh processedAt fallback when none existed', async () => {
      const payout = makePayout({
        status: PayoutStatus.PROCESSING,
        processedAt: null,
        externalReference: null,
        notes: null,
      });
      const failed = makePayout({ status: PayoutStatus.FAILED });
      prisma.ownerPayout.findUnique.mockResolvedValue(payout);
      prisma.ownerPayout.update.mockResolvedValue(failed);
      prisma.booking.findUnique.mockResolvedValue(makeBooking());

      await service.updateOwnerPayoutStatus('payout-uuid', ADMIN_ID, {
        status: PayoutStatus.FAILED,
        externalReference: '  ',
        notes: '  ',
      });

      const data = prisma.ownerPayout.update.mock.calls[0][0].data;
      expect(data.status).toBe(PayoutStatus.FAILED);
      expect(data.processedAt).toBeInstanceOf(Date);
      // Blank trimmed values fall back to the previous (null) values.
      expect(data.externalReference).toBeNull();
      expect(data.notes).toBeNull();
    });

    it('completes silently when the related booking can no longer be loaded', async () => {
      const payout = makePayout({ status: PayoutStatus.PROCESSING });
      const completed = makePayout({ status: PayoutStatus.COMPLETED });
      prisma.ownerPayout.findUnique.mockResolvedValue(payout);
      // First call: hold-reason check booking (released, clean).
      // Second call: post-update notify booking → null.
      prisma.booking.findUnique
        .mockResolvedValueOnce(
          makeBooking({
            depositLedger: makeDeposit({
              status: DepositLedgerStatus.RELEASED,
            }),
            ownerPayout: payout,
          }),
        )
        .mockResolvedValueOnce(null);
      prisma.incidentReport.findFirst.mockResolvedValue(null);
      prisma.ownerPayout.update.mockResolvedValue(completed);

      const result = await service.updateOwnerPayoutStatus(
        'payout-uuid',
        ADMIN_ID,
        { status: PayoutStatus.COMPLETED },
      );

      expect(result.status).toBe(PayoutStatus.COMPLETED);
    });
  });

  // =========================================================================
  // Coverage — getPayoutHoldReason exhaustive branches
  // =========================================================================
  describe('getPayoutHoldReason — branches', () => {
    const holdReason = (booking: any) =>
      (service as any).getPayoutHoldReason(booking);

    it('holds when the booking is not completed', async () => {
      const reason = await holdReason(
        makeBooking({ status: BookingStatus.ONGOING }),
      );
      expect(reason).toBe('booking is not completed');
    });

    it('holds when the trip is not completed', async () => {
      const reason = await holdReason(
        makeBooking({ trip: { id: TRIP_ID, status: TripStatus.ONGOING } }),
      );
      expect(reason).toBe('trip is not completed');
    });

    it('holds when the payment is not completed', async () => {
      const reason = await holdReason(
        makeBooking({ payment: makePayment({ status: PaymentStatus.PENDING }) }),
      );
      expect(reason).toBe('payment is not completed');
    });

    it('holds when a post-trip charge is unresolved', async () => {
      const reason = await holdReason(
        makeBooking({
          postTripCharges: [makeCharge({ id: 'open-charge' })],
        }),
      );
      expect(reason).toBe('post-trip charge open-charge is unresolved');
    });

    it('holds when a deposit is required but the ledger is missing', async () => {
      const reason = await holdReason(
        makeBooking({ deposit: 500000, depositLedger: null }),
      );
      expect(reason).toBe('deposit ledger has not been created');
    });

    it('holds when the deposit ledger is still active', async () => {
      const reason = await holdReason(
        makeBooking({
          depositLedger: makeDeposit({ status: DepositLedgerStatus.HELD }),
        }),
      );
      expect(reason).toBe('deposit is HELD');
    });

    it('holds when an incident report is open', async () => {
      prisma.incidentReport.findFirst.mockResolvedValue({ id: 'inc-1' });
      const reason = await holdReason(
        makeBooking({
          depositLedger: makeDeposit({ status: DepositLedgerStatus.RELEASED }),
        }),
      );
      expect(reason).toBe('incident inc-1 is open');
    });

    it('returns null when everything is settled', async () => {
      prisma.incidentReport.findFirst.mockResolvedValue(null);
      const reason = await holdReason(
        makeBooking({
          deposit: 0,
          depositLedger: makeDeposit({ status: DepositLedgerStatus.RELEASED }),
        }),
      );
      expect(reason).toBeNull();
    });
  });

  // =========================================================================
  // Coverage — computeSystemCharges edge cases
  // =========================================================================
  describe('computeSystemCharges — edge cases', () => {
    const compute = (booking: any) =>
      (service as any).computeSystemCharges(booking);

    it('returns no charges when there is no trip', () => {
      const charges = compute(makeBooking({ trip: null }));
      expect(charges).toEqual([]);
    });

    it('falls back to trip distance when odometer readings are unusable', () => {
      // Check-out odometer lower than check-in → use trip.distanceTraveled.
      const booking = makeBooking({
        handovers: [
          {
            id: 'check-in',
            type: HandoverType.CHECK_IN,
            odometerReading: 2000,
            batteryLevel: 90,
            createdAt: new Date('2026-05-23T00:50:00.000Z'),
          },
          {
            id: 'check-out',
            type: HandoverType.CHECK_OUT,
            odometerReading: 1000,
            batteryLevel: 80,
            createdAt: new Date('2026-05-23T05:05:00.000Z'),
          },
        ],
        trip: {
          id: TRIP_ID,
          status: TripStatus.COMPLETED,
          completedAt: new Date('2026-05-23T05:05:00.000Z'),
          distanceTraveled: 200,
          endBattery: 80,
        },
        vehicle: {
          pricePerHour: decimal(10000),
          dailyKmLimit: 50,
          excessKmPrice: 2000,
          batteryReturnMin: 50,
        },
      });

      const charges = compute(booking);
      const excess = charges.find(
        (c: any) => c.type === PostTripChargeType.EXCESS_DISTANCE,
      );
      // 200 km driven, 1 rental day * 50 km allowed = 150 km excess.
      expect(excess).toEqual(
        expect.objectContaining({ amount: 300000, quantity: 150 }),
      );
    });

    it('omits the late-return charge when returned within the grace period', () => {
      const booking = makeBooking({
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
            odometerReading: 1010,
            batteryLevel: 80,
            createdAt: new Date('2026-05-23T05:05:00.000Z'),
          },
        ],
        trip: {
          id: TRIP_ID,
          status: TripStatus.COMPLETED,
          completedAt: new Date('2026-05-23T05:05:00.000Z'),
          distanceTraveled: 10,
          endBattery: 80,
        },
      });

      const charges = compute(booking);
      expect(
        charges.some((c: any) => c.type === PostTripChargeType.LATE_RETURN),
      ).toBe(false);
    });

    it('uses the trip end battery when no check-out battery is present', () => {
      const booking = makeBooking({
        handovers: [
          {
            id: 'check-in',
            type: HandoverType.CHECK_IN,
            odometerReading: 1000,
            batteryLevel: 90,
            createdAt: new Date('2026-05-23T00:50:00.000Z'),
          },
        ],
        trip: {
          id: TRIP_ID,
          status: TripStatus.COMPLETED,
          completedAt: new Date('2026-05-23T05:05:00.000Z'),
          distanceTraveled: 10,
          endBattery: 20,
        },
      });

      const charges = compute(booking);
      const lowBattery = charges.find(
        (c: any) => c.type === PostTripChargeType.LOW_BATTERY,
      );
      // batteryReturnMin 50 - endBattery 20 = 30% shortfall.
      expect(lowBattery).toEqual(
        expect.objectContaining({ quantity: 30 }),
      );
    });

    it('produces no charges when vehicle limits are null and no actual end time', () => {
      const booking = makeBooking({
        handovers: [],
        trip: {
          id: TRIP_ID,
          status: TripStatus.COMPLETED,
          completedAt: null,
          distanceTraveled: null,
          endBattery: null,
        },
        vehicle: {
          pricePerHour: decimal(10000),
          dailyKmLimit: null,
          excessKmPrice: null,
          batteryReturnMin: null,
        },
      });

      // No check-out + no trip.completedAt → no late charge.
      // Null km limits → no excess charge. Null batteryReturnMin → no battery.
      expect(compute(booking)).toEqual([]);
    });
  });

  // =========================================================================
  // Coverage — lowBatteryFeePerPercent config fallback
  // =========================================================================
  describe('lowBatteryFeePerPercent — config fallback', () => {
    afterEach(() => {
      process.env.LOW_BATTERY_FEE_PER_PERCENT = '5000';
    });

    it('falls back to the default when the env value is not a number', () => {
      delete process.env.LOW_BATTERY_FEE_PER_PERCENT;
      const fee = (service as any).lowBatteryFeePerPercent();
      expect(fee).toBe(5000);
    });

    it('uses a configured non-negative override', () => {
      process.env.LOW_BATTERY_FEE_PER_PERCENT = '8000';
      const fee = (service as any).lowBatteryFeePerPercent();
      expect(fee).toBe(8000);
    });
  });

  // =========================================================================
  // Coverage — getBookingFinancialSummary renter/owner access
  // =========================================================================
  describe('getBookingFinancialSummary — access', () => {
    it('throws NotFound when the booking does not exist', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(
        service.getBookingFinancialSummary(BOOKING_ID, RENTER_ID, []),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows the renter to read their own booking financials', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      const result = await service.getBookingFinancialSummary(
        BOOKING_ID,
        RENTER_ID,
        [],
      );
      expect(result.bookingId).toBe(BOOKING_ID);
    });

    it('allows the owner to read booking financials', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      const result = await service.getBookingFinancialSummary(
        BOOKING_ID,
        OWNER_ID,
        [],
      );
      expect(result.bookingId).toBe(BOOKING_ID);
    });

    it('defaults roles to an empty array when omitted', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      const result = await service.getBookingFinancialSummary(
        BOOKING_ID,
        RENTER_ID,
      );
      expect(result.bookingId).toBe(BOOKING_ID);
    });
  });

  // =========================================================================
  // Coverage — syncDepositForBooking (via updateChargeStatus) state machine
  // =========================================================================
  describe('syncDepositForBooking — status transitions', () => {
    it('marks the ledger NOT_HELD when nothing is held', async () => {
      const charge = makeCharge();
      const waived = makeCharge({ status: PostTripChargeStatus.WAIVED });
      prisma.postTripCharge.findUnique.mockResolvedValue(charge);
      prisma.postTripCharge.update.mockResolvedValue(waived);
      // syncDepositForBooking re-reads booking with its own include.
      prisma.booking.findUnique
        .mockResolvedValueOnce({
          ...makeBooking(),
          depositLedger: makeDeposit({ heldAmount: 0 }),
          postTripCharges: [waived],
        })
        .mockResolvedValueOnce(
          makeBooking({
            depositLedger: makeDeposit({
              status: DepositLedgerStatus.NOT_HELD,
            }),
            postTripCharges: [waived],
          }),
        );
      prisma.depositLedger.update.mockResolvedValue(
        makeDeposit({ status: DepositLedgerStatus.NOT_HELD }),
      );

      await service.updateChargeStatus('charge-uuid', ADMIN_ID, {
        status: PostTripChargeStatus.WAIVED,
      });

      expect(prisma.depositLedger.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DepositLedgerStatus.NOT_HELD,
          }),
        }),
      );
    });

    it('keeps a finalized ledger status when syncing', async () => {
      const charge = makeCharge();
      const waived = makeCharge({ status: PostTripChargeStatus.WAIVED });
      prisma.postTripCharge.findUnique.mockResolvedValue(charge);
      prisma.postTripCharge.update.mockResolvedValue(waived);
      prisma.booking.findUnique
        .mockResolvedValueOnce({
          ...makeBooking(),
          depositLedger: makeDeposit({
            status: DepositLedgerStatus.RELEASED,
          }),
          postTripCharges: [waived],
        })
        .mockResolvedValueOnce(
          makeBooking({
            depositLedger: makeDeposit({
              status: DepositLedgerStatus.RELEASED,
            }),
            postTripCharges: [waived],
          }),
        );
      prisma.depositLedger.update.mockResolvedValue(
        makeDeposit({ status: DepositLedgerStatus.RELEASED }),
      );

      await service.updateChargeStatus('charge-uuid', ADMIN_ID, {
        status: PostTripChargeStatus.WAIVED,
      });

      expect(prisma.depositLedger.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DepositLedgerStatus.RELEASED,
          }),
        }),
      );
    });

    it('moves the ledger to RELEASE_PENDING when no charges remain active', async () => {
      const charge = makeCharge();
      const cancelled = makeCharge({ status: PostTripChargeStatus.CANCELLED });
      prisma.postTripCharge.findUnique.mockResolvedValue(charge);
      prisma.postTripCharge.update.mockResolvedValue(cancelled);
      prisma.booking.findUnique
        .mockResolvedValueOnce({
          ...makeBooking(),
          depositLedger: makeDeposit({ status: DepositLedgerStatus.HELD }),
          postTripCharges: [cancelled],
        })
        .mockResolvedValueOnce(
          makeBooking({
            depositLedger: makeDeposit({
              status: DepositLedgerStatus.RELEASE_PENDING,
            }),
            postTripCharges: [cancelled],
          }),
        );
      prisma.depositLedger.update.mockResolvedValue(
        makeDeposit({ status: DepositLedgerStatus.RELEASE_PENDING }),
      );

      await service.updateChargeStatus('charge-uuid', ADMIN_ID, {
        status: PostTripChargeStatus.CANCELLED,
      });

      expect(prisma.depositLedger.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DepositLedgerStatus.RELEASE_PENDING,
            releaseDueAt: expect.any(Date),
          }),
        }),
      );
    });

    it('returns null without updating when the booking has no deposit ledger', async () => {
      const charge = makeCharge();
      const waived = makeCharge({ status: PostTripChargeStatus.WAIVED });
      prisma.postTripCharge.findUnique.mockResolvedValue(charge);
      prisma.postTripCharge.update.mockResolvedValue(waived);
      prisma.booking.findUnique
        .mockResolvedValueOnce({
          ...makeBooking(),
          depositLedger: null,
          postTripCharges: [waived],
        })
        .mockResolvedValueOnce(
          makeBooking({ depositLedger: null, postTripCharges: [waived] }),
        );

      await service.updateChargeStatus('charge-uuid', ADMIN_ID, {
        status: PostTripChargeStatus.WAIVED,
      });

      expect(prisma.depositLedger.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Coverage — notification delivery when gateway reports user offline
  // =========================================================================
  describe('notifyFinancialParticipants — delivery branches', () => {
    it('creates a notification but skips the socket when the user is offline', async () => {
      const notificationService = {
        createNotification: jest.fn().mockResolvedValue({ id: 'n1' }),
      };
      const notificationGateway = {
        isUserOnline: jest.fn().mockReturnValue(false),
        sendToUser: jest.fn(),
      };
      service = new FinancialService(
        prisma as unknown as PrismaService,
        notificationService as any,
        notificationGateway as any,
      );
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ depositLedger: null }),
      );
      prisma.depositLedger.create.mockResolvedValue(makeDeposit());

      await service.recordPaymentCompleted(BOOKING_ID, PAYMENT_ID);

      expect(notificationService.createNotification).toHaveBeenCalled();
      expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
    });

    it('swallows notification errors without failing the operation', async () => {
      const notificationService = {
        createNotification: jest
          .fn()
          .mockRejectedValue(new Error('notify boom')),
      };
      service = new FinancialService(
        prisma as unknown as PrismaService,
        notificationService as any,
      );
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ depositLedger: null }),
      );
      prisma.depositLedger.create.mockResolvedValue(makeDeposit());

      const result = await service.recordPaymentCompleted(
        BOOKING_ID,
        PAYMENT_ID,
      );

      // Operation still succeeds despite the notification failure.
      expect(result?.status).toBe(DepositLedgerStatus.HELD);
    });

    it('notifies both renter and owner, de-duplicating recipient ids', async () => {
      const notificationService = {
        createNotification: jest.fn().mockResolvedValue({ id: 'n1' }),
      };
      const notificationGateway = {
        isUserOnline: jest.fn().mockReturnValue(true),
        sendToUser: jest.fn(),
      };
      service = new FinancialService(
        prisma as unknown as PrismaService,
        notificationService as any,
        notificationGateway as any,
      );

      // updateChargeStatus notifies ['renter', 'owner'] — distinct ids exercise
      // the recipient de-duplication reducer.
      const charge = makeCharge();
      const approved = makeCharge({ status: PostTripChargeStatus.APPROVED });
      prisma.postTripCharge.findUnique.mockResolvedValue(charge);
      prisma.postTripCharge.update.mockResolvedValue(approved);
      prisma.booking.findUnique
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [approved] }))
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [approved] }));
      prisma.depositLedger.update.mockResolvedValue(makeDeposit());

      await service.updateChargeStatus('charge-uuid', ADMIN_ID, {
        status: PostTripChargeStatus.APPROVED,
        amount: 10000,
      });

      expect(notificationService.createNotification).toHaveBeenCalledTimes(2);
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ receiverId: RENTER_ID }),
      );
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ receiverId: OWNER_ID }),
      );
    });

    it('collapses renter and owner notifications when they are the same user', async () => {
      const sharedId = 'self-rental-uuid';
      const notificationService = {
        createNotification: jest.fn().mockResolvedValue({ id: 'n1' }),
      };
      const notificationGateway = {
        isUserOnline: jest.fn().mockReturnValue(false),
        sendToUser: jest.fn(),
      };
      service = new FinancialService(
        prisma as unknown as PrismaService,
        notificationService as any,
        notificationGateway as any,
      );

      const charge = makeCharge();
      const approved = makeCharge({ status: PostTripChargeStatus.APPROVED });
      prisma.postTripCharge.findUnique.mockResolvedValue(charge);
      prisma.postTripCharge.update.mockResolvedValue(approved);
      prisma.booking.findUnique
        .mockResolvedValueOnce(
          makeBooking({
            renterId: sharedId,
            ownerId: sharedId,
            postTripCharges: [approved],
          }),
        )
        .mockResolvedValueOnce(
          makeBooking({
            renterId: sharedId,
            ownerId: sharedId,
            postTripCharges: [approved],
          }),
        );
      prisma.depositLedger.update.mockResolvedValue(makeDeposit());

      await service.updateChargeStatus('charge-uuid', ADMIN_ID, {
        status: PostTripChargeStatus.APPROVED,
        amount: 10000,
      });

      // Both recipients resolve to the same id → only one notification.
      expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Coverage — roadside support credit helpers
  // =========================================================================
  describe('roadside support credit helpers', () => {
    const extract = (evidence: any) =>
      (service as any).extractRoadsideSupportCreditApplied(evidence);

    it('returns 0 for null / array / primitive evidence', () => {
      expect(extract(null)).toBe(0);
      expect(extract([1, 2, 3])).toBe(0);
      expect(extract('nope' as any)).toBe(0);
    });

    it('returns 0 when the manual block is missing or malformed', () => {
      expect(extract({})).toBe(0);
      expect(extract({ manual: null })).toBe(0);
      expect(extract({ manual: [] })).toBe(0);
    });

    it('returns 0 when the roadsideSupport block is missing or malformed', () => {
      expect(extract({ manual: {} })).toBe(0);
      expect(extract({ manual: { roadsideSupport: null } })).toBe(0);
      expect(extract({ manual: { roadsideSupport: [] } })).toBe(0);
    });

    it('returns 0 when creditAppliedAmount is not a finite number', () => {
      expect(
        extract({ manual: { roadsideSupport: { creditAppliedAmount: 'x' } } }),
      ).toBe(0);
      expect(
        extract({
          manual: { roadsideSupport: { creditAppliedAmount: Infinity } },
        }),
      ).toBe(0);
    });

    it('returns the rounded applied credit when present', () => {
      expect(
        extract({
          manual: { roadsideSupport: { creditAppliedAmount: 150000 } },
        }),
      ).toBe(150000);
    });

    it('sums prior applied credit across non-cancelled charges', () => {
      const booking = makeBooking({
        roadsideSupport: true,
        roadsideSupportCreditAmount: 200000,
        postTripCharges: [
          makeCharge({
            id: 'prior-1',
            status: PostTripChargeStatus.APPROVED,
            evidence: {
              manual: { roadsideSupport: { creditAppliedAmount: 120000 } },
            },
          }),
          makeCharge({
            id: 'cancelled',
            status: PostTripChargeStatus.CANCELLED,
            evidence: {
              manual: { roadsideSupport: { creditAppliedAmount: 50000 } },
            },
          }),
        ],
      });

      const used = (service as any).roadsideSupportCreditUsed(booking);
      // Cancelled charge is excluded → only the 120000 counts.
      expect(used).toBe(120000);
    });

    it('only applies the remaining credit when prior credit was used', async () => {
      // 200000 credit, 120000 already used → 80000 remaining. A 250000 request
      // is reduced by the remaining 80000 → 170000 billable.
      const priorCharge = makeCharge({
        id: 'prior-1',
        type: PostTripChargeType.ROADSIDE_ASSISTANCE,
        status: PostTripChargeStatus.APPROVED,
        amount: 120000,
        evidence: {
          manual: { roadsideSupport: { creditAppliedAmount: 120000 } },
        },
      });
      const newCharge = makeCharge({
        type: PostTripChargeType.ROADSIDE_ASSISTANCE,
        amount: 170000,
      });
      const syncedDeposit = makeDeposit({
        status: DepositLedgerStatus.PENDING_CHARGES,
      });

      prisma.booking.findUnique
        .mockResolvedValueOnce(
          makeBooking({
            roadsideSupport: true,
            roadsideSupportCreditAmount: 200000,
            postTripCharges: [priorCharge],
          }),
        )
        .mockResolvedValueOnce(
          makeBooking({ postTripCharges: [priorCharge, newCharge] }),
        )
        .mockResolvedValueOnce(
          makeBooking({
            depositLedger: syncedDeposit,
            postTripCharges: [priorCharge, newCharge],
          }),
        );
      prisma.postTripCharge.create.mockResolvedValue(newCharge);
      prisma.depositLedger.update.mockResolvedValue(syncedDeposit);

      await service.createManualPostTripCharge(BOOKING_ID, OWNER_ID, [], {
        type: PostTripChargeType.ROADSIDE_ASSISTANCE,
        amount: 250000,
        description: 'Second roadside call',
      });

      expect(prisma.postTripCharge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: 170000,
          evidence: expect.objectContaining({
            manual: expect.objectContaining({
              requestedAmount: 250000,
              roadsideSupport: expect.objectContaining({
                creditUsedBefore: 120000,
                creditAppliedAmount: 80000,
                billableAmount: 170000,
              }),
            }),
          }),
        }),
      });
    });

    it('falls back to the default roadside credit amount when none is configured', async () => {
      // roadsideSupportCreditAmount null → default 200_000 credit applies.
      const newCharge = makeCharge({
        type: PostTripChargeType.ROADSIDE_ASSISTANCE,
        amount: 0,
        status: PostTripChargeStatus.WAIVED,
      });
      const syncedDeposit = makeDeposit();

      prisma.booking.findUnique
        .mockResolvedValueOnce(
          makeBooking({
            roadsideSupport: true,
            roadsideSupportCreditAmount: null,
            postTripCharges: [],
          }),
        )
        .mockResolvedValueOnce(makeBooking({ postTripCharges: [newCharge] }))
        .mockResolvedValueOnce(
          makeBooking({
            depositLedger: syncedDeposit,
            postTripCharges: [newCharge],
          }),
        );
      prisma.postTripCharge.create.mockResolvedValue(newCharge);
      prisma.depositLedger.update.mockResolvedValue(syncedDeposit);

      await service.createManualPostTripCharge(BOOKING_ID, OWNER_ID, [], {
        type: PostTripChargeType.ROADSIDE_ASSISTANCE,
        amount: 150000,
        description: 'Roadside within default credit',
      });

      expect(prisma.postTripCharge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          // 150000 fully covered by the default 200000 credit → billable 0.
          amount: 0,
          status: PostTripChargeStatus.WAIVED,
          evidence: expect.objectContaining({
            manual: expect.objectContaining({
              roadsideSupport: expect.objectContaining({
                creditAmount: 200000,
                creditAppliedAmount: 150000,
                billableAmount: 0,
              }),
            }),
          }),
        }),
      });
    });
  });
});
