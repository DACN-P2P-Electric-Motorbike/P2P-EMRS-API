/**
 * @module Booking Tests — Controller
 * @member Member A — Dương Hoàng Long
 * @coverage target ≥80%
 * @testCount 12
 *
 * Unit tests for BookingsController.
 * BookingsService is fully mocked — no DB, no HTTP server.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingLockService } from './booking-lock.service';
import { BookingEntity } from './entities/booking.entity';
import {
  createMockBooking,
  RENTER_ID,
  BOOKED_VEHICLE_ID,
  BOOKING_ID,
} from '../../test/factories/booking.factory';

// ─── Mock Service ─────────────────────────────────────────────────────────────
const mockBookingsService = {
  createBooking: jest.fn(),
  getRenterBookings: jest.fn(),
  getUpcomingBookings: jest.fn(),
  getBookingHistory: jest.fn(),
  getBookingById: jest.fn(),
  getCancellationRefundPreview: jest.fn(),
  cancelBooking: jest.fn(),
  getVehicleSchedule: jest.fn(),
};

const mockBookingLockService = {
  createLock: jest.fn(),
  releaseLock: jest.fn(),
};

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe('BookingsController', () => {
  let controller: BookingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        {
          provide: BookingsService,
          useValue: mockBookingsService,
        },
        {
          provide: BookingLockService,
          useValue: mockBookingLockService,
        },
      ],
    }).compile();

    controller = module.get<BookingsController>(BookingsController);

    jest.clearAllMocks();
  });

  // ─── POST / — createBooking ─────────────────────────────────────────────────
  describe('POST / (createBooking)', () => {
    it('should delegate to BookingsService.createBooking and return the result', async () => {
      // Arrange
      const booking = BookingEntity.fromPrisma(createMockBooking());
      mockBookingsService.createBooking.mockResolvedValue(booking);

      const dto = {
        vehicleId: BOOKED_VEHICLE_ID,
        startTime: new Date(Date.now() + 3600000).toISOString(),
        endTime: new Date(Date.now() + 7200000).toISOString(),
      };

      // Act
      const result = await controller.createBooking(RENTER_ID, dto as any);

      // Assert
      expect(result.id).toBe(BOOKING_ID);
      expect(mockBookingsService.createBooking).toHaveBeenCalledWith(
        RENTER_ID,
        dto,
      );
    });

    it('should propagate ConflictException when vehicle is not available', async () => {
      // Arrange
      mockBookingsService.createBooking.mockRejectedValue(
        new ConflictException('Vehicle is not available for booking'),
      );

      // Act & Assert
      await expect(
        controller.createBooking(RENTER_ID, {} as any),
      ).rejects.toThrow(ConflictException);
    });

    it('should propagate BadRequestException when startTime is in the past', async () => {
      // Arrange
      mockBookingsService.createBooking.mockRejectedValue(
        new BadRequestException('Start time must be in the future'),
      );

      // Act & Assert
      await expect(
        controller.createBooking(RENTER_ID, {} as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── GET / — getRenterBookings ──────────────────────────────────────────────
  describe('GET / (getRenterBookings)', () => {
    it('should return the list of bookings for the current renter', async () => {
      // Arrange
      const bookings = [
        BookingEntity.fromPrisma(createMockBooking({ id: 'b1' })),
        BookingEntity.fromPrisma(createMockBooking({ id: 'b2' })),
      ];
      mockBookingsService.getRenterBookings.mockResolvedValue(bookings);

      // Act
      const result = await controller.getRenterBookings(RENTER_ID);

      // Assert
      expect(result).toHaveLength(2);
      expect(mockBookingsService.getRenterBookings).toHaveBeenCalledWith(
        RENTER_ID,
        undefined,
      );
    });

    it('should pass status filter to service when provided', async () => {
      // Arrange
      mockBookingsService.getRenterBookings.mockResolvedValue([]);

      // Act
      await controller.getRenterBookings(RENTER_ID, BookingStatus.CONFIRMED);

      // Assert
      expect(mockBookingsService.getRenterBookings).toHaveBeenCalledWith(
        RENTER_ID,
        BookingStatus.CONFIRMED,
      );
    });
  });

  // ─── GET /:id — getBooking ──────────────────────────────────────────────────
  describe('GET /:id (getBooking)', () => {
    it('should return booking when user is the renter', async () => {
      // Arrange
      const booking = BookingEntity.fromPrisma(
        createMockBooking({ renterId: RENTER_ID }),
      );
      mockBookingsService.getBookingById.mockResolvedValue(booking);

      // Act
      const result = await controller.getBooking(BOOKING_ID, RENTER_ID);

      // Assert
      expect(result.id).toBe(BOOKING_ID);
      expect(mockBookingsService.getBookingById).toHaveBeenCalledWith(
        BOOKING_ID,
        RENTER_ID,
      );
    });

    it('should propagate NotFoundException for non-existent booking', async () => {
      // Arrange
      mockBookingsService.getBookingById.mockRejectedValue(
        new NotFoundException('Booking not found'),
      );

      // Act & Assert
      await expect(
        controller.getBooking('nonexistent', RENTER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /:id/cancellation-preview', () => {
    it('should return cancellation refund preview for the current user', async () => {
      const preview = {
        bookingId: BOOKING_ID,
        cancelledBy: 'RENTER',
        cancellable: true,
        hoursUntilStart: 12,
        policyCode: 'RENTER_STANDARD_PARTIAL_REFUND',
        rentalRefundRate: 0.5,
        trustPenalty: 5,
        rentalAmount: 100000,
        depositAmount: 500000,
        paidAmount: 600000,
        refundableRentalAmount: 50000,
        refundableDepositAmount: 500000,
        refundAmount: 550000,
        forfeitedRentalAmount: 50000,
        forfeitedDepositAmount: 0,
        forfeitedAmount: 50000,
        isPaid: true,
        paymentStatus: 'COMPLETED',
        refundType: 'partial',
      };
      mockBookingsService.getCancellationRefundPreview.mockResolvedValue(
        preview,
      );

      const result = await controller.getCancellationRefundPreview(
        BOOKING_ID,
        RENTER_ID,
      );

      expect(result).toEqual(preview);
      expect(
        mockBookingsService.getCancellationRefundPreview,
      ).toHaveBeenCalledWith(BOOKING_ID, RENTER_ID);
    });
  });

  // ─── PATCH /:id/cancel — cancelBooking ──────────────────────────────────────
  describe('PATCH /:id/cancel (cancelBooking)', () => {
    it('should return the cancelled booking when renter cancels', async () => {
      // Arrange
      const cancelled = BookingEntity.fromPrisma(
        createMockBooking({
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
        }),
      );
      mockBookingsService.cancelBooking.mockResolvedValue(cancelled);

      const dto = { reason: 'Changed my mind' };

      // Act
      const result = await controller.cancelBooking(
        BOOKING_ID,
        RENTER_ID,
        dto as any,
      );

      // Assert
      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(mockBookingsService.cancelBooking).toHaveBeenCalledWith(
        BOOKING_ID,
        RENTER_ID,
        dto,
      );
    });

    it('should propagate BadRequestException when booking cannot be cancelled', async () => {
      // Arrange
      mockBookingsService.cancelBooking.mockRejectedValue(
        new BadRequestException(
          'Only pending or confirmed bookings can be cancelled',
        ),
      );

      // Act & Assert
      await expect(
        controller.cancelBooking(BOOKING_ID, RENTER_ID, { reason: '' } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.cancelBooking(BOOKING_ID, RENTER_ID, { reason: '' } as any),
      ).rejects.toThrow('Only pending or confirmed bookings can be cancelled');
    });
  });

  // ─── GET /upcoming ──────────────────────────────────────────────────────────
  describe('GET /upcoming', () => {
    it('should return upcoming bookings for the current user', async () => {
      // Arrange
      const bookings = [BookingEntity.fromPrisma(createMockBooking())];
      mockBookingsService.getUpcomingBookings.mockResolvedValue(bookings);

      // Act
      const result = await controller.getUpcomingBookings(RENTER_ID);

      // Assert
      expect(result).toHaveLength(1);
      expect(mockBookingsService.getUpcomingBookings).toHaveBeenCalledWith(
        RENTER_ID,
      );
    });
  });

  // ─── GET /vehicle/:vehicleId/schedule ───────────────────────────────────────
  describe('GET /vehicle/:vehicleId/schedule', () => {
    it('should return vehicle booking schedule', async () => {
      // Arrange
      const bookings = [BookingEntity.fromPrisma(createMockBooking())];
      mockBookingsService.getVehicleSchedule.mockResolvedValue(bookings);

      // Act
      const result = await controller.getVehicleSchedule(BOOKED_VEHICLE_ID);

      // Assert
      expect(result).toHaveLength(1);
      expect(mockBookingsService.getVehicleSchedule).toHaveBeenCalledWith(
        BOOKED_VEHICLE_ID,
      );
    });
  });

  describe('POST /lock', () => {
    it('should create a booking lock for the current renter', async () => {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      mockBookingLockService.createLock.mockResolvedValue({
        id: 'lock-1',
        expiresAt,
      });
      const dto = {
        vehicleId: BOOKED_VEHICLE_ID,
        startTime: new Date(Date.now() + 3600000).toISOString(),
        endTime: new Date(Date.now() + 7200000).toISOString(),
      };

      const result = await controller.createBookingLock(RENTER_ID, dto);

      expect(result).toEqual({ id: 'lock-1', expiresAt });
      expect(mockBookingLockService.createLock).toHaveBeenCalledWith(
        BOOKED_VEHICLE_ID,
        RENTER_ID,
        expect.any(Date),
        expect.any(Date),
      );
    });
  });

  describe('DELETE /lock/:id', () => {
    it('should release a booking lock owned by the current renter', async () => {
      mockBookingLockService.releaseLock.mockResolvedValue(undefined);

      await controller.releaseBookingLock('lock-1', RENTER_ID);

      expect(mockBookingLockService.releaseLock).toHaveBeenCalledWith(
        'lock-1',
        RENTER_ID,
      );
    });
  });
});
