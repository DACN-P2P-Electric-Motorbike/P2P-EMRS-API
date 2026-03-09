import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AdminUsersRepository } from '../repositories/admin-users.repository';
import { QueryUsersDto } from '../dto/query-users.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(private readonly usersRepository: AdminUsersRepository) {}

  /**
   * Get paginated list of users with optional role/status filters
   */
  async getUsers(query: QueryUsersDto) {
    const { users, total } = await this.usersRepository.findMany(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    return {
      data: users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update user status (activate or ban)
   */
  async updateUserStatus(userId: string, dto: UpdateUserStatusDto) {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    const updated = await this.usersRepository.updateStatus(
      userId,
      dto.status as UserStatus,
    );

    this.logger.log(
      `Admin updated user ${userId} status: ${user.status} → ${dto.status}`,
    );

    return updated;
  }
}
