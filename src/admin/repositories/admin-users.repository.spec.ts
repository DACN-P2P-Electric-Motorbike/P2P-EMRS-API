import { UserRole, UserStatus } from '@prisma/client';
import { AdminUsersRepository } from './admin-users.repository';

describe('AdminUsersRepository', () => {
  let repository: AdminUsersRepository;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
        update: jest.fn().mockResolvedValue({
          id: 'user-1',
          status: UserStatus.BLOCKED,
        }),
      },
    };
    repository = new AdminUsersRepository(prisma);
  });

  it('finds users with role/status filters and pagination', async () => {
    await expect(
      repository.findMany({
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
        page: 3,
        limit: 20,
      }),
    ).resolves.toEqual({ users: [{ id: 'user-1' }], total: 1 });

    const where = {
      roles: { has: UserRole.OWNER },
      status: UserStatus.ACTIVE,
    };
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 40, take: 20 }),
    );
    expect(prisma.user.count).toHaveBeenCalledWith({ where });
  });

  it('uses default pagination and selected fields for findById/updateStatus', async () => {
    await repository.findMany({});
    expect(prisma.user.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );

    await expect(repository.findById('user-1')).resolves.toEqual({
      id: 'user-1',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } }),
    );

    await expect(
      repository.updateStatus('user-1', UserStatus.BLOCKED),
    ).resolves.toEqual({ id: 'user-1', status: UserStatus.BLOCKED });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { status: UserStatus.BLOCKED },
      }),
    );
  });
});
