import { UserRole } from '@prisma/client';
import { HandoverController } from './handover.controller';
import { HandoverService } from './handover.service';

describe('HandoverController', () => {
  let controller: HandoverController;
  let service: jest.Mocked<HandoverService>;

  const dto = {
    bookingId: 'booking-uuid',
    photos: [
      {
        photoUrl: 'https://cdn.example.com/handovers/front.jpg',
        photoType: 'front',
      },
    ],
  };

  const handover = {
    id: 'handover-uuid',
    bookingId: 'booking-uuid',
  };

  beforeEach(() => {
    service = {
      createCheckIn: jest.fn().mockResolvedValue(handover),
      createCheckOut: jest.fn().mockResolvedValue(handover),
      getByBooking: jest.fn().mockResolvedValue({ bookingId: 'booking-uuid' }),
      confirm: jest.fn().mockResolvedValue(handover),
    } as unknown as jest.Mocked<HandoverService>;

    controller = new HandoverController(service);
  });

  it('delegates handover commands and queries to the service', async () => {
    await expect(controller.createCheckIn('user-uuid', dto)).resolves.toBe(
      handover,
    );
    await expect(controller.createCheckOut('user-uuid', dto)).resolves.toBe(
      handover,
    );
    await expect(
      controller.getByBooking('booking-uuid', 'user-uuid', [UserRole.RENTER]),
    ).resolves.toEqual({ bookingId: 'booking-uuid' });
    await expect(controller.confirm('handover-uuid', 'user-uuid')).resolves.toBe(
      handover,
    );

    expect(service.createCheckIn).toHaveBeenCalledWith('user-uuid', dto);
    expect(service.createCheckOut).toHaveBeenCalledWith('user-uuid', dto);
    expect(service.getByBooking).toHaveBeenCalledWith('booking-uuid', 'user-uuid', [
      UserRole.RENTER,
    ]);
    expect(service.confirm).toHaveBeenCalledWith('handover-uuid', 'user-uuid');
  });
});
