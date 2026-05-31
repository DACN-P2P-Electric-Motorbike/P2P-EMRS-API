/**
 * Unit tests for AdminBookingsController.
 * AdminBookingsService is fully mocked — each handler delegates to the service
 * and wraps the result in the standard success envelope.
 */
import { AdminBookingsController } from './admin-bookings.controller';
import { AdminBookingsService } from '../services/admin-bookings.service';

describe('AdminBookingsController', () => {
  let controller: AdminBookingsController;
  let service: jest.Mocked<AdminBookingsService>;

  beforeEach(() => {
    service = {
      getBookings: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      updateBookingStatus: jest
        .fn()
        .mockResolvedValue({ id: 'booking-1', status: 'CANCELLED' }),
    } as unknown as jest.Mocked<AdminBookingsService>;

    controller = new AdminBookingsController(service);
  });

  it('GET / wraps the paginated booking list in a success envelope', async () => {
    const query = { page: 1, limit: 10 } as any;

    await expect(controller.getBookings(query)).resolves.toEqual({
      status: 'success',
      data: { data: [], pagination: {} },
    });
    expect(service.getBookings).toHaveBeenCalledWith(query);
  });

  it('PATCH /:id/status delegates dto then returns a message', async () => {
    const dto = { status: 'CANCELLED' } as any;

    await expect(
      controller.updateBookingStatus('booking-1', dto),
    ).resolves.toEqual({
      status: 'success',
      data: { id: 'booking-1', status: 'CANCELLED' },
      message: 'Booking status updated successfully',
    });
    expect(service.updateBookingStatus).toHaveBeenCalledWith('booking-1', dto);
  });
});
