import { BookingStatus, PaymentStatus } from '@prisma/client';
import { AdminReportsRepository } from './admin-reports.repository';

describe('AdminReportsRepository', () => {
  let repository: AdminReportsRepository;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      booking: {
        groupBy: jest.fn().mockResolvedValue([
          { vehicleId: 'vehicle-1', _count: { vehicleId: 4 } },
          { vehicleId: 'vehicle-missing', _count: { vehicleId: 2 } },
        ]),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'vehicle-1',
            name: 'Klara',
            model: 'Klara S',
            brand: 'VinFast',
            licensePlate: '59-A1',
            owner: { id: 'owner-1', fullName: 'Owner One' },
          },
        ]),
      },
      payment: {
        groupBy: jest.fn().mockResolvedValue([
          { receiverId: 'owner-1', _sum: { ownerAmount: 200 } },
          { receiverId: 'owner-missing', _sum: { ownerAmount: null } },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'owner-1',
            fullName: 'Owner One',
            email: 'owner@example.com',
            phone: '0900000000',
            avatarUrl: null,
            _count: { vehicles: 3 },
          },
        ]),
      },
    };
    repository = new AdminReportsRepository(prisma);
  });

  it('returns top vehicles with booking counts and nullable missing vehicle details', async () => {
    await expect(repository.getTopVehicles(2)).resolves.toEqual([
      {
        vehicleId: 'vehicle-1',
        totalBookings: 4,
        vehicle: {
          id: 'vehicle-1',
          name: 'Klara',
          model: 'Klara S',
          brand: 'VinFast',
          licensePlate: '59-A1',
          owner: { id: 'owner-1', fullName: 'Owner One' },
        },
      },
      {
        vehicleId: 'vehicle-missing',
        totalBookings: 2,
        vehicle: null,
      },
    ]);

    expect(prisma.booking.groupBy).toHaveBeenCalledWith({
      by: ['vehicleId'],
      where: { status: BookingStatus.COMPLETED },
      _count: { vehicleId: true },
      orderBy: { _count: { vehicleId: 'desc' } },
      take: 2,
    });
  });

  it('short-circuits top vehicles and owners when no groups exist', async () => {
    prisma.booking.groupBy.mockResolvedValueOnce([]);
    await expect(repository.getTopVehicles()).resolves.toEqual([]);
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled();

    prisma.payment.groupBy.mockResolvedValueOnce([]);
    await expect(repository.getTopOwners()).resolves.toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('returns top owners with revenue and nullable missing owner details', async () => {
    await expect(repository.getTopOwners(3)).resolves.toEqual([
      {
        ownerId: 'owner-1',
        totalRevenue: 200,
        owner: {
          id: 'owner-1',
          fullName: 'Owner One',
          email: 'owner@example.com',
          phone: '0900000000',
          avatarUrl: null,
          totalVehicles: 3,
        },
      },
      {
        ownerId: 'owner-missing',
        totalRevenue: 0,
        owner: null,
      },
    ]);

    expect(prisma.payment.groupBy).toHaveBeenCalledWith({
      by: ['receiverId'],
      where: { status: PaymentStatus.COMPLETED },
      _sum: { ownerAmount: true },
      orderBy: { _sum: { ownerAmount: 'desc' } },
      take: 3,
    });
  });
});
