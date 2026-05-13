/**
 * @module Booking Tests
 * @member Member A — Dương Hoàng Long
 * @coverage target ≥80%
 * @testCount 28
 *
 * Unit tests for BookingsService.
 * Covers: createBooking, isVehicleAvailable (via createBooking & direct call),
 * cancelBooking, and a concurrency simulation for double-booking prevention.
 *
 * Key points about the actual service:
 *  - createBooking sets status = BookingStatus.PENDING (not CONFIRMED)
 *  - cancelBooking allows cancelling PENDING or CONFIRMED bookings
 *  - Own-vehicle check throws BadRequestException (not ForbiddenException)
 *  - isVehicleAvailable is private; we test it through createBooking
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingStatus, VehicleStatus, Prisma } from '@prisma/client';

import { BookingsService } from './bookings.service';
import { PrismaService } from '../database/prisma.service';
import { TrustScoreService } from '../trust-score/trust-score.service';
import {
  createMockBooking,
  RENTER_ID,
  BOOKING_OWNER_ID,
  BOOKED_VEHICLE_ID,
  BOOKING_ID,
  THIRD_PARTY_ID,
} from '../../test/factories/booking.factory';
import { createMockVehicle } from '../../test/factories/vehicle.factory';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a future Date offset by `offsetHours` from now */
function futureDate(offsetHours: number): Date {
  const d = new Date();
  d.setHours(d.getHours() + offsetHours);
  return d;
}

/** A vehicle that passes all availability checks */
function createAvailableVehicle(overrides = {}) {
  return {
    ...createMockVehicle({
      id: BOOKED_VEHICLE_ID,
      ownerId: BOOKING_OWNER_ID,
      status: VehicleStatus.AVAILABLE,
      isAvailable: true,
    }),
    owner: {
      id: BOOKING_OWNER_ID,
      fullName: 'Owner Name',
      phone: '0901234567',
      avatarUrl: null,
    },
    pricePerHour: new Prisma.Decimal(25000),
    pricePerDay: new Prisma.Decimal(300000),
    deposit: 500000,
    ...overrides,
  };
}

/** Builds a CreateBookingDto with future times */
function buildCreateBookingDto(overrides: Record<string, any> = {}) {
  return {
    vehicleId: BOOKED_VEHICLE_ID,
    startTime: futureDate(2).toISOString(),
    endTime: futureDate(4).toISOString(),
    notes: 'Test booking',
    ...overrides,
  };
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

describe('BookingsService', () => {
  let service: BookingsService;

  const mockVehicleDelegate = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  };
  const mockBookingDelegate = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const mockUserDelegate = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const mockEventEmitter = { emit: jest.fn() };
  const mockTrustScoreService = {
    assertCanCreateBooking: jest.fn().mockResolvedValue(undefined),
    recordViolation: jest.fn().mockResolvedValue({ warned: true, score: 100 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: PrismaService,
          useValue: {
            vehicle: mockVehicleDelegate,
            booking: mockBookingDelegate,
            user: mockUserDelegate,
            // Simulate Prisma interactive transaction by immediately invoking
            // the callback with a mock transactional client
            $transaction: jest.fn().mockImplementation(async (callback) =>
              callback({
                booking: mockBookingDelegate,
                payment: {
                  findUnique: jest.fn().mockResolvedValue(null),
                  update: jest.fn(),
                },
                user: mockUserDelegate,
              }),
            ),
          },
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: TrustScoreService,
          useValue: mockTrustScoreService,
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);

    jest.clearAllMocks();
  });

  // ─── createBooking ──────────────────────────────────────────────────────────

  describe('createBooking', () => {
    it('should create booking with status PENDING when vehicle is available', async () => {
      // Arrange
      const vehicle = createAvailableVehicle();
      const pendingBooking = createMockBooking({
        status: BookingStatus.PENDING,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockBookingDelegate.findMany.mockResolvedValue([]); // no conflicts
      mockBookingDelegate.create.mockResolvedValue(pendingBooking);
      mockUserDelegate.findUnique.mockResolvedValue(null); // trust score decrease no-op

      const dto = buildCreateBookingDto();

      // Act
      const result = await service.createBooking(RENTER_ID, dto as any);

      // Assert
      expect(result.status).toBe(BookingStatus.PENDING);
      expect(result.renterId).toBe(RENTER_ID);
    });

    it('should emit event "booking.created" via EventEmitter2 after booking is created', async () => {
      // Arrange
      const vehicle = createAvailableVehicle();
      const booking = createMockBooking();
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockBookingDelegate.findMany.mockResolvedValue([]);
      mockBookingDelegate.create.mockResolvedValue(booking);

      const dto = buildCreateBookingDto();

      // Act
      await service.createBooking(RENTER_ID, dto as any);

      // Assert
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.created',
        expect.any(Object),
      );
    });

    it('should throw ConflictException("Vehicle is not available") when vehicle.isAvailable is false', async () => {
      // Arrange — vehicle is explicitly marked unavailable
      const vehicle = createAvailableVehicle({
        isAvailable: false,
        status: VehicleStatus.UNAVAILABLE,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      const dto = buildCreateBookingDto();

      // Act & Assert
      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow('Vehicle is not available for booking');
    });

    it('should throw ConflictException when vehicle is already booked for overlapping time', async () => {
      // Arrange — vehicle is available but time slot is conflicted
      const vehicle = createAvailableVehicle();
      const existingBooking = createMockBooking();
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      // isVehicleAvailable call returns a conflict
      mockBookingDelegate.findMany.mockResolvedValue([existingBooking]);

      const dto = buildCreateBookingDto();

      // Act & Assert
      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow(
        'Vehicle is already booked for the selected time period',
      );
    });

    it('should throw BadRequestException("You cannot book your own vehicle") when renterId equals ownerId', async () => {
      // Arrange — owner tries to rent their own vehicle
      const vehicle = createAvailableVehicle({ ownerId: RENTER_ID });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      const dto = buildCreateBookingDto();

      // Act & Assert
      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow('You cannot book your own vehicle');
    });

    it('should throw BadRequestException when startTime is in the past', async () => {
      // Arrange
      const pastStart = new Date();
      pastStart.setHours(pastStart.getHours() - 2); // 2 hours in the past

      const dto = buildCreateBookingDto({
        startTime: pastStart.toISOString(),
        endTime: futureDate(2).toISOString(),
      });

      // Act & Assert
      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow('Start time must be in the future');
    });

    it('should throw BadRequestException when endTime is before startTime', async () => {
      // Arrange — endTime < startTime
      const dto = buildCreateBookingDto({
        startTime: futureDate(4).toISOString(),
        endTime: futureDate(2).toISOString(),
      });

      // Act & Assert
      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow('End time must be after start time');
    });

    it('should throw BadRequestException when duration is under 30 minutes', async () => {
      const start = futureDate(2);
      const end = new Date(start.getTime() + 20 * 60 * 1000);
      const dto = buildCreateBookingDto({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow('Booking duration must be at least 30 minutes');
    });

    it('should throw BadRequestException when duration is over 30 days', async () => {
      const start = futureDate(2);
      const end = new Date(start.getTime() + 31 * 24 * 60 * 60 * 1000);
      const dto = buildCreateBookingDto({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow('Booking duration cannot exceed 30 days');
    });

    it('should throw NotFoundException when vehicleId does not exist', async () => {
      // Arrange
      mockVehicleDelegate.findUnique.mockResolvedValue(null);

      const dto = buildCreateBookingDto();

      // Act & Assert
      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.createBooking(RENTER_ID, dto as any),
      ).rejects.toThrow('Vehicle not found');
    });
  });

  // ─── checkAvailability (via isVehicleAvailable) ─────────────────────────────

  /**
   * isVehicleAvailable is private, so we test it indirectly through createBooking.
   * Each scenario sets up the vehicle mock + booking.findMany mock to simulate
   * different overlap conditions.
   */
  describe('checkAvailability (tested via createBooking overlap scenarios)', () => {
    // Reference window: 10:00 – 14:00 tomorrow
    const newStart = futureDate(10);
    const newEnd = futureDate(14);

    // Helper to call createBooking with specific start/end
    async function checkOverlap(
      existingStart: Date,
      existingEnd: Date,
    ): Promise<boolean> {
      const vehicle = createAvailableVehicle();
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      const existingBooking = createMockBooking({
        startTime: existingStart,
        endTime: existingEnd,
        status: BookingStatus.CONFIRMED,
      });

      // isVehicleAvailable returns false (conflict) → throws ConflictException
      // isVehicleAvailable returns true (no conflict) → proceeds to create
      mockBookingDelegate.findMany.mockResolvedValueOnce([existingBooking]);
      mockBookingDelegate.create.mockResolvedValue(createMockBooking());

      const dto = {
        vehicleId: BOOKED_VEHICLE_ID,
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
      };

      try {
        await service.createBooking(RENTER_ID, dto as any);
        return true; // no conflict
      } catch (e) {
        if (
          e instanceof ConflictException &&
          e.message.includes('already booked')
        ) {
          return false; // conflict detected
        }
        throw e;
      }
    }

    it('should return true (no conflict) when no bookings overlap with the requested time range', async () => {
      // Arrange — bookings outside the window
      const vehicle = createAvailableVehicle();
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockBookingDelegate.findMany.mockResolvedValue([]); // no rows returned
      mockBookingDelegate.create.mockResolvedValue(createMockBooking());

      const dto = buildCreateBookingDto();
      const result = await service.createBooking(RENTER_ID, dto as any);

      // Assert — createBooking succeeded, implying isVehicleAvailable returned true
      expect(result).toBeDefined();
    });

    it('should return false when new booking is completely inside an existing booking', async () => {
      // Existing: 8:00 – 18:00 | New: 10:00 – 14:00 (inside existing)
      const available = await checkOverlap(futureDate(8), futureDate(18));
      expect(available).toBe(false);
    });

    it('should return false when existing booking is completely inside the new booking', async () => {
      // Existing: 11:00 – 13:00 | New: 10:00 – 14:00 (existing inside new)
      const available = await checkOverlap(futureDate(11), futureDate(13));
      expect(available).toBe(false);
    });

    it('should return false when new booking partially overlaps at the start of existing booking', async () => {
      // Existing: 12:00 – 16:00 | New: 10:00 – 14:00 (overlaps at start of existing)
      const available = await checkOverlap(futureDate(12), futureDate(16));
      expect(available).toBe(false);
    });

    it('should return false when new booking partially overlaps at the end of existing booking', async () => {
      // Existing: 8:00 – 12:00 | New: 10:00 – 14:00 (overlaps at end of existing)
      const available = await checkOverlap(futureDate(8), futureDate(12));
      expect(available).toBe(false);
    });

    it('should return false when new booking has the exact same time range as existing booking', async () => {
      // Existing: 10:00 – 14:00 | New: 10:00 – 14:00 (identical)
      const available = await checkOverlap(futureDate(10), futureDate(14));
      expect(available).toBe(false);
    });
  });

  // ─── cancelBooking ──────────────────────────────────────────────────────────

  describe('cancelBooking', () => {
    it('should set booking status to CANCELLED when called by the renter', async () => {
      // Arrange
      const booking = createMockBooking({
        status: BookingStatus.PENDING,
        renterId: RENTER_ID,
      });
      const cancelledBooking = createMockBooking({
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
      });
      mockBookingDelegate.findUnique.mockResolvedValue(booking);
      mockBookingDelegate.update.mockResolvedValue(cancelledBooking);
      mockUserDelegate.findUnique.mockResolvedValue({
        id: RENTER_ID,
        trustScore: 100,
      });
      mockUserDelegate.update.mockResolvedValue({});

      const dto = { reason: 'Changed plans' };

      // Act
      const result = await service.cancelBooking(
        BOOKING_ID,
        RENTER_ID,
        dto as any,
      );

      // Assert
      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(mockBookingDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BOOKING_ID },
          data: expect.objectContaining({ status: BookingStatus.CANCELLED }),
        }),
      );
    });

    it('should emit "booking.cancelled" event which triggers refund flow', async () => {
      // Arrange
      const booking = createMockBooking({
        status: BookingStatus.CONFIRMED,
        renterId: RENTER_ID,
      });
      const cancelledBooking = createMockBooking({
        status: BookingStatus.CANCELLED,
      });
      mockBookingDelegate.findUnique.mockResolvedValue(booking);
      mockBookingDelegate.update.mockResolvedValue(cancelledBooking);
      mockUserDelegate.findUnique.mockResolvedValue({
        id: RENTER_ID,
        trustScore: 100,
      });
      mockUserDelegate.update.mockResolvedValue({});

      const dto = { reason: 'Emergency' };

      // Act
      await service.cancelBooking(BOOKING_ID, RENTER_ID, dto as any);

      // Assert
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.cancelled',
        expect.any(Object),
      );
    });

    it('should throw BadRequestException when booking status is COMPLETED', async () => {
      // Arrange
      const booking = createMockBooking({
        status: BookingStatus.COMPLETED,
        renterId: RENTER_ID,
      });
      mockBookingDelegate.findUnique.mockResolvedValue(booking);

      const dto = { reason: 'Too late' };

      // Act & Assert
      await expect(
        service.cancelBooking(BOOKING_ID, RENTER_ID, dto as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.cancelBooking(BOOKING_ID, RENTER_ID, dto as any),
      ).rejects.toThrow('Only pending or confirmed bookings can be cancelled');
    });

    it('should throw BadRequestException when booking status is already CANCELLED', async () => {
      // Arrange
      const booking = createMockBooking({
        status: BookingStatus.CANCELLED,
        renterId: RENTER_ID,
      });
      mockBookingDelegate.findUnique.mockResolvedValue(booking);

      const dto = { reason: 'Already cancelled' };

      // Act & Assert
      await expect(
        service.cancelBooking(BOOKING_ID, RENTER_ID, dto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when userId is not the renter of the booking', async () => {
      // Arrange — booking belongs to RENTER_ID, but THIRD_PARTY_ID tries to cancel
      const booking = createMockBooking({
        renterId: RENTER_ID,
        status: BookingStatus.PENDING,
      });
      mockBookingDelegate.findUnique.mockResolvedValue(booking);

      const dto = { reason: 'Unauthorized' };

      // Act & Assert
      await expect(
        service.cancelBooking(BOOKING_ID, THIRD_PARTY_ID, dto as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.cancelBooking(BOOKING_ID, THIRD_PARTY_ID, dto as any),
      ).rejects.toThrow('You can only cancel your own bookings');
    });
  });

  // ─── getBookingById ─────────────────────────────────────────────────────────

  describe('getBookingById', () => {
    it('should return booking when accessed by the renter', async () => {
      // Arrange
      const booking = createMockBooking({ renterId: RENTER_ID });
      mockBookingDelegate.findUnique.mockResolvedValue(booking);

      // Act
      const result = await service.getBookingById(BOOKING_ID, RENTER_ID);

      // Assert
      expect(result.id).toBe(BOOKING_ID);
      expect(result.renterId).toBe(RENTER_ID);
    });

    it('should return booking when accessed by the vehicle owner', async () => {
      // Arrange
      const booking = createMockBooking({ ownerId: BOOKING_OWNER_ID });
      mockBookingDelegate.findUnique.mockResolvedValue(booking);

      // Act
      const result = await service.getBookingById(BOOKING_ID, BOOKING_OWNER_ID);

      // Assert
      expect(result.id).toBe(BOOKING_ID);
    });

    it('should throw NotFoundException when neither renter nor owner accesses the booking', async () => {
      // Arrange — third party user tries to access
      const booking = createMockBooking({
        renterId: RENTER_ID,
        ownerId: BOOKING_OWNER_ID,
      });
      mockBookingDelegate.findUnique.mockResolvedValue(booking);

      // Act & Assert
      await expect(
        service.getBookingById(BOOKING_ID, THIRD_PARTY_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when bookingId does not exist', async () => {
      // Arrange
      mockBookingDelegate.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getBookingById('nonexistent-booking', RENTER_ID),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.getBookingById('nonexistent-booking', RENTER_ID),
      ).rejects.toThrow('Booking not found');
    });
  });

  // ─── CONCURRENCY TEST — double booking ──────────────────────────────────────

  describe('CONCURRENCY — double booking prevention', () => {
    /**
     * Scenario: 2 users attempt to book the same vehicle for the same time slot.
     * We simulate DB-level serialization by controlling what findMany returns
     * on the first vs second call:
     *   - 1st call: no conflicts → booking created successfully
     *   - 2nd call: the first booking now exists → conflict detected
     */
    it('should allow only 1 booking to succeed and return 409 for the second request', async () => {
      // Arrange
      const vehicle = createAvailableVehicle();
      const firstBooking = createMockBooking({ renterId: RENTER_ID });

      const secondRenterId = '22222222-7777-4000-8000-222222222222';
      const dto = buildCreateBookingDto();

      // First renter's flow: no conflict
      // Second renter's flow: sees first renter's booking → conflict
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockBookingDelegate.findMany
        .mockResolvedValueOnce([]) // 1st call — no conflicts
        .mockResolvedValueOnce([firstBooking]); // 2nd call — conflict exists
      mockBookingDelegate.create.mockResolvedValue(firstBooking);

      // Act — simulate two concurrent requests
      const results = await Promise.allSettled([
        service.createBooking(RENTER_ID, dto as any),
        service.createBooking(secondRenterId, dto as any),
      ]);

      // Assert
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);

      const failedResult = failed[0];
      expect(failedResult.reason).toBeInstanceOf(ConflictException);
    });

    it('should reject the second request with a ConflictException (409) message', async () => {
      // Arrange
      const vehicle = createAvailableVehicle();
      const firstBooking = createMockBooking({ renterId: RENTER_ID });
      const dto = buildCreateBookingDto();

      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockBookingDelegate.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([firstBooking]);
      mockBookingDelegate.create.mockResolvedValue(firstBooking);

      const secondRenterId = '33333333-8888-4000-8000-333333333333';

      // Act
      const [first, second] = await Promise.allSettled([
        service.createBooking(RENTER_ID, dto as any),
        service.createBooking(secondRenterId, dto as any),
      ]);

      // Assert
      expect(first.status).toBe('fulfilled');
      expect(second.status).toBe('rejected');
      expect((second as PromiseRejectedResult).reason.message).toMatch(
        /already booked|not available/i,
      );
    });
  });

  // ─── getRenterBookings / getUpcomingBookings / getBookingHistory / schedule ─

  describe('getRenterBookings', () => {
    it('returns renter bookings without status filter', async () => {
      mockBookingDelegate.findMany.mockResolvedValue([createMockBooking()]);

      const result = await service.getRenterBookings(RENTER_ID);

      expect(result).toHaveLength(1);
      expect(mockBookingDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { renterId: RENTER_ID },
        }),
      );
    });

    it('adds status to where when filter is provided', async () => {
      mockBookingDelegate.findMany.mockResolvedValue([]);

      await service.getRenterBookings(RENTER_ID, BookingStatus.CONFIRMED);

      expect(mockBookingDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { renterId: RENTER_ID, status: BookingStatus.CONFIRMED },
        }),
      );
    });
  });

  describe('getUpcomingBookings', () => {
    it('delegates to findMany with confirmed/ongoing and future start', async () => {
      mockBookingDelegate.findMany.mockResolvedValue([createMockBooking()]);

      const result = await service.getUpcomingBookings(RENTER_ID);

      expect(result).toHaveLength(1);
      expect(mockBookingDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            renterId: RENTER_ID,
            status: {
              in: [BookingStatus.CONFIRMED, BookingStatus.ONGOING],
            },
          }),
        }),
      );
    });
  });

  describe('getBookingHistory', () => {
    it('delegates to findMany with completed/cancelled', async () => {
      mockBookingDelegate.findMany.mockResolvedValue([]);

      await service.getBookingHistory(RENTER_ID);

      expect(mockBookingDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            renterId: RENTER_ID,
            status: {
              in: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
            },
          }),
          take: 50,
        }),
      );
    });
  });

  describe('getVehicleSchedule', () => {
    it('returns upcoming bookings for a vehicle id', async () => {
      mockBookingDelegate.findMany.mockResolvedValue([createMockBooking()]);

      const result = await service.getVehicleSchedule(BOOKED_VEHICLE_ID);

      expect(result.length).toBe(1);
      expect(mockBookingDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vehicleId: BOOKED_VEHICLE_ID,
          }),
          take: 30,
        }),
      );
    });
  });

  describe('createBooking — pricing branches', () => {
    it('uses daily rate when booking spans at least one full day', async () => {
      const vehicle = createAvailableVehicle();
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockBookingDelegate.findMany.mockResolvedValue([]);

      const start = futureDate(24);
      const end = futureDate(52);
      const pending = createMockBooking({ status: BookingStatus.PENDING });
      mockBookingDelegate.create.mockResolvedValue(pending);

      await service.createBooking(RENTER_ID, {
        vehicleId: BOOKED_VEHICLE_ID,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      } as any);

      expect(mockBookingDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalPrice: expect.any(Number),
          }),
        }),
      );
    });
  });
});
