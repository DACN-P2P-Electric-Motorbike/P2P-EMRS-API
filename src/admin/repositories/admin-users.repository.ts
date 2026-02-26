import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UserStatus } from '@prisma/client';
import { QueryUsersDto } from '../dto/query-users.dto';

@Injectable()
export class AdminUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(query: QueryUsersDto) {
    const { role, status, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (role) where.roles = { has: role };
    if (status) where.status = status;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          roles: true,
          status: true,
          avatarUrl: true,
          trustScore: true,
          idCardNum: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async findById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        roles: true,
        status: true,
        avatarUrl: true,
        trustScore: true,
        idCardNum: true,
        address: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateStatus(userId: string, status: UserStatus) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        updatedAt: true,
      },
    });
  }
}
