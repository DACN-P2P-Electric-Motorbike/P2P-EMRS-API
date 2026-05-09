import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

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
  vehicleId: VEHICLE_ID,
  rating: 5,
  comment: 'Great bike!',
  createdAt: new Date(),
  updatedAt: new Date(),
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
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  user: { findUnique: jest.fn(), update: jest.fn() },
  booking: { count: jest.fn() },
});

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
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
      prisma.trip.findFirst.mockResolvedValue({
        id: 'trip-1',
        status: 'COMPLETED',
      });
      prisma.review.findFirst.mockResolvedValue(makeReview());

      await expect(service.createReview(USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when the booking trip is already reviewed', async () => {
      const dtoWithBooking = { ...dto, bookingId: 'booking-uuid' };
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue({
        id: 'trip-1',
        status: 'COMPLETED',
      });
      prisma.review.findFirst.mockResolvedValue(
        makeReview({ tripId: 'trip-1' }),
      );

      await expect(
        service.createReview(USER_ID, dtoWithBooking),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a trip-bound review when bookingId is provided', async () => {
      const dtoWithBooking = { ...dto, bookingId: 'booking-uuid' };
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue({
        id: 'trip-1',
        status: 'COMPLETED',
      });
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
        data: {
          userId: USER_ID,
          vehicleId: VEHICLE_ID,
          tripId: 'trip-1',
          rating: 5,
          comment: 'Nice',
        },
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
      prisma.trip.findFirst.mockResolvedValue({
        id: 'trip-1',
        status: 'COMPLETED',
      });
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
        data: {
          userId: USER_ID,
          vehicleId: VEHICLE_ID,
          rating: 4,
          comment: 'Good bike',
        },
      });
    });

    it('should update vehicle average rating', async () => {
      await service.createReview(USER_ID, dto);
      expect(prisma.vehicle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VEHICLE_ID },
          data: expect.objectContaining({ reviewCount: 1 }),
        }),
      );
    });

    it('should boost renter trust score by +1', async () => {
      await service.createReview(USER_ID, dto);

      const userUpdateCalls = prisma.user.update.mock.calls;
      const renterUpdate = userUpdateCalls.find(
        (c: any) => c[0].where.id === USER_ID,
      );
      expect(renterUpdate).toBeDefined();
    });
  });

  // =========================================================================
  // Day 2 — Trust score calculation: adjustOwnerTrustFromRating
  // =========================================================================
  describe('trust score — owner rating impact', () => {
    const createReviewWithRating = async (rating: number) => {
      const dto = { vehicleId: VEHICLE_ID, rating, comment: undefined };
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue({
        id: 'trip-1',
        status: 'COMPLETED',
      });
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(makeReview({ rating }));
      prisma.review.findMany.mockResolvedValue([makeReview({ rating })]);
      prisma.vehicle.update.mockResolvedValue(makeVehicle());
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: OWNER_ID, trustScore: 80 }),
      );
      prisma.user.update.mockResolvedValue(makeUser());

      await service.createReview(USER_ID, dto);
    };

    it('should decrease owner trust by 3 for 1-star rating', async () => {
      await createReviewWithRating(1);
      const ownerUpdate = prisma.user.update.mock.calls.find(
        (c: any) => c[0].where.id === OWNER_ID,
      );
      expect(ownerUpdate).toBeDefined();
      expect(ownerUpdate![0].data.trustScore).toBe(77); // 80 - 3
    });

    it('should decrease owner trust by 3 for 2-star rating', async () => {
      await createReviewWithRating(2);
      const ownerUpdate = prisma.user.update.mock.calls.find(
        (c: any) => c[0].where.id === OWNER_ID,
      );
      expect(ownerUpdate![0].data.trustScore).toBe(77);
    });

    it('should not change owner trust for 3-star rating', async () => {
      await createReviewWithRating(3);
      const ownerUpdate = prisma.user.update.mock.calls.find(
        (c: any) => c[0].where.id === OWNER_ID,
      );
      // adjustOwnerTrustFromRating doesn't call adjustTrustScore for 3 stars
      expect(ownerUpdate).toBeUndefined();
    });

    it('should increase owner trust by 1 for 4-star rating', async () => {
      await createReviewWithRating(4);
      const ownerUpdate = prisma.user.update.mock.calls.find(
        (c: any) => c[0].where.id === OWNER_ID,
      );
      expect(ownerUpdate).toBeDefined();
      expect(ownerUpdate![0].data.trustScore).toBe(81); // 80 + 1
    });

    it('should increase owner trust by 1 for 5-star rating', async () => {
      await createReviewWithRating(5);
      const ownerUpdate = prisma.user.update.mock.calls.find(
        (c: any) => c[0].where.id === OWNER_ID,
      );
      expect(ownerUpdate![0].data.trustScore).toBe(81);
    });
  });

  // =========================================================================
  // Day 2 — Trust score clamping
  // =========================================================================
  describe('trust score — clamping to 0-100', () => {
    it('should not exceed 100', async () => {
      const dto = { vehicleId: VEHICLE_ID, rating: 5 };
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue({
        id: 'trip-1',
        status: 'COMPLETED',
      });
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(makeReview());
      prisma.review.findMany.mockResolvedValue([makeReview()]);
      prisma.vehicle.update.mockResolvedValue(makeVehicle());
      prisma.user.findUnique.mockResolvedValue(makeUser({ trustScore: 100 }));
      prisma.user.update.mockResolvedValue(makeUser());

      await service.createReview(USER_ID, dto);

      const renterUpdate = prisma.user.update.mock.calls.find(
        (c: any) => c[0].where.id === USER_ID,
      );
      expect(renterUpdate![0].data.trustScore).toBe(100); // min(100, 100+1)
    });

    it('should not go below 0', async () => {
      const dto = { vehicleId: VEHICLE_ID, rating: 1 };
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue({
        id: 'trip-1',
        status: 'COMPLETED',
      });
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(makeReview({ rating: 1 }));
      prisma.review.findMany.mockResolvedValue([makeReview({ rating: 1 })]);
      prisma.vehicle.update.mockResolvedValue(makeVehicle());
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: OWNER_ID, trustScore: 1 }),
      );
      prisma.user.update.mockResolvedValue(makeUser());

      await service.createReview(USER_ID, dto);

      const ownerUpdate = prisma.user.update.mock.calls.find(
        (c: any) => c[0].where.id === OWNER_ID,
      );
      expect(ownerUpdate![0].data.trustScore).toBe(0); // max(0, 1-3)
    });
  });

  // =========================================================================
  // Day 2 — Vehicle rating calculation
  // =========================================================================
  describe('updateVehicleRating', () => {
    it('should calculate average from multiple reviews', async () => {
      const dto = { vehicleId: VEHICLE_ID, rating: 4 };
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle());
      prisma.trip.findFirst.mockResolvedValue({
        id: 'trip-1',
        status: 'COMPLETED',
      });
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(makeReview({ rating: 4 }));
      prisma.review.findMany.mockResolvedValue([
        makeReview({ rating: 5 }),
        makeReview({ rating: 3 }),
        makeReview({ rating: 4 }),
      ]);
      prisma.vehicle.update.mockResolvedValue(makeVehicle());
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser());

      await service.createReview(USER_ID, dto);

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

      const result = await service.getTrustScoreBreakdown(USER_ID);

      expect(result.trustScore).toBe(72);
      expect(result.breakdown.reviewsGiven).toBe(5);
      expect(result.breakdown.reviewsGivenBonus).toBe(5);
      expect(result.breakdown.avgRatingReceived).toBe(4.2);
      expect(result.breakdown.totalReviewsReceived).toBe(8);
      expect(result.breakdown.cancelledBookings).toBe(3);
      expect(result.breakdown.cancellationPenalty).toBe(-15); // 3 * -5
      expect(result.breakdown.rejectedBookings).toBe(1);
      expect(result.breakdown.rejectionPenalty).toBe(-2); // 1 * -2
      expect(result.breakdown.completedTrips).toBe(10);
      expect(result.breakdown.tripsWithIssues).toBe(2);
      expect(result.breakdown.violationPenalty).toBe(-6); // 2 * -3
    });

    it('should return null avgRatingReceived when user owns no vehicles', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.review.count.mockResolvedValue(0);
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);
      prisma.trip.count.mockResolvedValue(0);

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
          where: { vehicleId: VEHICLE_ID },
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
          where: { vehicleId: VEHICLE_ID, rating: 4 },
        }),
      );
    });

    it('should NOT include rating in where clause when not provided', async () => {
      prisma.review.findMany.mockResolvedValue([]);

      await service.getVehicleReviews(VEHICLE_ID);

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { vehicleId: VEHICLE_ID },
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
});
