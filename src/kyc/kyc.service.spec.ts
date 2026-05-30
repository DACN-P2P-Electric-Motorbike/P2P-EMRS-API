import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus, TrustScoreEventType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TrustScoreService } from '../trust-score/trust-score.service';
import { KycService } from './kyc.service';

describe('KycService', () => {
  let service: KycService;

  const prisma = {
    kycVerification: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as jest.Mocked<PrismaService>;

  const trustScoreService = {
    recordPositiveEvent: jest.fn().mockResolvedValue({ trustScore: 105 }),
  } as unknown as jest.Mocked<TrustScoreService>;

  const dto = {
    selfieUrl: 'https://cdn.example.com/kyc/selfie.jpg',
    idCardFrontUrl: 'https://cdn.example.com/kyc/front.jpg',
    idCardBackUrl: 'https://cdn.example.com/kyc/back.jpg',
  };

  const verification = {
    id: 'kyc-1',
    userId: 'user-1',
    ...dto,
    status: KycStatus.PENDING,
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-05-21T00:00:00.000Z'),
    updatedAt: new Date('2026-05-21T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KycService(prisma, trustScoreService);
  });

  it('creates a pending KYC submission for a new user', async () => {
    prisma.kycVerification.findUnique.mockResolvedValue(null);
    prisma.kycVerification.upsert.mockResolvedValue(verification);

    await expect(service.submit('user-1', dto)).resolves.toMatchObject({
      id: 'kyc-1',
      status: KycStatus.PENDING,
    });

    expect(prisma.kycVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({ userId: 'user-1' }),
        update: expect.objectContaining({
          status: KycStatus.PENDING,
          rejectionReason: null,
        }),
      }),
    );
  });

  it('blocks resubmission once KYC is approved', async () => {
    prisma.kycVerification.findUnique.mockResolvedValue({
      ...verification,
      status: KycStatus.APPROVED,
    });

    await expect(service.submit('user-1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns a synthetic status when the user has not submitted KYC', async () => {
    prisma.kycVerification.findUnique.mockResolvedValue(null);

    await expect(service.getStatus('user-1')).resolves.toEqual({
      status: 'NOT_SUBMITTED',
      verification: null,
    });
  });

  it('returns the stored verification status when KYC exists', async () => {
    prisma.kycVerification.findUnique.mockResolvedValue(verification);

    await expect(service.getStatus('user-1')).resolves.toMatchObject({
      status: KycStatus.PENDING,
      verification: { id: 'kyc-1', status: KycStatus.PENDING },
    });
  });

  it('rejects admin reviews that try to set the status back to PENDING', async () => {
    await expect(
      service.review('kyc-1', { status: KycStatus.PENDING }, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.kycVerification.findUnique).not.toHaveBeenCalled();
    expect(prisma.kycVerification.update).not.toHaveBeenCalled();
  });

  it('rejects KYC with a stored reason and skips trust score updates', async () => {
    prisma.kycVerification.findUnique.mockResolvedValue(verification);
    prisma.kycVerification.update.mockResolvedValue({
      ...verification,
      status: KycStatus.REJECTED,
      rejectionReason: 'Blurry ID',
      reviewedBy: 'admin-1',
    });

    await expect(
      service.review(
        'kyc-1',
        { status: KycStatus.REJECTED, rejectionReason: '  Blurry ID  ' },
        'admin-1',
      ),
    ).resolves.toMatchObject({ status: KycStatus.REJECTED });

    expect(prisma.kycVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: KycStatus.REJECTED,
          rejectionReason: 'Blurry ID',
        }),
      }),
    );
    expect(trustScoreService.recordPositiveEvent).not.toHaveBeenCalled();
  });

  it('does not re-award trust score when re-approving an already approved KYC', async () => {
    prisma.kycVerification.findUnique.mockResolvedValue({
      ...verification,
      status: KycStatus.APPROVED,
    });
    prisma.kycVerification.update.mockResolvedValue({
      ...verification,
      status: KycStatus.APPROVED,
      reviewedBy: 'admin-1',
    });

    await service.review('kyc-1', { status: KycStatus.APPROVED }, 'admin-1');

    expect(trustScoreService.recordPositiveEvent).not.toHaveBeenCalled();
  });

  it('lists submissions for admin review with pagination', async () => {
    prisma.kycVerification.findMany.mockResolvedValue([
      {
        ...verification,
        user: {
          id: 'user-1',
          fullName: 'Renter One',
          email: 'renter@example.com',
          phone: '0901234567',
          trustScore: 100,
        },
      },
    ]);
    prisma.kycVerification.count.mockResolvedValue(1);

    await expect(
      service.listForAdmin({ status: KycStatus.PENDING, page: 2, limit: 5 }),
    ).resolves.toMatchObject({
      data: [{ id: 'kyc-1', user: { fullName: 'Renter One' } }],
      pagination: { total: 1, page: 2, limit: 5, totalPages: 1 },
    });

    expect(prisma.kycVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: KycStatus.PENDING },
        skip: 5,
        take: 5,
      }),
    );
  });

  it('applies default pagination and no status filter for admin listing', async () => {
    prisma.kycVerification.findMany.mockResolvedValue([]);
    prisma.kycVerification.count.mockResolvedValue(0);

    await expect(service.listForAdmin({})).resolves.toMatchObject({
      data: [],
      pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
    });

    expect(prisma.kycVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 20 }),
    );
    expect(prisma.kycVerification.count).toHaveBeenCalledWith({ where: {} });
  });

  it('approves KYC and records a one-time positive trust event', async () => {
    prisma.kycVerification.findUnique.mockResolvedValue(verification);
    prisma.kycVerification.update.mockResolvedValue({
      ...verification,
      status: KycStatus.APPROVED,
      reviewedBy: 'admin-1',
      reviewedAt: new Date('2026-05-21T01:00:00.000Z'),
      user: {
        id: 'user-1',
        fullName: 'Renter One',
        email: 'renter@example.com',
        phone: '0901234567',
        trustScore: 100,
      },
    });

    await expect(
      service.review(
        'kyc-1',
        { status: KycStatus.APPROVED },
        'admin-1',
      ),
    ).resolves.toMatchObject({ status: KycStatus.APPROVED });

    expect(trustScoreService.recordPositiveEvent).toHaveBeenCalledWith(
      'user-1',
      TrustScoreEventType.KYC_VERIFIED,
      5,
      'KYC verification approved',
      { verificationId: 'kyc-1', adminId: 'admin-1' },
    );
  });

  it('requires a reason when rejecting KYC and handles missing records', async () => {
    await expect(
      service.review(
        'kyc-1',
        { status: KycStatus.REJECTED },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.kycVerification.findUnique.mockResolvedValue(null);
    await expect(
      service.review(
        'missing',
        { status: KycStatus.REJECTED, rejectionReason: 'Blurry ID' },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('asserts KYC approval before gated actions', async () => {
    prisma.kycVerification.findFirst.mockResolvedValue({ id: 'kyc-1' } as any);

    await expect(service.assertApproved('user-1', 'booking')).resolves.toBe(
      undefined,
    );

    prisma.kycVerification.findFirst.mockResolvedValue(null);

    await expect(
      service.assertApproved('user-1', 'vehicle'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses the booking action label when blocking an unverified booking', async () => {
    prisma.kycVerification.findFirst.mockResolvedValue(null);

    await expect(
      service.assertApproved('user-1', 'booking'),
    ).rejects.toThrow('create a booking');
  });
});
