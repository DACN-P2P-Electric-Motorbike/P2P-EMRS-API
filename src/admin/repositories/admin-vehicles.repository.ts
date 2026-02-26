import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { VehicleStatus } from '@prisma/client';
import { QueryVehiclesDto } from '../dto/query-vehicles.dto';

@Injectable()
export class AdminVehiclesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(query: QueryVehiclesDto) {
    const { status, ownerId, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (ownerId) where.ownerId = ownerId;

    const [vehicles, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        include: {
          owner: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return { vehicles, total };
  }

  async findById(vehicleId: string) {
    return this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        owner: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }

  async updateStatus(vehicleId: string, status: VehicleStatus) {
    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status },
    });
  }
}
