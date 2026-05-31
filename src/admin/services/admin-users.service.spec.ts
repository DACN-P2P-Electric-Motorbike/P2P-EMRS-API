import { NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersRepository } from '../repositories/admin-users.repository';
import { TrustScoreService } from '../../trust-score/trust-score.service';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let repository: jest.Mocked<AdminUsersRepository>;
  let trustScoreService: jest.Mocked<TrustScoreService>;

  const user = {
    id: 'user-1',
    fullName: 'Renter One',
    email: 'renter@example.com',
    status: UserStatus.ACTIVE,
  };

  beforeEach(() => {
    repository = {
      findMany: jest.fn().mockResolvedValue({ users: [user], total: 21 }),
      findById: jest.fn().mockResolvedValue(user),
      updateStatus: jest.fn().mockResolvedValue({
        ...user,
        status: UserStatus.BLOCKED,
      }),
    } as unknown as jest.Mocked<AdminUsersRepository>;
    trustScoreService = {
      getAdminOverview: jest.fn().mockResolvedValue({ restrictedUsers: 2 }),
      getUserTrustProfile: jest.fn().mockResolvedValue({ userId: 'user-1' }),
      recordManualAdjustment: jest.fn().mockResolvedValue({
        scoreAfter: 95,
      }),
    } as unknown as jest.Mocked<TrustScoreService>;

    service = new AdminUsersService(repository, trustScoreService);
  });

  it('returns paginated users with defaults and explicit query values', async () => {
    await expect(service.getUsers({})).resolves.toEqual({
      data: [user],
      pagination: { total: 21, page: 1, limit: 10, totalPages: 3 },
    });

    await expect(
      service.getUsers({ role: UserRole.OWNER, page: 2, limit: 5 }),
    ).resolves.toEqual({
      data: [user],
      pagination: { total: 21, page: 2, limit: 5, totalPages: 5 },
    });
  });

  it('updates user status after confirming the user exists', async () => {
    await expect(
      service.updateUserStatus('user-1', { status: UserStatus.BLOCKED }),
    ).resolves.toEqual({ ...user, status: UserStatus.BLOCKED });

    expect(repository.updateStatus).toHaveBeenCalledWith(
      'user-1',
      UserStatus.BLOCKED,
    );
  });

  it('throws when updating or reading trust score for a missing user', async () => {
    repository.findById.mockResolvedValueOnce(null);

    await expect(
      service.updateUserStatus('missing', { status: UserStatus.BLOCKED }),
    ).rejects.toBeInstanceOf(NotFoundException);

    repository.findById.mockResolvedValueOnce(null);

    await expect(service.getUserTrustScore('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('delegates trust score overview, profile, and manual adjustments', async () => {
    await expect(service.getTrustScoreOverview()).resolves.toEqual({
      restrictedUsers: 2,
    });
    await expect(service.getUserTrustScore('user-1')).resolves.toEqual({
      userId: 'user-1',
    });
    await expect(
      service.adjustTrustScore(
        'user-1',
        { delta: -5, reason: 'Confirmed report' },
        'admin-1',
      ),
    ).resolves.toEqual({ scoreAfter: 95 });

    expect(trustScoreService.recordManualAdjustment).toHaveBeenCalledWith(
      'user-1',
      -5,
      'Confirmed report',
      'admin-1',
    );
  });

  it('throws when adjusting trust score for a missing user', async () => {
    repository.findById.mockResolvedValueOnce(null);

    await expect(
      service.adjustTrustScore(
        'missing',
        { delta: -5, reason: 'Confirmed report' },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(trustScoreService.recordManualAdjustment).not.toHaveBeenCalled();
  });
});
