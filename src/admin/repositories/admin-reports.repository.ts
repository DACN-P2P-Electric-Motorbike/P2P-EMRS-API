import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BookingStatus, PaymentStatus } from '@prisma/client';

@Injectable()
export class AdminReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Top vehicles by completed booking count
   */
  async getTopVehicles(limit: number = 10) {
    // Use groupBy to count completed bookings per vehicle
    const topVehicleGroups = await this.prisma.booking.groupBy({
      by: ['vehicleId'],
      where: { status: BookingStatus.COMPLETED },
      _count: { vehicleId: true },
      orderBy: { _count: { vehicleId: 'desc' } },
      take: limit,
    });

    if (topVehicleGroups.length === 0) return [];

    const vehicleIds = topVehicleGroups.map((g) => g.vehicleId);
    const vehicles = await this.prisma.vehicle.findMany({
      where: { id: { in: vehicleIds } },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
      },
    });

    // Merge count data with vehicle details
    return topVehicleGroups.map((group) => {
      const vehicle = vehicles.find((v) => v.id === group.vehicleId);
      return {
        vehicleId: group.vehicleId,
        totalBookings: group._count.vehicleId,
        vehicle: vehicle
          ? {
              id: vehicle.id,
              name: vehicle.name,
              model: vehicle.model,
              brand: vehicle.brand,
              licensePlate: vehicle.licensePlate,
              owner: vehicle.owner,
            }
          : null,
      };
    });
  }

  /**
   * Top owners by total completed revenue
   */
  async getTopOwners(limit: number = 10) {
    // Sum payment.ownerAmount (the portion owners receive) grouped by receiverId
    const topOwnerGroups = await this.prisma.payment.groupBy({
      by: ['receiverId'],
      where: { status: PaymentStatus.COMPLETED },
      _sum: { ownerAmount: true },
      orderBy: { _sum: { ownerAmount: 'desc' } },
      take: limit,
    });

    if (topOwnerGroups.length === 0) return [];

    const ownerIds = topOwnerGroups.map((g) => g.receiverId);
    const owners = await this.prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        _count: { select: { vehicles: true } },
      },
    });

    return topOwnerGroups.map((group) => {
      const owner = owners.find((o) => o.id === group.receiverId);
      return {
        ownerId: group.receiverId,
        totalRevenue: group._sum.ownerAmount ?? 0,
        owner: owner
          ? {
              id: owner.id,
              fullName: owner.fullName,
              email: owner.email,
              phone: owner.phone,
              avatarUrl: owner.avatarUrl,
              totalVehicles: owner._count.vehicles,
            }
          : null,
      };
    });
  }
}
