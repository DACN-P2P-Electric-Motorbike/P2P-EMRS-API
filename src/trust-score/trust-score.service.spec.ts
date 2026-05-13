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
});
