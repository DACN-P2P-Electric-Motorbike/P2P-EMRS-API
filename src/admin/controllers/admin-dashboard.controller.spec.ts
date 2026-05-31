/**
 * Unit tests for AdminDashboardController.
 * AdminDashboardService is fully mocked — the handler delegates the query and
 * wraps the result in the standard success envelope.
 */
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from '../services/admin-dashboard.service';

describe('AdminDashboardController', () => {
  let controller: AdminDashboardController;
  let service: jest.Mocked<AdminDashboardService>;

  beforeEach(() => {
    service = {
      getDashboard: jest.fn().mockResolvedValue({ metrics: {} }),
    } as unknown as jest.Mocked<AdminDashboardService>;

    controller = new AdminDashboardController(service);
  });

  it('GET / wraps the dashboard data in a success envelope', async () => {
    const query = { period: 'this_month' } as any;

    await expect(controller.getDashboard(query)).resolves.toEqual({
      status: 'success',
      data: { metrics: {} },
    });
    expect(service.getDashboard).toHaveBeenCalledWith(query);
  });
});
