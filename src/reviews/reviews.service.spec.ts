import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../database/prisma.service';
import { TrustScoreService } from '../trust-score/trust-score.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ReviewType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid';
const OWNER_ID = 'owner-uuid';
const VEHICLE_ID = 'vehicle-uuid';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  trustScore: 100,
  ...overrides,
});

const makeVehicle = (overrides: Record<string, unknown> = {}) => ({
  id: VEHICLE_ID,
  ownerId: OWNER_ID,
  totalRating: 0,
  reviewCount: 0,
  ...overrides,
});

const makeReview = (overrides: Record<string, unknown> = {}) => ({
  id: 'review-uuid',
  userId: USER_ID,
  revieweeId: OWNER_ID,
  vehicleId: VEHICLE_ID,
  tripId: 'trip-1',
  reviewType: ReviewType.RENTER_TO_OWNER,
  rating: 5,
  comment: 'Great bike!',
  visibleAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  revealedAt: null,
  trustAppliedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeTrip = (overrides: Record<string, unknown> = {}) => ({
  id: 'trip-1',
  bookingId: 'booking-uuid',
  renterId: USER_ID,
  vehicleId: VEHICLE_ID,
  status: 'COMPLETED',
  completedAt: new Date(),
  updatedAt: new Date(),
  booking: {
    id: 'booking-uuid',
    ownerId: OWNER_ID,
    renterId: USER_ID,
    vehicleId: VEHICLE_ID,
  },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

const mockPrisma = () => ({
  vehicle: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  trip: { findFirst: jest.fn(), count: jest.fn() },
  review: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  user: { findUnique: jest.fn(), update: jest.fn() },
  booking: { count: jest.fn(), findUnique: jest.fn() },
  trustScoreEvent: { aggregate: jest.fn() },
  trustScoreWarning: { count: jest.fn() },
});

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: ReturnType<typeof mockPrisma>;
  const trustScoreService = {
    recordPositiveEvent: jest.fn().mockResolvedValue({ trustScore: 101 }),
    recordViolation: jest.fn().mockResolvedValue({ warned: true, score: 80 }),
    getUserTrustProfile: jest.fn().mockResolvedValue({
      tier: { level: 3, label: 'Trung bình' },
      recentEvents: [],
      activeWarnings: [],
    }),
  };

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TrustScoreService, useValue: trustScoreService },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
    jest.clearAllMocks();
  });

  // =========================================================================
  // Day 2 — Review validation
  // =========================================================================
  describe('createReview — validation', () => {
    const dto = { vehicleId: VEHICLE_ID, rating: 5, comment: 'Nice' };

    it('should throw NotFoundException when vehicle does not exist', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(null);
      await expect(service.createReview(USER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when user has no completed trip', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue(null);

      await expect(service.createReview(USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when review already exists (no bookingId)', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue(makeTrip());
      prisma.review.findFirst.mockResolvedValue(makeReview());

      await expect(service.createReview(USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when the booking trip is already reviewed', async () => {
      const dtoWithBooking = { ...dto, bookingId: 'booking-uuid' };
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue(makeTrip());
      prisma.review.findFirst.mockResolvedValue(
        makeReview({ tripId: 'trip-1' }),
      );

      await expect(
        service.createReview(USER_ID, dtoWithBooking),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates an owner-to-renter review when the owner authors it', async () => {
      // Owner is the reviewer → trip.renterId !== userId path.
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue(
        makeTrip({ renterId: USER_ID, booking: { ownerId: OWNER_ID } }),
      );
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(
        makeReview({
          userId: OWNER_ID,
          revieweeId: USER_ID,
          reviewType: ReviewType.OWNER_TO_RENTER,
        }),
      );
      prisma.review.findMany.mockResolvedValue([]);

      await service.createReview(OWNER_ID, dto);

      expect(prisma.review.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: OWNER_ID,
          revieweeId: USER_ID,
          reviewType: ReviewType.OWNER_TO_RENTER,
        }),
      });
    });

    it('falls back to trip.updatedAt for the reveal window when completedAt is null', async () => {
      const updatedAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue(
        makeTrip({ completedAt: null, updatedAt }),
      );
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(makeReview());
      prisma.review.findMany.mockResolvedValue([]);

      await service.createReview(USER_ID, dto);

      const created = prisma.review.create.mock.calls[0][0];
      const expected = new Date(updatedAt);
      expected.setDate(expected.getDate() + 14);
      expect(created.data.visibleAt).toEqual(expected);
    });

    it('falls back to now for the reveal window when no trip timestamps exist', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue(
        makeTrip({ completedAt: null, updatedAt: null }),
      );
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(makeReview());
      prisma.review.findMany.mockResolvedValue([]);

      await service.createReview(USER_ID, dto);

      const created = prisma.review.create.mock.calls[0][0];
      expect(created.data.visibleAt).toBeInstanceOf(Date);
    });

    it('should create a trip-bound review when bookingId is provided', async () => {
      const dtoWithBooking = { ...dto, bookingId: 'booking-uuid' };
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue(makeTrip());
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(makeReview());
      prisma.review.findMany.mockResolvedValue([makeReview()]);
      prisma.vehicle.update.mockResolvedValue(makeVehicle());
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser());

      const result = await service.createReview(USER_ID, dtoWithBooking);
      expect(result).toBeDefined();
      expect(result.rating).toBe(5);
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          revieweeId: OWNER_ID,
          vehicleId: VEHICLE_ID,
          tripId: 'trip-1',
          reviewType: ReviewType.RENTER_TO_OWNER,
          rating: 5,
          comment: 'Nice',
          visibleAt: expect.any(Date),
        }),
      });
    });
  });

  // =========================================================================
  // Day 2 — Successful review creation
  // =========================================================================
  describe('createReview — success flow', () => {
    const dto = { vehicleId: VEHICLE_ID, rating: 4, comment: 'Good bike' };

    beforeEach(() => {
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue(makeTrip());
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(makeReview({ rating: 4 }));
      prisma.review.findMany.mockResolvedValue([makeReview({ rating: 4 })]);
      prisma.vehicle.update.mockResolvedValue(makeVehicle());
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser());
    });

    it('should create the review record', async () => {
      await service.createReview(USER_ID, dto);

      expect(prisma.review.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          revieweeId: OWNER_ID,
          vehicleId: VEHICLE_ID,
          tripId: 'trip-1',
          reviewType: ReviewType.RENTER_TO_OWNER,
          rating: 4,
          comment: 'Good bike',
          visibleAt: expect.any(Date),
        }),
      });
    });

    it('should not update vehicle average rating before blind reveal', async () => {
      await service.createReview(USER_ID, dto);
      expect(prisma.vehicle.update).not.toHaveBeenCalled();
    });

    it('should record review-submitted trust event for renter', async () => {
      await service.createReview(USER_ID, dto);

      expect(trustScoreService.recordPositiveEvent).toHaveBeenCalledWith(
        USER_ID,
        'REVIEW_SUBMITTED',
        1,
        'Submitted a review after a completed rental',
        expect.objectContaining({ vehicleId: VEHICLE_ID }),
      );
    });
  });

  // =========================================================================
  // Day 2 — Trust score calculation: adjustOwnerTrustFromRating
  // =========================================================================
  describe('trust score — owner rating impact', () => {
    const revealRenterReviewWithRating = async (rating: number) => {
      const dueReview = makeReview({
        rating,
        visibleAt: new Date(Date.now() - 1000),
        vehicle: { ownerId: OWNER_ID },
      });
      const revealedReview = makeReview({
        rating,
        revealedAt: new Date(),
      });
      prisma.review.findMany
        .mockResolvedValueOnce([dueReview])
        .mockResolvedValueOnce([revealedReview])
        .mockResolvedValueOnce([revealedReview]);
      prisma.review.updateMany.mockResolvedValue({ count: 1 });
      prisma.review.update.mockResolvedValue(revealedReview);
      prisma.vehicle.update.mockResolvedValue(makeVehicle());
      prisma.vehicle.findMany.mockResolvedValue([{ id: VEHICLE_ID }]);

      await service.revealEligibleReviews();
    };

    it('should record owner violation for 1-star rating', async () => {
      await revealRenterReviewWithRating(1);
      expect(trustScoreService.recordViolation).toHaveBeenCalledWith(
        OWNER_ID,
        'BAD_REVIEW_RECEIVED',
        3,
        'Received a low rating',
        expect.objectContaining({ rating: 1 }),
      );
    });

    it('should record owner violation for 2-star rating', async () => {
      await revealRenterReviewWithRating(2);
      expect(trustScoreService.recordViolation).toHaveBeenCalledWith(
        OWNER_ID,
        'BAD_REVIEW_RECEIVED',
        3,
        'Received a low rating',
        expect.objectContaining({ rating: 2 }),
      );
    });

    it('should not change owner trust for 3-star rating', async () => {
      await revealRenterReviewWithRating(3);
      expect(trustScoreService.recordViolation).not.toHaveBeenCalled();
      expect(
        trustScoreService.recordPositiveEvent.mock.calls.some(
          (call) => call[0] === OWNER_ID,
        ),
      ).toBe(false);
    });

    it('should record good-rating event for 4-star rating', async () => {
      await revealRenterReviewWithRating(4);
      expect(trustScoreService.recordPositiveEvent).toHaveBeenCalledWith(
        OWNER_ID,
        'GOOD_REVIEW_RECEIVED',
        1,
        'Received a good rating',
        expect.objectContaining({ rating: 4 }),
      );
    });

    it('should record good-rating event for 5-star rating', async () => {
      await revealRenterReviewWithRating(5);
      expect(trustScoreService.recordPositiveEvent).toHaveBeenCalledWith(
        OWNER_ID,
        'GOOD_REVIEW_RECEIVED',
        1,
        'Received a good rating',
        expect.objectContaining({ rating: 5 }),
      );
    });
  });

  // =========================================================================
  // Day 2 — Trust score policy delegation
  // =========================================================================
  describe('trust score — policy delegation', () => {
    it('delegates score upper-bound handling to TrustScoreService', async () => {
      const dto = { vehicleId: VEHICLE_ID, rating: 5 };
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue(makeTrip());
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(makeReview());
      prisma.review.findMany.mockResolvedValue([makeReview()]);
      prisma.vehicle.update.mockResolvedValue(makeVehicle());

      await service.createReview(USER_ID, dto);

      expect(trustScoreService.recordPositiveEvent).toHaveBeenCalled();
    });

    it('delegates score lower-bound handling after reveal', async () => {
      const dueReview = makeReview({
        rating: 1,
        visibleAt: new Date(Date.now() - 1000),
        vehicle: { ownerId: OWNER_ID },
      });
      const revealedReview = makeReview({ rating: 1, revealedAt: new Date() });
      prisma.review.findMany
        .mockResolvedValueOnce([dueReview])
        .mockResolvedValueOnce([revealedReview])
        .mockResolvedValueOnce([revealedReview]);
      prisma.review.updateMany.mockResolvedValue({ count: 1 });
      prisma.review.update.mockResolvedValue(revealedReview);
      prisma.vehicle.update.mockResolvedValue(makeVehicle());
      prisma.vehicle.findMany.mockResolvedValue([{ id: VEHICLE_ID }]);

      await service.revealEligibleReviews();

      expect(trustScoreService.recordViolation).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Day 2 — Vehicle rating calculation
  // =========================================================================
  describe('updateVehicleRating', () => {
    it('should calculate average from multiple reviews', async () => {
      const dueReview = makeReview({
        rating: 4,
        visibleAt: new Date(Date.now() - 1000),
        vehicle: { ownerId: OWNER_ID },
      });
      prisma.review.findMany.mockResolvedValueOnce([dueReview]);
      prisma.review.findMany.mockResolvedValueOnce([
        makeReview({ rating: 5 }),
        makeReview({ rating: 3 }),
        makeReview({ rating: 4 }),
      ]);
      prisma.review.updateMany.mockResolvedValue({ count: 1 });
      prisma.review.update.mockResolvedValue(makeReview({ rating: 4 }));
      prisma.vehicle.update.mockResolvedValue(makeVehicle());
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser());

      await service.revealEligibleReviews();

      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: VEHICLE_ID },
        data: { totalRating: 4, reviewCount: 3 },
      });
    });
  });

  // =========================================================================
  // Day 2 — getTrustScoreBreakdown
  // =========================================================================
  describe('getTrustScoreBreakdown', () => {
    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.getTrustScoreBreakdown('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return full breakdown with correct penalty calculations', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 72 }));
      prisma.review.count.mockResolvedValue(5);
      prisma.vehicle.findMany.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }]);
      prisma.review.aggregate.mockResolvedValue({
        _avg: { rating: 4.2 },
        _count: { id: 8 },
      });
      prisma.booking.count
        .mockResolvedValueOnce(3) // cancelledBookings
        .mockResolvedValueOnce(1); // rejectedBookings
      prisma.trip.count
        .mockResolvedValueOnce(10) // completedTrips
        .mockResolvedValueOnce(2); // tripsWithIssues
      // Penalties now reflect ACTUAL deducted points from trust events, not a
      // theoretical count * weight. Order matches the Promise.all in the
      // service: cancellation, rejection, violation sums.
      prisma.trustScoreEvent.aggregate
        .mockResolvedValueOnce({ _sum: { delta: -5 } }) // cancellation applied
        .mockResolvedValueOnce({ _sum: { delta: -2 } }) // rejection applied
        .mockResolvedValueOnce({ _sum: { delta: -3 } }); // violation applied
      // Active warning counts: cancellation, rejection, violation.
      prisma.trustScoreWarning.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

      const result = await service.getTrustScoreBreakdown(USER_ID);

      expect(result.trustScore).toBe(72);
      expect(result.breakdown.reviewsGiven).toBe(5);
      expect(result.breakdown.reviewsGivenBonus).toBe(5);
      expect(result.breakdown.avgRatingReceived).toBe(4.2);
      expect(result.breakdown.totalReviewsReceived).toBe(8);
      expect(result.breakdown.cancelledBookings).toBe(3);
      // Actual deducted points (one cancellation was warning-only → still -5).
      expect(result.breakdown.cancellationPenalty).toBe(-5);
      expect(result.breakdown.cancellationWarnings).toBe(1);
      expect(result.breakdown.rejectedBookings).toBe(1);
      expect(result.breakdown.rejectionPenalty).toBe(-2);
      expect(result.breakdown.rejectionWarnings).toBe(0);
      expect(result.breakdown.completedTrips).toBe(10);
      expect(result.breakdown.tripsWithIssues).toBe(2);
      expect(result.breakdown.violationPenalty).toBe(-3);
      expect(result.breakdown.violationWarnings).toBe(1);
    });

    it('shows zero penalty while a first cancellation is warning-only', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 100 }));
      prisma.review.count.mockResolvedValue(0);
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.booking.count
        .mockResolvedValueOnce(1) // cancelledBookings
        .mockResolvedValueOnce(0); // rejectedBookings
      prisma.trip.count
        .mockResolvedValueOnce(0) // completedTrips
        .mockResolvedValueOnce(0); // tripsWithIssues
      // No score was actually deducted: the only event is a WARNING (delta 0).
      prisma.trustScoreEvent.aggregate
        .mockResolvedValueOnce({ _sum: { delta: 0 } })
        .mockResolvedValueOnce({ _sum: { delta: null } })
        .mockResolvedValueOnce({ _sum: { delta: null } });
      prisma.trustScoreWarning.count
        .mockResolvedValueOnce(1) // one active cancellation warning
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.getTrustScoreBreakdown(USER_ID);

      expect(result.trustScore).toBe(100);
      expect(result.breakdown.cancelledBookings).toBe(1);
      // The misleading "-5" is gone: nothing was deducted yet.
      expect(result.breakdown.cancellationPenalty).toBe(0);
      expect(result.breakdown.cancellationWarnings).toBe(1);
    });

    it('should return null avgRatingReceived when user owns no vehicles', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.review.count.mockResolvedValue(0);
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);
      prisma.trip.count.mockResolvedValue(0);
      prisma.trustScoreEvent.aggregate.mockResolvedValue({
        _sum: { delta: 0 },
      });
      prisma.trustScoreWarning.count.mockResolvedValue(0);

      const result = await service.getTrustScoreBreakdown(USER_ID);

      expect(result.breakdown.avgRatingReceived).toBeNull();
      expect(result.breakdown.totalReviewsReceived).toBe(0);
    });
  });

  // =========================================================================
  // Day 2 — getVehicleReviews
  // =========================================================================
  describe('getVehicleReviews', () => {
    it('should return list of reviews sorted by createdAt desc', async () => {
      const reviews = [
        makeReview({ id: 'r1', user: { fullName: 'A', avatarUrl: null } }),
        makeReview({ id: 'r2', user: { fullName: 'B', avatarUrl: null } }),
      ];
      prisma.review.findMany.mockResolvedValue(reviews);

      const result = await service.getVehicleReviews(VEHICLE_ID);

      expect(result).toHaveLength(2);
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vehicleId: VEHICLE_ID,
            reviewType: ReviewType.RENTER_TO_OWNER,
            revealedAt: { not: null },
          }),
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should return empty array when no reviews', async () => {
      prisma.review.findMany.mockResolvedValue([]);
      const result = await service.getVehicleReviews(VEHICLE_ID);
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // getVehicleReviews — rating filter
  // =========================================================================
  describe('getVehicleReviews — rating filter', () => {
    it('should pass rating filter to Prisma where clause when provided', async () => {
      prisma.review.findMany.mockResolvedValue([makeReview({ rating: 4 })]);

      await service.getVehicleReviews(VEHICLE_ID, 4);

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vehicleId: VEHICLE_ID,
            rating: 4,
            reviewType: ReviewType.RENTER_TO_OWNER,
            revealedAt: { not: null },
          }),
        }),
      );
    });

    it('should NOT include rating in where clause when not provided', async () => {
      prisma.review.findMany.mockResolvedValue([]);

      await service.getVehicleReviews(VEHICLE_ID);

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vehicleId: VEHICLE_ID,
            reviewType: ReviewType.RENTER_TO_OWNER,
            revealedAt: { not: null },
          }),
        }),
      );
      // Ensure rating key is absent
      const call = prisma.review.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('rating');
    });

    it('should return only reviews matching the requested star rating', async () => {
      const filtered = [makeReview({ rating: 5 }), makeReview({ rating: 5 })];
      prisma.review.findMany.mockResolvedValue(filtered);

      const result = await service.getVehicleReviews(VEHICLE_ID, 5);

      expect(result).toHaveLength(2);
      result.forEach((r) => expect(r.rating).toBe(5));
    });
  });

  // =========================================================================
  // Day 2 — getUserReviews
  // =========================================================================
  describe('getUserReviews', () => {
    it('should return reviews with vehicle info included', async () => {
      prisma.review.findMany.mockResolvedValue([
        makeReview({
          user: { fullName: 'Test', avatarUrl: null },
          trip: { bookingId: 'booking-uuid' },
          vehicle: {
            name: 'EV1',
            brand: 'VinFast',
            model: 'Klara',
            images: [],
          },
        }),
      ]);

      const result = await service.getUserReviews(USER_ID);

      expect(result).toHaveLength(1);
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          include: expect.objectContaining({
            vehicle: expect.any(Object),
            trip: expect.any(Object),
          }),
        }),
      );
      expect(result[0].bookingId).toBe('booking-uuid');
    });
  });

  describe('getBookingReviewStatus', () => {
    it('keeps counterpart content hidden before persisted reveal', async () => {
      const elapsedDeadline = new Date(Date.now() - 1000);
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-uuid',
        renterId: USER_ID,
        ownerId: OWNER_ID,
        trip: { id: 'trip-1' },
      });
      prisma.review.findMany.mockResolvedValue([
        makeReview({ id: 'mine', visibleAt: elapsedDeadline }),
        makeReview({
          id: 'theirs',
          userId: OWNER_ID,
          revieweeId: USER_ID,
          reviewType: ReviewType.OWNER_TO_RENTER,
          comment: 'Responsible renter',
          visibleAt: elapsedDeadline,
        }),
      ]);

      const result = await service.getBookingReviewStatus(
        USER_ID,
        'booking-uuid',
      );

      expect(result.submitted).toBe(true);
      expect(result.counterpartSubmitted).toBe(true);
      expect(result.ownReview?.id).toBe('mine');
      expect(result.receivedReview).toBeNull();
      expect(result.isRevealed).toBe(false);
    });

    it('returns the counterpart review after it is revealed', async () => {
      const revealedAt = new Date();
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-uuid',
        renterId: USER_ID,
        ownerId: OWNER_ID,
        trip: { id: 'trip-1' },
      });
      prisma.review.findMany.mockResolvedValue([
        makeReview({
          id: 'theirs',
          userId: OWNER_ID,
          revieweeId: USER_ID,
          reviewType: ReviewType.OWNER_TO_RENTER,
          comment: 'Responsible renter',
          revealedAt,
        }),
      ]);

      const result = await service.getBookingReviewStatus(
        USER_ID,
        'booking-uuid',
      );

      expect(result.submitted).toBe(false);
      expect(result.counterpartSubmitted).toBe(true);
      expect(result.receivedReview?.id).toBe('theirs');
      expect(result.receivedReview?.comment).toBe('Responsible renter');
      expect(result.isRevealed).toBe(true);
    });

    it('rejects users who are not booking participants', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-uuid',
        renterId: USER_ID,
        ownerId: OWNER_ID,
        trip: { id: 'trip-1' },
      });

      await expect(
        service.getBookingReviewStatus('outsider', 'booking-uuid'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.review.findMany).not.toHaveBeenCalled();
    });

    it('reports an empty exchange when the trip has no reviews yet', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-uuid',
        renterId: USER_ID,
        ownerId: OWNER_ID,
        trip: { id: 'trip-1' },
      });
      prisma.review.findMany.mockResolvedValue([]);

      const result = await service.getBookingReviewStatus(
        USER_ID,
        'booking-uuid',
      );

      expect(result.submitted).toBe(false);
      expect(result.counterpartSubmitted).toBe(false);
      expect(result.ownReview).toBeNull();
      expect(result.receivedReview).toBeNull();
      expect(result.revealAt).toBeNull();
    });

    it('throws NotFoundException when the booking is missing', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(
        service.getBookingReviewStatus(USER_ID, 'missing-booking'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.review.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty status when the booking has no trip', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-uuid',
        renterId: USER_ID,
        ownerId: OWNER_ID,
        trip: null,
      });

      const result = await service.getBookingReviewStatus(
        USER_ID,
        'booking-uuid',
      );

      expect(result.submitted).toBe(false);
      expect(result.counterpartSubmitted).toBe(false);
      expect(result.isRevealed).toBe(false);
      expect(result.ownReview).toBeNull();
      expect(result.receivedReview).toBeNull();
      expect(result.revealAt).toBeNull();
      expect(prisma.review.findMany).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // revealEligibleReviews / revealTripReviewsIfComplete edge paths
  // =========================================================================
  describe('reveal scheduling edge cases', () => {
    it('returns 0 and skips updates when no reviews are due', async () => {
      prisma.review.findMany.mockResolvedValue([]);

      const count = await service.revealEligibleReviews();

      expect(count).toBe(0);
      expect(prisma.review.updateMany).not.toHaveBeenCalled();
      expect(prisma.review.update).not.toHaveBeenCalled();
    });

    it('skips trust effects for reviews already applied', async () => {
      const dueReview = makeReview({
        rating: 1,
        visibleAt: new Date(Date.now() - 1000),
        trustAppliedAt: new Date(),
        vehicle: { ownerId: OWNER_ID },
      });
      prisma.review.findMany.mockResolvedValueOnce([dueReview]);
      prisma.review.updateMany.mockResolvedValue({ count: 1 });

      const count = await service.revealEligibleReviews();

      expect(count).toBe(1);
      expect(trustScoreService.recordViolation).not.toHaveBeenCalled();
      expect(prisma.vehicle.update).not.toHaveBeenCalled();
      expect(prisma.review.update).not.toHaveBeenCalled();
    });

    it('applies trust effects to the renter for an owner-to-renter review', async () => {
      const dueReview = makeReview({
        id: 'owner-review',
        userId: OWNER_ID,
        revieweeId: USER_ID,
        reviewType: ReviewType.OWNER_TO_RENTER,
        rating: 5,
        visibleAt: new Date(Date.now() - 1000),
        vehicle: { ownerId: OWNER_ID },
      });
      prisma.review.findMany.mockResolvedValueOnce([dueReview]);
      prisma.review.updateMany.mockResolvedValue({ count: 1 });
      prisma.review.update.mockResolvedValue(dueReview);

      const count = await service.revealEligibleReviews();

      expect(count).toBe(1);
      // Owner-to-renter reviews never recompute the vehicle average.
      expect(prisma.vehicle.update).not.toHaveBeenCalled();
      expect(trustScoreService.recordPositiveEvent).toHaveBeenCalledWith(
        USER_ID,
        'GOOD_REVIEW_RECEIVED',
        1,
        'Received a good rating',
        expect.objectContaining({ rating: 5 }),
      );
      expect(prisma.review.update).toHaveBeenCalledWith({
        where: { id: 'owner-review' },
        data: { trustAppliedAt: expect.any(Date) },
      });
    });

    it('skips trust adjustment when no reviewee can be resolved', async () => {
      const dueReview = makeReview({
        revieweeId: null,
        rating: 1,
        visibleAt: new Date(Date.now() - 1000),
        vehicle: { ownerId: null },
      });
      prisma.review.findMany
        .mockResolvedValueOnce([dueReview]) // due reviews
        .mockResolvedValueOnce([]); // updateVehicleRating revealed reviews
      prisma.review.updateMany.mockResolvedValue({ count: 1 });
      prisma.review.update.mockResolvedValue(dueReview);
      prisma.vehicle.update.mockResolvedValue(makeVehicle());

      const count = await service.revealEligibleReviews();

      expect(count).toBe(1);
      expect(trustScoreService.recordViolation).not.toHaveBeenCalled();
      expect(
        trustScoreService.recordPositiveEvent.mock.calls.some(
          (call) => call[0] === null,
        ),
      ).toBe(false);
    });

    it('reveals both reviews once renter and owner have submitted', async () => {
      const dto = { vehicleId: VEHICLE_ID, rating: 4, comment: 'Good' };
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue(makeTrip());
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(makeReview({ rating: 4 }));
      // revealTripReviewsIfComplete sees both sides already applied → reveal only.
      prisma.review.findMany.mockResolvedValue([
        makeReview({
          id: 'renter-side',
          reviewType: ReviewType.RENTER_TO_OWNER,
          trustAppliedAt: new Date(),
        }),
        makeReview({
          id: 'owner-side',
          userId: OWNER_ID,
          revieweeId: USER_ID,
          reviewType: ReviewType.OWNER_TO_RENTER,
          trustAppliedAt: new Date(),
        }),
      ]);
      prisma.review.updateMany.mockResolvedValue({ count: 2 });

      await service.createReview(USER_ID, dto);

      expect(prisma.review.updateMany).toHaveBeenCalledWith({
        where: { tripId: 'trip-1', revealedAt: null },
        data: { revealedAt: expect.any(Date) },
      });
    });
  });

  // =========================================================================
  // applyConsecutiveLowRatingPenalty
  // =========================================================================
  describe('consecutive low-rating penalty', () => {
    const revealLowRatingForOwner = async () => {
      const dueReview = makeReview({
        rating: 2,
        visibleAt: new Date(Date.now() - 1000),
        vehicle: { ownerId: OWNER_ID },
      });
      prisma.review.updateMany.mockResolvedValue({ count: 1 });
      prisma.review.update.mockResolvedValue(dueReview);
      prisma.vehicle.update.mockResolvedValue(makeVehicle());
      return dueReview;
    };

    it('penalizes an owner for three consecutive low ratings', async () => {
      const dueReview = await revealLowRatingForOwner();
      prisma.review.findMany
        .mockResolvedValueOnce([dueReview]) // due reviews
        .mockResolvedValueOnce([dueReview]) // updateVehicleRating
        .mockResolvedValueOnce([
          makeReview({ id: 'r1', rating: 1 }),
          makeReview({ id: 'r2', rating: 2 }),
          makeReview({ id: 'r3', rating: 2 }),
        ]); // recent three
      prisma.vehicle.findMany.mockResolvedValue([{ id: VEHICLE_ID }]);

      await service.revealEligibleReviews();

      expect(trustScoreService.recordViolation).toHaveBeenCalledWith(
        OWNER_ID,
        'BAD_REVIEW_RECEIVED',
        5,
        'Received 3 consecutive low ratings',
        expect.objectContaining({ streak: 3 }),
        false,
      );
    });

    it('skips the streak penalty when the owner has no vehicles', async () => {
      const dueReview = await revealLowRatingForOwner();
      prisma.review.findMany
        .mockResolvedValueOnce([dueReview]) // due reviews
        .mockResolvedValueOnce([]); // updateVehicleRating
      prisma.vehicle.findMany.mockResolvedValue([]);

      await service.revealEligibleReviews();

      // Only the single low-rating violation (delta 3); no streak penalty.
      expect(trustScoreService.recordViolation).toHaveBeenCalledTimes(1);
      expect(trustScoreService.recordViolation).toHaveBeenCalledWith(
        OWNER_ID,
        'BAD_REVIEW_RECEIVED',
        3,
        'Received a low rating',
        expect.objectContaining({ rating: 2 }),
      );
    });

    it('treats a null owned-vehicle lookup as an empty list', async () => {
      const dueReview = await revealLowRatingForOwner();
      prisma.review.findMany
        .mockResolvedValueOnce([dueReview]) // due reviews
        .mockResolvedValueOnce([]); // updateVehicleRating
      // Prisma returns a nullish result → the `?? []` guard must apply.
      prisma.vehicle.findMany.mockResolvedValue(null);

      await service.revealEligibleReviews();

      expect(trustScoreService.recordViolation).toHaveBeenCalledTimes(1);
    });

    it('skips the streak penalty when the recent ratings are not all low', async () => {
      const dueReview = await revealLowRatingForOwner();
      prisma.review.findMany
        .mockResolvedValueOnce([dueReview]) // due reviews
        .mockResolvedValueOnce([dueReview]) // updateVehicleRating
        .mockResolvedValueOnce([
          makeReview({ id: 'r1', rating: 1 }),
          makeReview({ id: 'r2', rating: 5 }),
          makeReview({ id: 'r3', rating: 2 }),
        ]); // recent three (mixed)
      prisma.vehicle.findMany.mockResolvedValue([{ id: VEHICLE_ID }]);

      await service.revealEligibleReviews();

      // Single low-rating violation only; streak (delta 5) not triggered.
      expect(trustScoreService.recordViolation).toHaveBeenCalledTimes(1);
      expect(trustScoreService.recordViolation).toHaveBeenCalledWith(
        OWNER_ID,
        'BAD_REVIEW_RECEIVED',
        3,
        'Received a low rating',
        expect.objectContaining({ rating: 2 }),
      );
    });
  });

  // =========================================================================
  // getTrustScoreBreakdown — audit payload branch
  // =========================================================================
  describe('getTrustScoreBreakdown — audit payload', () => {
    it('includes recent events and active warnings when audit is requested', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 90 }));
      prisma.review.count.mockResolvedValue(2);
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);
      prisma.trip.count.mockResolvedValue(0);
      prisma.trustScoreEvent.aggregate.mockResolvedValue({
        _sum: { delta: 0 },
      });
      prisma.trustScoreWarning.count.mockResolvedValue(0);
      trustScoreService.getUserTrustProfile.mockResolvedValueOnce({
        tier: { level: 4, label: 'Tốt' },
        recentEvents: [{ id: 'evt-1' }],
        activeWarnings: [{ id: 'warn-1' }],
      });

      const result = await service.getTrustScoreBreakdown(USER_ID, true);

      expect(result.tier).toEqual({ level: 4, label: 'Tốt' });
      expect(result.recentEvents).toEqual([{ id: 'evt-1' }]);
      expect(result.activeWarnings).toEqual([{ id: 'warn-1' }]);
    });

    it('defaults audit collections to empty arrays when the profile omits them', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 90 }));
      prisma.review.count.mockResolvedValue(0);
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);
      prisma.trip.count.mockResolvedValue(0);
      prisma.trustScoreEvent.aggregate.mockResolvedValue({
        _sum: { delta: 0 },
      });
      prisma.trustScoreWarning.count.mockResolvedValue(0);
      trustScoreService.getUserTrustProfile.mockResolvedValueOnce({
        tier: { level: 2, label: 'Thấp' },
        recentEvents: undefined,
        activeWarnings: undefined,
      });

      const result = await service.getTrustScoreBreakdown(USER_ID, true);

      expect(result.recentEvents).toEqual([]);
      expect(result.activeWarnings).toEqual([]);
    });

    it('skips the trust profile lookup when userId is falsy and audit is off', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 88 }));
      prisma.review.count.mockResolvedValue(0);
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);
      prisma.trip.count.mockResolvedValue(0);
      prisma.trustScoreEvent.aggregate.mockResolvedValue({
        _sum: { delta: 0 },
      });
      prisma.trustScoreWarning.count.mockResolvedValue(0);

      const result = await service.getTrustScoreBreakdown('', false);

      expect(result.tier).toBeUndefined();
      expect(trustScoreService.getUserTrustProfile).not.toHaveBeenCalled();
    });
  });
});
