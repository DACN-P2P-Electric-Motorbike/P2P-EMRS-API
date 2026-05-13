import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

describe('PrivacyController', () => {
  let controller: PrivacyController;
  let service: jest.Mocked<PrivacyService>;

  beforeEach(() => {
    service = {
      exportPersonalData: jest.fn().mockResolvedValue({ user: { id: 'u1' } }),
      requestAccountDeletion: jest.fn().mockResolvedValue({ id: 'request-1' }),
      getMyRequests: jest.fn().mockResolvedValue([{ id: 'request-1' }]),
    } as unknown as jest.Mocked<PrivacyService>;
    controller = new PrivacyController(service);
  });

  it('delegates privacy self-service endpoints to PrivacyService', async () => {
    await expect(controller.exportPersonalData('user-1')).resolves.toEqual({
      user: { id: 'u1' },
    });
    await expect(controller.requestAccountDeletion('user-1')).resolves.toEqual({
      id: 'request-1',
    });
    await expect(controller.getMyRequests('user-1')).resolves.toEqual([
      { id: 'request-1' },
    ]);

    expect(service.exportPersonalData).toHaveBeenCalledWith('user-1');
    expect(service.requestAccountDeletion).toHaveBeenCalledWith('user-1');
    expect(service.getMyRequests).toHaveBeenCalledWith('user-1');
  });
});
