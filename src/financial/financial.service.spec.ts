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
});
