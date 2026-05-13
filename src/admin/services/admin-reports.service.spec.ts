import { AdminReportsRepository } from '../repositories/admin-reports.repository';
import { AdminReportsService } from './admin-reports.service';

describe('AdminReportsService', () => {
  let service: AdminReportsService;
  let repository: jest.Mocked<AdminReportsRepository>;

  beforeEach(() => {
    repository = {
      getTopVehicles: jest.fn().mockResolvedValue([{ vehicleId: 'vehicle-1' }]),
      getTopOwners: jest.fn().mockResolvedValue([{ ownerId: 'owner-1' }]),
    } as unknown as jest.Mocked<AdminReportsRepository>;

    service = new AdminReportsService(repository);
  });

  it('delegates top vehicle and owner reports with explicit and default limits', async () => {
    await expect(service.getTopVehicles(5)).resolves.toEqual([
      { vehicleId: 'vehicle-1' },
    ]);
    await expect(service.getTopOwners()).resolves.toEqual([
      { ownerId: 'owner-1' },
    ]);

    expect(repository.getTopVehicles).toHaveBeenCalledWith(5);
    expect(repository.getTopOwners).toHaveBeenCalledWith(10);
  });
});
