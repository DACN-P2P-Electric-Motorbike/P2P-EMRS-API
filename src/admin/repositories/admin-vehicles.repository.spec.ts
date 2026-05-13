import { VehicleStatus } from '@prisma/client';
import { AdminVehiclesRepository } from './admin-vehicles.repository';

describe('AdminVehiclesRepository', () => {
  let repository: AdminVehiclesRepository;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      vehicle: {
        findMany: jest.fn().mockResolvedValue([{ id: 'vehicle-1' }]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue({ id: 'vehicle-1' }),
        update: jest.fn().mockResolvedValue({
          id: 'vehicle-1',
          status: VehicleStatus.MAINTENANCE,
        }),
      },
    };
    repository = new AdminVehiclesRepository(prisma);
  });

  it('finds vehicles with status/owner filters and pagination', async () => {
    await expect(
      repository.findMany({
        status: VehicleStatus.AVAILABLE,
        ownerId: 'owner-1',
        page: 2,
        limit: 15,
      }),
    ).resolves.toEqual({ vehicles: [{ id: 'vehicle-1' }], total: 1 });

    const where = {
      status: VehicleStatus.AVAILABLE,
      ownerId: 'owner-1',
    };
    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 15, take: 15 }),
    );
    expect(prisma.vehicle.count).toHaveBeenCalledWith({ where });
  });

  it('finds and updates one vehicle by id', async () => {
    await repository.findById('vehicle-1');
    expect(prisma.vehicle.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'vehicle-1' } }),
    );

    await repository.updateStatus('vehicle-1', VehicleStatus.MAINTENANCE);
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'vehicle-1' },
      data: { status: VehicleStatus.MAINTENANCE },
    });
  });
});
