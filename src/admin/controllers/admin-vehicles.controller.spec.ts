/**
 * Unit tests for AdminVehiclesController.
 * AdminVehiclesService is fully mocked — each handler delegates to the service
 * and wraps the result in the standard success envelope.
 */
import { AdminVehiclesController } from './admin-vehicles.controller';
import { AdminVehiclesService } from '../services/admin-vehicles.service';

describe('AdminVehiclesController', () => {
  let controller: AdminVehiclesController;
  let service: jest.Mocked<AdminVehiclesService>;

  beforeEach(() => {
    service = {
      getVehicles: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      updateVehicleStatus: jest
        .fn()
        .mockResolvedValue({ id: 'vehicle-1', status: 'AVAILABLE' }),
    } as unknown as jest.Mocked<AdminVehiclesService>;

    controller = new AdminVehiclesController(service);
  });

  it('GET / wraps the paginated vehicle list in a success envelope', async () => {
    const query = { page: 1, limit: 10 } as any;

    await expect(controller.getVehicles(query)).resolves.toEqual({
      status: 'success',
      data: { data: [], pagination: {} },
    });
    expect(service.getVehicles).toHaveBeenCalledWith(query);
  });

  it('PATCH /:vehicleId/status delegates dto then returns a message', async () => {
    const dto = { status: 'AVAILABLE' } as any;

    await expect(
      controller.updateVehicleStatus('vehicle-1', dto),
    ).resolves.toEqual({
      status: 'success',
      data: { id: 'vehicle-1', status: 'AVAILABLE' },
      message: 'Vehicle status updated successfully',
    });
    expect(service.updateVehicleStatus).toHaveBeenCalledWith('vehicle-1', dto);
  });
});
