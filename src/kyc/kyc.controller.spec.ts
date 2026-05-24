import { KycStatus } from '@prisma/client';
import { AdminKycController } from './admin-kyc.controller';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

describe('KYC controllers', () => {
  let service: jest.Mocked<KycService>;
  let controller: KycController;
  let adminController: AdminKycController;

  const verification = {
    id: 'kyc-1',
    userId: 'user-1',
    selfieUrl: 'https://cdn.example.com/kyc/selfie.jpg',
    idCardFrontUrl: 'https://cdn.example.com/kyc/front.jpg',
    idCardBackUrl: 'https://cdn.example.com/kyc/back.jpg',
    status: KycStatus.PENDING,
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-05-21T00:00:00.000Z'),
    updatedAt: new Date('2026-05-21T00:00:00.000Z'),
  };

  beforeEach(() => {
    service = {
      submit: jest.fn().mockResolvedValue(verification),
      getStatus: jest.fn().mockResolvedValue({
        status: KycStatus.PENDING,
        verification,
      }),
      listForAdmin: jest.fn().mockResolvedValue({
        data: [verification],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
      }),
      review: jest.fn().mockResolvedValue({
        ...verification,
        status: KycStatus.APPROVED,
      }),
    } as unknown as jest.Mocked<KycService>;

    controller = new KycController(service);
    adminController = new AdminKycController(service);
  });

  it('delegates submit and status requests for the current user', async () => {
    await expect(controller.submit('user-1', verification)).resolves.toBe(
      verification,
    );
    await expect(controller.getStatus('user-1')).resolves.toEqual({
      status: KycStatus.PENDING,
      verification,
    });

    expect(service.submit).toHaveBeenCalledWith('user-1', verification);
    expect(service.getStatus).toHaveBeenCalledWith('user-1');
  });

  it('wraps admin list and review responses in success envelopes', async () => {
    await expect(adminController.list({})).resolves.toEqual({
      status: 'success',
      data: {
        data: [verification],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });

    await expect(
      adminController.review(
        'kyc-1',
        { status: KycStatus.APPROVED },
        'admin-1',
      ),
    ).resolves.toMatchObject({
      status: 'success',
      data: { status: KycStatus.APPROVED },
      message: 'KYC reviewed successfully',
    });

    expect(service.review).toHaveBeenCalledWith(
      'kyc-1',
      { status: KycStatus.APPROVED },
      'admin-1',
    );
  });
});
