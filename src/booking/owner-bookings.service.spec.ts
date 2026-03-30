/**
 * Unit tests for OwnerBookingsService — owner approve/reject/list flows.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingStatus } from '@prisma/client';

import { OwnerBookingsService } from './owner-bookings.service';
import { PrismaService } from '../database/prisma.service';
import {
  createMockBooking,
  RENTER_ID,
  BOOKING_OWNER_ID,
  BOOKED_VEHICLE_ID,
  BOOKING_ID,
  THIRD_PARTY_ID,
} from '../../test/factories/booking.factory';

describe('OwnerBookingsService', () => {
  let service: OwnerBookingsService;

  const mockBookingDelegate = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  };
  const mockUserDelegate = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const mockEventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerBookingsService,
        {
          provide: PrismaService,
          useValue: {
            booking: mockBookingDelegate,
            user: mockUserDelegate,
          },
        },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get(OwnerBookingsService);
    jest.clearAllMocks();
  });

  const bookingWithRelations = (b: ReturnType<typeof createMockBooking>) => ({
    ...b,
    vehicle: { id: BOOKED_VEHICLE_ID },
    renter: {
      id: RENTER_ID,
      fullName: 'Renter',
      phone: '0900000000',
      avatarUrl: null,
      trustScore: 80,
    },
  });

  describe('getOwnerBookings', () => {
    it('returns mapped bookings for owner without status filter', async () => {
      const row = bookingWithRelations(createMockBooking());
      mockBookingDelegate.findMany.mockResolvedValue([row]);

      const result = await service.getOwnerBookings(BOOKING_OWNER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(BOOKING_ID);
      expect(mockBookingDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: BOOKING_OWNER_ID },
        }),
      );
    });

    it('adds status to where when filter provided', async () => {
      mockBookingDelegate.findMany.mockResolvedValue([]);

      await service.getOwnerBookings(BOOKING_OWNER_ID, BookingStatus.CONFIRMED);

      expect(mockBookingDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: BOOKING_OWNER_ID, status: BookingStatus.CONFIRMED },
        }),
      );
    });
  });

  describe('getPendingBookings', () => {
    it('returns pending bookings ordered asc', async () => {
      const row = bookingWithRelations(createMockBooking());
      mockBookingDelegate.findMany.mockResolvedValue([row]);

      const result = await service.getPendingBookings(BOOKING_OWNER_ID);

      expect(result).toHaveLength(1);
      expect(mockBookingDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: BOOKING_OWNER_ID, status: BookingStatus.PENDING },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });
  });

  describe('getOwnerBookingById', () => {
    it('returns booking when owner matches', async () => {
      const row = bookingWithRelations(createMockBooking());
      mockBookingDelegate.findUnique.mockResolvedValue(row);

      const result = await service.getOwnerBookingById(
        BOOKING_ID,
        BOOKING_OWNER_ID,
      );

      expect(result.ownerId).toBe(BOOKING_OWNER_ID);
    });

    it('throws NotFound when booking missing', async () => {
      mockBookingDelegate.findUnique.mockResolvedValue(null);

      await expect(
        service.getOwnerBookingById(BOOKING_ID, BOOKING_OWNER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when caller is not owner', async () => {
      const row = bookingWithRelations(createMockBooking());
      mockBookingDelegate.findUnique.mockResolvedValue(row);

      await expect(
        service.getOwnerBookingById(BOOKING_ID, THIRD_PARTY_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('approveBooking', () => {
    const pending = createMockBooking({
      status: BookingStatus.PENDING,
      ownerId: BOOKING_OWNER_ID,
    });

    it('approves when no conflicts and emits event', async () => {
      const withVehicle = { ...pending, vehicle: { id: BOOKED_VEHICLE_ID } };
      const confirmed = createMockBooking({
        status: BookingStatus.CONFIRMED,
        ownerId: BOOKING_OWNER_ID,
      });

      mockBookingDelegate.findUnique.mockResolvedValue(withVehicle);
      mockBookingDelegate.findMany.mockResolvedValue([]);
      mockBookingDelegate.update.mockResolvedValue({
        ...confirmed,
        vehicle: {},
        renter: { id: RENTER_ID, fullName: 'R', avatarUrl: null },
      });

      const result = await service.approveBooking(
        BOOKING_ID,
        BOOKING_OWNER_ID,
        {},
      );

      expect(result.status).toBe(BookingStatus.CONFIRMED);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.approved',
        expect.any(Object),
      );
    });

    it('throws NotFound when booking missing', async () => {
      mockBookingDelegate.findUnique.mockResolvedValue(null);

      await expect(
        service.approveBooking(BOOKING_ID, BOOKING_OWNER_ID, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest when caller is not owner', async () => {
      mockBookingDelegate.findUnique.mockResolvedValue({
        ...pending,
        vehicle: { id: BOOKED_VEHICLE_ID },
      });

      await expect(
        service.approveBooking(BOOKING_ID, THIRD_PARTY_ID, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when status is not PENDING', async () => {
      mockBookingDelegate.findUnique.mockResolvedValue({
        ...createMockBooking({ status: BookingStatus.CONFIRMED }),
        vehicle: { id: BOOKED_VEHICLE_ID },
      });

      await expect(
        service.approveBooking(BOOKING_ID, BOOKING_OWNER_ID, {}),
      ).rejects.toThrow('Only pending bookings can be approved');
    });

    it('throws BadRequest when conflicting booking exists', async () => {
      mockBookingDelegate.findUnique.mockResolvedValue({
        ...pending,
        vehicle: { id: BOOKED_VEHICLE_ID },
      });
      mockBookingDelegate.findMany.mockResolvedValue([{ id: 'other' }]);

      await expect(
        service.approveBooking(BOOKING_ID, BOOKING_OWNER_ID, {}),
      ).rejects.toThrow('Vehicle is no longer available for this time slot');
    });
  });

  describe('rejectBooking', () => {
    const pending = createMockBooking({
      status: BookingStatus.PENDING,
      ownerId: BOOKING_OWNER_ID,
    });
    const dto = { reason: 'No longer available' };

    it('rejects, adjusts trust, emits event', async () => {
      const rejected = createMockBooking({
        status: BookingStatus.REJECTED,
        cancellationReason: dto.reason,
      });
      mockBookingDelegate.findUnique.mockResolvedValue(pending);
      mockBookingDelegate.update.mockResolvedValue(rejected);
      mockUserDelegate.findUnique.mockResolvedValue({
        id: BOOKING_OWNER_ID,
        trustScore: 50,
      });
      mockUserDelegate.update.mockResolvedValue({});

      const result = await service.rejectBooking(
        BOOKING_ID,
        BOOKING_OWNER_ID,
        dto,
      );

      expect(result.status).toBe(BookingStatus.REJECTED);
      expect(mockUserDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BOOKING_OWNER_ID },
          data: { trustScore: 48 },
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.rejected',
        expect.any(Object),
      );
    });

    it('skips trust update when owner user row missing', async () => {
      const rejected = createMockBooking({ status: BookingStatus.REJECTED });
      mockBookingDelegate.findUnique.mockResolvedValue(pending);
      mockBookingDelegate.update.mockResolvedValue(rejected);
      mockUserDelegate.findUnique.mockResolvedValue(null);

      await service.rejectBooking(BOOKING_ID, BOOKING_OWNER_ID, dto);

      expect(mockUserDelegate.update).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalled();
    });

    it('clamps trust score to 0', async () => {
      const rejected = createMockBooking({ status: BookingStatus.REJECTED });
      mockBookingDelegate.findUnique.mockResolvedValue(pending);
      mockBookingDelegate.update.mockResolvedValue(rejected);
      mockUserDelegate.findUnique.mockResolvedValue({
        id: BOOKING_OWNER_ID,
        trustScore: 1,
      });
      mockUserDelegate.update.mockResolvedValue({});

      await service.rejectBooking(BOOKING_ID, BOOKING_OWNER_ID, dto);

      expect(mockUserDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { trustScore: 0 },
        }),
      );
    });

    it('throws NotFound when booking missing', async () => {
      mockBookingDelegate.findUnique.mockResolvedValue(null);

      await expect(
        service.rejectBooking(BOOKING_ID, BOOKING_OWNER_ID, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest when not owner', async () => {
      mockBookingDelegate.findUnique.mockResolvedValue(pending);

      await expect(
        service.rejectBooking(BOOKING_ID, THIRD_PARTY_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when not pending', async () => {
      mockBookingDelegate.findUnique.mockResolvedValue(
        createMockBooking({ status: BookingStatus.CONFIRMED }),
      );

      await expect(
        service.rejectBooking(BOOKING_ID, BOOKING_OWNER_ID, dto),
      ).rejects.toThrow('Only pending bookings can be rejected');
    });
  });
});
