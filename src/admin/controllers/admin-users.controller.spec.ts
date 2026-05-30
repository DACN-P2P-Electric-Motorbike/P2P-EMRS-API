/**
 * Unit tests for AdminUsersController.
 * AdminUsersService is fully mocked — each handler delegates to the service and
 * wraps the result in the standard success envelope.
 */
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from '../services/admin-users.service';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let service: jest.Mocked<AdminUsersService>;

  beforeEach(() => {
    service = {
      getUsers: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      getTrustScoreOverview: jest
        .fn()
        .mockResolvedValue({ distribution: [] }),
      getUserTrustScore: jest.fn().mockResolvedValue({ score: 80 }),
      adjustTrustScore: jest.fn().mockResolvedValue({ score: 85 }),
      updateUserStatus: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', status: 'BLOCKED' }),
    } as unknown as jest.Mocked<AdminUsersService>;

    controller = new AdminUsersController(service);
  });

  it('GET / wraps the paginated user list in a success envelope', async () => {
    const query = { page: 1, limit: 10 } as any;

    await expect(controller.getUsers(query)).resolves.toEqual({
      status: 'success',
      data: { data: [], pagination: {} },
    });
    expect(service.getUsers).toHaveBeenCalledWith(query);
  });

  it('GET /trust-score/overview wraps the overview in a success envelope', async () => {
    await expect(controller.getTrustScoreOverview()).resolves.toEqual({
      status: 'success',
      data: { distribution: [] },
    });
    expect(service.getTrustScoreOverview).toHaveBeenCalledTimes(1);
  });

  it('GET /:id/trust-score wraps the user trust score detail', async () => {
    await expect(controller.getUserTrustScore('user-1')).resolves.toEqual({
      status: 'success',
      data: { score: 80 },
    });
    expect(service.getUserTrustScore).toHaveBeenCalledWith('user-1');
  });

  it('PATCH /:id/trust-score delegates dto and admin id then returns a message', async () => {
    const dto = { delta: 5, reason: 'manual review' } as any;

    await expect(
      controller.adjustTrustScore('user-1', dto, 'admin-1'),
    ).resolves.toEqual({
      status: 'success',
      data: { score: 85 },
      message: 'Trust score adjusted successfully',
    });
    expect(service.adjustTrustScore).toHaveBeenCalledWith(
      'user-1',
      dto,
      'admin-1',
    );
  });

  it('PATCH /:id/status delegates dto then returns a message', async () => {
    const dto = { status: 'BLOCKED' } as any;

    await expect(controller.updateUserStatus('user-1', dto)).resolves.toEqual({
      status: 'success',
      data: { id: 'user-1', status: 'BLOCKED' },
      message: 'User status updated successfully',
    });
    expect(service.updateUserStatus).toHaveBeenCalledWith('user-1', dto);
  });
});
