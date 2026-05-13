import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from '../services/admin-reports.service';

describe('AdminReportsController', () => {
  let controller: AdminReportsController;
  let service: jest.Mocked<AdminReportsService>;

  beforeEach(() => {
    service = {
      getTopVehicles: jest.fn().mockResolvedValue([{ vehicleId: 'vehicle-1' }]),
      getTopOwners: jest.fn().mockResolvedValue([{ ownerId: 'owner-1' }]),
    } as unknown as jest.Mocked<AdminReportsService>;
    controller = new AdminReportsController(service);
  });

  it('wraps top vehicle and owner reports in a success envelope', async () => {
    await expect(controller.getTopVehicles({ limit: 5 })).resolves.toEqual({
      status: 'success',
      data: [{ vehicleId: 'vehicle-1' }],
    });
    await expect(controller.getTopOwners({})).resolves.toEqual({
      status: 'success',
      data: [{ ownerId: 'owner-1' }],
    });

    expect(service.getTopVehicles).toHaveBeenCalledWith(5);
    expect(service.getTopOwners).toHaveBeenCalledWith(10);
  });
});
