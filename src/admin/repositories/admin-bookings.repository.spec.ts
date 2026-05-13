import { BookingStatus } from '@prisma/client';
import { AdminBookingsRepository } from './admin-bookings.repository';

describe('AdminBookingsRepository', () => {
  let repository: AdminBookingsRepository;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      booking: {
        findMany: jest.fn().mockResolvedValue([{ id: 'booking-1' }]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue({ id: 'booking-1' }),
        update: jest.fn().mockResolvedValue({
          id: 'booking-1',
          status: BookingStatus.CANCELLED,
        }),
      },
    };
    repository = new AdminBookingsRepository(prisma);
  });

  it('finds bookings with all supported filters', async () => {
    await expect(
      repository.findMany({
        status: BookingStatus.CONFIRMED,
        userId: 'user-1',
        vehicleId: 'vehicle-1',
        startDate: '2026-05-01',
        endDate: '2026-05-10',
        page: 2,
        limit: 25,
      }),
    ).resolves.toEqual({ bookings: [{ id: 'booking-1' }], total: 1 });

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: BookingStatus.CONFIRMED,
          vehicleId: 'vehicle-1',
          OR: [{ renterId: 'user-1' }, { ownerId: 'user-1' }],
          createdAt: {
            gte: new Date('2026-05-01'),
            lte: new Date(new Date('2026-05-10').setHours(23, 59, 59, 999)),
          },
        }),
        skip: 25,
        take: 25,
      }),
    );
  });

  it('uses default pagination and supports one-sided date filters', async () => {
    await repository.findMany({ startDate: '2026-05-01' });
    expect(prisma.booking.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { createdAt: { gte: new Date('2026-05-01') } },
        skip: 0,
        take: 10,
      }),
    );

    await repository.findMany({ endDate: '2026-05-10' });
    expect(prisma.booking.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          createdAt: {
            lte: new Date(new Date('2026-05-10').setHours(23, 59, 59, 999)),
          },
        },
      }),
    );
  });

  it('finds and updates one booking by id', async () => {
    await repository.findById('booking-1');
    expect(prisma.booking.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'booking-1' } }),
    );

    await repository.updateStatus('booking-1', BookingStatus.CANCELLED);
    expect(prisma.booking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { status: BookingStatus.CANCELLED },
    });
  });
});
