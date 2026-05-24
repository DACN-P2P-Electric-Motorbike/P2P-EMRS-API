import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BatteryType, VehicleCondition, VehicleStatus } from '@prisma/client';
import { AdminVehiclesService } from './admin-vehicles.service';
import { AdminVehiclesRepository } from '../repositories/admin-vehicles.repository';

describe('AdminVehiclesService', () => {
  let service: AdminVehiclesService;
  let repository: jest.Mocked<AdminVehiclesRepository>;

  const vehicle = {
    id: 'vehicle-1',
    name: 'Klara',
    brand: 'VinFast',
    model: 'Klara S',
    year: 2025,
    licensePlate: '59-A1',
    images: ['image.jpg'],
    firstRegistrationYear: 2024,
    condition: VehicleCondition.GOOD,
    batteryType: BatteryType.REMOVABLE,
    batteryHealth: 92,
    batteryCycleCount: 180,
    batteryLastServicedAt: new Date('2026-05-01T00:00:00.000Z'),
    status: VehicleStatus.PENDING_APPROVAL,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    owner: {
      id: 'owner-1',
      fullName: 'Owner One',
      email: 'owner@example.com',
    },
  };

  beforeEach(() => {
    repository = {
      findMany: jest.fn().mockResolvedValue({ vehicles: [vehicle], total: 1 }),
      findById: jest.fn().mockResolvedValue(vehicle),
      updateStatus: jest.fn().mockResolvedValue({
        ...vehicle,
        status: VehicleStatus.AVAILABLE,
      }),
    } as unknown as jest.Mocked<AdminVehiclesRepository>;

    service = new AdminVehiclesService(repository);
  });

  it('maps vehicle records into the admin response shape', async () => {
    await expect(service.getVehicles({ page: 2, limit: 5 })).resolves.toEqual({
      data: [
        {
          id: 'vehicle-1',
          owner: {
            id: 'owner-1',
            full_name: 'Owner One',
            email: 'owner@example.com',
          },
          created_at: new Date('2026-05-01T00:00:00.000Z'),
          vehicle_info: {
            name: 'Klara',
            brand: 'VinFast',
            model: 'Klara S',
            year: 2025,
            plate_number: '59-A1',
            images: ['image.jpg'],
            first_registration_year: 2024,
            condition: VehicleCondition.GOOD,
            battery_type: BatteryType.REMOVABLE,
            battery_health: 92,
            battery_cycle_count: 180,
            battery_last_serviced_at: new Date('2026-05-01T00:00:00.000Z'),
          },
          status: VehicleStatus.PENDING_APPROVAL,
        },
      ],
      pagination: { total: 1, page: 2, limit: 5, totalPages: 1 },
    });
  });

  it('allows valid admin status transitions', async () => {
    await expect(
      service.updateVehicleStatus('vehicle-1', {
        status: VehicleStatus.AVAILABLE,
      }),
    ).resolves.toEqual({ ...vehicle, status: VehicleStatus.AVAILABLE });

    expect(repository.updateStatus).toHaveBeenCalledWith(
      'vehicle-1',
      VehicleStatus.AVAILABLE,
    );
  });

  it('rejects missing vehicles and invalid transitions', async () => {
    repository.findById.mockResolvedValueOnce(null);
    await expect(
      service.updateVehicleStatus('missing', {
        status: VehicleStatus.AVAILABLE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    repository.findById.mockResolvedValueOnce({
      ...vehicle,
      status: VehicleStatus.RENTED,
    } as any);
    await expect(
      service.updateVehicleStatus('vehicle-1', {
        status: VehicleStatus.AVAILABLE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
