import { NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { AdminBookingsService } from './admin-bookings.service';
import { AdminBookingsRepository } from '../repositories/admin-bookings.repository';

describe('AdminBookingsService', () => {
  let service: AdminBookingsService;
  let repository: jest.Mocked<AdminBookingsRepository>;

  beforeEach(() => {
    repository = {
      findMany: jest.fn().mockResolvedValue({
        bookings: [{ id: 'booking-1' }],
        total: 11,
      }),
      findById: jest.fn().mockResolvedValue({
        id: 'booking-1',
        status: BookingStatus.PENDING,
      }),
      updateStatus: jest.fn().mockResolvedValue({
        id: 'booking-1',
        status: BookingStatus.CONFIRMED,
      }),
    } as unknown as jest.Mocked<AdminBookingsRepository>;

    service = new AdminBookingsService(repository);
  });

  it('returns paginated bookings with defaults', async () => {
    await expect(service.getBookings({})).resolves.toEqual({
      data: [{ id: 'booking-1' }],
      pagination: { total: 11, page: 1, limit: 10, totalPages: 2 },
    });
  });

  it('updates booking status after confirming the booking exists', async () => {
    await expect(
      service.updateBookingStatus('booking-1', {
        status: BookingStatus.CONFIRMED,
      }),
    ).resolves.toEqual({ id: 'booking-1', status: BookingStatus.CONFIRMED });

    expect(repository.updateStatus).toHaveBeenCalledWith(
      'booking-1',
      BookingStatus.CONFIRMED,
    );
  });

  it('throws when the booking does not exist', async () => {
    repository.findById.mockResolvedValueOnce(null);

    await expect(
      service.updateBookingStatus('missing', {
        status: BookingStatus.CANCELLED,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
