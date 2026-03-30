/**
 * Unit tests for OwnerBookingsController — JWT user id delegation to service.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus } from '@prisma/client';

import { OwnerBookingsController } from './owner-bookings.controller';
import { OwnerBookingsService } from './owner-bookings.service';
import { BookingEntity } from './entities/booking.entity';
import {
  createMockBooking,
  BOOKING_OWNER_ID,
  BOOKING_ID,
} from '../../test/factories/booking.factory';

const mockOwnerBookingsService = {
  getOwnerBookings: jest.fn(),
  getPendingBookings: jest.fn(),
  getOwnerBookingById: jest.fn(),
  approveBooking: jest.fn(),
  rejectBooking: jest.fn(),
};

describe('OwnerBookingsController', () => {
  let controller: OwnerBookingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OwnerBookingsController],
      providers: [
        { provide: OwnerBookingsService, useValue: mockOwnerBookingsService },
      ],
    }).compile();

    controller = module.get(OwnerBookingsController);
    jest.clearAllMocks();
  });

  it('GET / delegates getOwnerBookings with optional status', async () => {
    const entity = BookingEntity.fromPrisma(createMockBooking());
    mockOwnerBookingsService.getOwnerBookings.mockResolvedValue([entity]);

    const out = await controller.getOwnerBookings(
      BOOKING_OWNER_ID,
      BookingStatus.PENDING,
    );

    expect(out).toEqual([entity]);
    expect(mockOwnerBookingsService.getOwnerBookings).toHaveBeenCalledWith(
      BOOKING_OWNER_ID,
      BookingStatus.PENDING,
    );
  });

  it('GET /pending delegates getPendingBookings', async () => {
    mockOwnerBookingsService.getPendingBookings.mockResolvedValue([]);

    await controller.getPendingBookings(BOOKING_OWNER_ID);

    expect(mockOwnerBookingsService.getPendingBookings).toHaveBeenCalledWith(
      BOOKING_OWNER_ID,
    );
  });

  it('GET /:id delegates getOwnerBookingById', async () => {
    const entity = BookingEntity.fromPrisma(createMockBooking());
    mockOwnerBookingsService.getOwnerBookingById.mockResolvedValue(entity);

    const out = await controller.getBooking(BOOKING_ID, BOOKING_OWNER_ID);

    expect(out).toBe(entity);
    expect(mockOwnerBookingsService.getOwnerBookingById).toHaveBeenCalledWith(
      BOOKING_ID,
      BOOKING_OWNER_ID,
    );
  });

  it('PATCH /:id/approve delegates approveBooking', async () => {
    const entity = BookingEntity.fromPrisma(createMockBooking());
    mockOwnerBookingsService.approveBooking.mockResolvedValue(entity);
    const dto = { message: 'ok' };

    const out = await controller.approveBooking(
      BOOKING_ID,
      BOOKING_OWNER_ID,
      dto,
    );

    expect(out).toBe(entity);
    expect(mockOwnerBookingsService.approveBooking).toHaveBeenCalledWith(
      BOOKING_ID,
      BOOKING_OWNER_ID,
      dto,
    );
  });

  it('PATCH /:id/reject delegates rejectBooking', async () => {
    const entity = BookingEntity.fromPrisma(
      createMockBooking({ status: BookingStatus.REJECTED }),
    );
    mockOwnerBookingsService.rejectBooking.mockResolvedValue(entity);
    const dto = { reason: 'busy' };

    const out = await controller.rejectBooking(
      BOOKING_ID,
      BOOKING_OWNER_ID,
      dto,
    );

    expect(out).toBe(entity);
    expect(mockOwnerBookingsService.rejectBooking).toHaveBeenCalledWith(
      BOOKING_ID,
      BOOKING_OWNER_ID,
      dto,
    );
  });
});
