import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, TrustScoreEventType, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TrustScoreService } from './trust-score.service';

const USER_ID = 'user-uuid';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  fullName: 'Trust User',
  email: 'trust@example.com',
  status: UserStatus.ACTIVE,
  trustScore: 100,
  idCardNum: null,
  ...overrides,
});

const mockPrisma = () => ({
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  booking: { count: jest.fn() },
  trustScoreEvent: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  trustScoreWarning: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  vehicle: { findMany: jest.fn() },
  review: { aggregate: jest.fn() },
  trip: { findMany: jest.fn(), count: jest.fn() },
});

describe('TrustScoreService', () => {
  let service: TrustScoreService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrustScoreService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TrustScoreService);
    jest.clearAllMocks();
  });

  it('clamps positive trust events at 150 and writes an audit event', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 149 }));
    prisma.user.update.mockResolvedValue(makeUser({ trustScore: 150 }));
    prisma.trustScoreEvent.create.mockResolvedValue({});

    const result = await service.recordPositiveEvent(
      USER_ID,
      TrustScoreEventType.GOOD_REVIEW_RECEIVED,
      5,
      'Great review',
    );

    expect(result?.trustScore).toBe(150);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { trustScore: 150 } }),
    );
    expect(prisma.trustScoreEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TrustScoreEventType.GOOD_REVIEW_RECEIVED,
          delta: 1,
          scoreBefore: 149,
          scoreAfter: 150,
        }),
      }),
    );
  });

  it('records a first progressive violation as a warning without score loss', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 82 }));
    prisma.trustScoreWarning.findFirst.mockResolvedValue(null);
    prisma.trustScoreWarning.create.mockResolvedValue({});
    prisma.trustScoreEvent.create.mockResolvedValue({});

    const result = await service.recordViolation(
      USER_ID,
      TrustScoreEventType.BOOKING_CANCELLED_BY_RENTER,
      5,
      'Late cancellation',
    );

    expect(result).toEqual({ warned: true, score: 82 });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.trustScoreWarning.create).toHaveBeenCalled();
    expect(prisma.trustScoreEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TrustScoreEventType.WARNING,
          delta: 0,
        }),
      }),
    );
  });

  it('penalizes repeat violations in the warning window and restricts below 40', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 42 }));
    prisma.trustScoreWarning.findFirst.mockResolvedValue({
      id: 'warning-uuid',
      userId: USER_ID,
      type: TrustScoreEventType.LATE_RETURN,
    });
    prisma.trustScoreWarning.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue(
      makeUser({ trustScore: 37, status: UserStatus.RESTRICTED }),
    );
    prisma.trustScoreEvent.create.mockResolvedValue({});

    const result = await service.recordViolation(
      USER_ID,
      TrustScoreEventType.LATE_RETURN,
      5,
      'Late return again',
    );

    expect(result?.trustScore).toBe(37);
    expect(result?.status).toBe(UserStatus.RESTRICTED);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { trustScore: 37, status: UserStatus.RESTRICTED },
      }),
    );
  });

  it('blocks new bookings for very-low trust users', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 35 }));

    await expect(service.assertCanCreateBooking(USER_ID)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.booking.count).not.toHaveBeenCalled();
  });

  it('limits low trust users to one active booking', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 55 }));
    prisma.booking.count.mockResolvedValue(1);

    await expect(service.assertCanCreateBooking(USER_ID)).rejects.toThrow(
      'Trust score tier allows 1 active booking(s) at a time',
    );
    expect(prisma.booking.count).toHaveBeenCalledWith({
      where: {
        renterId: USER_ID,
        status: {
          in: [
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
            BookingStatus.ONGOING,
          ],
        },
      },
    });
  });

  it('blocks vehicle registration below the medium trust tier', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 69 }));

    await expect(service.assertCanRegisterVehicle(USER_ID)).rejects.toThrow(
      'Trust score must be at least 70 to register a new vehicle',
    );
  });

  it('allows high-trust booking and vehicle actions', async () => {
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ trustScore: 121, idCardNum: '012345678901' }),
    );
    prisma.booking.count.mockResolvedValue(4);

    await expect(service.assertCanCreateBooking(USER_ID)).resolves.toBe(
      undefined,
    );
    await expect(service.assertCanRegisterVehicle(USER_ID)).resolves.toBe(
      undefined,
    );
  });

  it('blocks missing and blocked users before checking active booking counts', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.assertCanCreateBooking(USER_ID)).rejects.toThrow(
      'User is not allowed to create bookings',
    );

    prisma.user.findUnique.mockResolvedValueOnce(
      makeUser({ status: UserStatus.BLOCKED }),
    );
    await expect(service.assertCanCreateBooking(USER_ID)).rejects.toThrow(
      'Blocked accounts cannot create bookings',
    );

    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.assertCanRegisterVehicle(USER_ID)).rejects.toThrow(
      'User is not allowed to register vehicles',
    );

    prisma.user.findUnique.mockResolvedValueOnce(
      makeUser({ status: UserStatus.BLOCKED }),
    );
    await expect(service.assertCanRegisterVehicle(USER_ID)).rejects.toThrow(
      'Blocked accounts cannot register vehicles',
    );
    expect(prisma.booking.count).not.toHaveBeenCalled();
  });

  it('applies non-progressive violations immediately and ignores missing users', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(makeUser({ trustScore: 80 }));
    prisma.user.update.mockResolvedValue(makeUser({ trustScore: 70 }));
    prisma.trustScoreEvent.create.mockResolvedValue({});

    await expect(
      service.recordViolation(
        USER_ID,
        TrustScoreEventType.SERIOUS_VIOLATION,
        10,
        'Serious issue',
        { reportId: 'report-1' },
        false,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        trustScore: 70,
        tier: expect.objectContaining({ level: 3 }),
      }),
    );

    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.recordViolation(
        'missing',
        TrustScoreEventType.LATE_RETURN,
        3,
        'Missing user',
      ),
    ).resolves.toBeNull();
  });

  it('records transaction milestones only on every tenth completed transaction', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 100 }));
    prisma.user.update.mockResolvedValue(makeUser({ trustScore: 103 }));
    prisma.trustScoreEvent.create.mockResolvedValue({});

    await expect(
      service.recordTransactionMilestone(USER_ID, 20),
    ).resolves.toEqual(expect.objectContaining({ trustScore: 103 }));
    await expect(
      service.recordTransactionMilestone(USER_ID, 21),
    ).resolves.toBeNull();

    expect(prisma.trustScoreEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TrustScoreEventType.TRANSACTION_MILESTONE,
          metadata: { completedTransactions: 20 },
        }),
      }),
    );
  });

  it('returns admin overview histogram and rapid-drop alerts', async () => {
    const warning = { id: 'warning-1', userId: 'user-low' };
    prisma.user.findMany.mockResolvedValue([
      makeUser({ id: 'user-low', trustScore: 35 }),
      makeUser({
        id: 'user-restricted',
        trustScore: 75,
        status: UserStatus.RESTRICTED,
      }),
      makeUser({ id: 'user-medium', trustScore: 80 }),
      makeUser({ id: 'user-good', trustScore: 100 }),
      makeUser({ id: 'user-excellent', trustScore: 130 }),
    ]);
    prisma.trustScoreEvent.findMany.mockResolvedValue([
      { userId: 'user-good', delta: -12 },
      { userId: 'user-good', delta: -10 },
      { userId: 'user-low', delta: 5 },
    ]);
    prisma.trustScoreWarning.findMany.mockResolvedValue([warning]);

    await expect(service.getAdminOverview()).resolves.toEqual({
      histogram: {
        veryLow: 1,
        low: 0,
        medium: 2,
        good: 1,
        excellent: 1,
      },
      alerts: {
        lowScoreUsers: [
          expect.objectContaining({ id: 'user-low' }),
          expect.objectContaining({ id: 'user-restricted' }),
        ],
        rapidDropUsers: [expect.objectContaining({ id: 'user-good' })],
        activeWarnings: [warning],
      },
    });
  });

  it('returns a user trust profile with recent events and active warnings', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 92 }));
    prisma.trustScoreEvent.findMany.mockResolvedValue([{ id: 'event-1' }]);
    prisma.trustScoreWarning.findMany.mockResolvedValue([{ id: 'warning-1' }]);

    await expect(service.getUserTrustProfile(USER_ID)).resolves.toEqual({
      trustScore: 92,
      status: UserStatus.ACTIVE,
      tier: expect.objectContaining({ level: 4 }),
      recentEvents: [{ id: 'event-1' }],
      activeWarnings: [{ id: 'warning-1' }],
    });

    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.getUserTrustProfile('missing')).resolves.toBeNull();
  });

  it('recalculates every users trust score during the daily job', async () => {
    const recalculateSpy = jest
      .spyOn(service, 'recalculateUserTrustScore')
      .mockResolvedValue({ trustScore: 100, status: UserStatus.ACTIVE } as any);
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-1' },
      { id: 'user-2' },
    ]);

    await service.recalculateAllTrustScores();

    expect(recalculateSpy).toHaveBeenCalledWith('user-1');
    expect(recalculateSpy).toHaveBeenCalledWith('user-2');
    recalculateSpy.mockRestore();
  });

  it('recalculates a weighted trust score from ratings, punctuality, disputes, KYC, and activity', async () => {
    const oldTrip = {
      completedAt: new Date('2026-01-01T00:00:00.000Z'),
      booking: { endTime: new Date('2026-01-01T01:00:00.000Z') },
    };
    const onTimeRecentTrip = {
      completedAt: new Date(),
      booking: { endTime: new Date(Date.now() + 60_000) },
    };
    const lateTrip = {
      completedAt: new Date(),
      booking: { endTime: new Date(Date.now() - 60_000) },
    };

    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      trustScore: 80,
      kycVerifications: [{ id: 'kyc-1' }],
      status: UserStatus.ACTIVE,
    });
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'vehicle-1' },
      { id: 'vehicle-2' },
    ]);
    prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 4 } });
    prisma.trip.findMany.mockResolvedValue([
      oldTrip,
      onTimeRecentTrip,
      lateTrip,
    ]);
    prisma.trip.count.mockResolvedValueOnce(5).mockResolvedValueOnce(1);
    prisma.user.update.mockResolvedValue(
      makeUser({ trustScore: 93.87, status: UserStatus.ACTIVE }),
    );
    prisma.trustScoreEvent.create.mockResolvedValue({});

    await expect(service.recalculateUserTrustScore(USER_ID)).resolves.toEqual(
      expect.objectContaining({
        trustScore: 93.87,
        tier: expect.objectContaining({ level: 4 }),
      }),
    );

    expect(prisma.review.aggregate).toHaveBeenCalledWith({
      where: { vehicleId: { in: ['vehicle-1', 'vehicle-2'] } },
      _avg: { rating: true },
    });
    expect(prisma.trustScoreEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TrustScoreEventType.RECALCULATED,
          metadata: expect.objectContaining({
            ratingScore: 80,
            disputeRate: 20,
            kycScore: 100,
          }),
        }),
      }),
    );
  });

  it('recalculates users without owned vehicles and returns null for missing users', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.recalculateUserTrustScore('missing'),
    ).resolves.toBeNull();

    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: USER_ID,
        trustScore: 50,
        kycVerifications: [],
        status: UserStatus.ACTIVE,
      })
      .mockResolvedValueOnce(makeUser({ trustScore: 50 }));
    prisma.vehicle.findMany.mockResolvedValue([]);
    prisma.trip.findMany.mockResolvedValue([]);
    prisma.trip.count.mockResolvedValue(0);
    prisma.user.update.mockResolvedValue(
      makeUser({ trustScore: 51, status: UserStatus.ACTIVE }),
    );
    prisma.trustScoreEvent.create.mockResolvedValue({});

    await expect(service.recalculateUserTrustScore(USER_ID)).resolves.toEqual(
      expect.objectContaining({ trustScore: 51 }),
    );
    expect(prisma.review.aggregate).not.toHaveBeenCalled();
  });
});
