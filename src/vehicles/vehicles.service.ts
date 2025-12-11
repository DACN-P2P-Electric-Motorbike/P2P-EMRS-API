import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { VehicleEntity } from './entities/vehicle.entity';
import {
  SearchVehiclesDto,
  SearchVehiclesResponseDto,
} from './dto/search-vehicles.dto';
import { VehicleStatus } from '@prisma/client';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @returns distance in kilometers
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Search vehicles near user location
   */
  async searchVehicles(
    dto: SearchVehiclesDto,
  ): Promise<SearchVehiclesResponseDto> {
    this.logger.log(
      `Searching vehicles near (${dto.latitude}, ${dto.longitude}) within ${dto.radius}km`,
    );

    // Build where clause
    const where: any = {};

    if (dto.availableOnly) {
      where.isAvailable = true;
      where.status = VehicleStatus.AVAILABLE;
    }

    if (dto.type) {
      where.type = dto.type;
    }

    if (dto.minRating !== undefined) {
      where.rating = { gte: dto.minRating };
    }

    if (dto.maxPricePerHour !== undefined) {
      where.pricePerHour = { lte: dto.maxPricePerHour };
    }

    // Fetch all vehicles matching basic criteria
    const allVehicles = await this.prisma.vehicle.findMany({
      where,
      orderBy: { rating: 'desc' },
    });

    // Calculate distance and filter by radius
    const vehiclesWithDistance = allVehicles
      .map((vehicle) => {
        const distance = this.calculateDistance(
          dto.latitude,
          dto.longitude,
          vehicle.latitude,
          vehicle.longitude,
        );
        return { ...vehicle, distance };
      })
      .filter((vehicle) => vehicle.distance <= dto.radius!)
      .sort((a, b) => a.distance - b.distance);

    // Pagination
    const skip = (dto.page! - 1) * dto.limit!;
    const paginatedVehicles = vehiclesWithDistance.slice(
      skip,
      skip + dto.limit!,
    );

    const total = vehiclesWithDistance.length;
    const totalPages = Math.ceil(total / dto.limit!);

    this.logger.log(`Found ${total} vehicles within radius`);

    return {
      vehicles: paginatedVehicles.map((v) =>
        VehicleEntity.fromPrisma(v, v.distance),
      ),
      total,
      page: dto.page!,
      limit: dto.limit!,
      totalPages,
    };
  }

  /**
   * Get vehicle details by ID
   */
  async getVehicleById(vehicleId: string): Promise<VehicleEntity> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        owner: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            trustScore: true,
          },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            user: {
              select: {
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return VehicleEntity.fromPrisma(vehicle);
  }

  /**
   * Get nearby vehicles (simplified version for map display)
   */
  async getNearbyVehicles(
    latitude: number,
    longitude: number,
    radius: number = 10,
  ): Promise<VehicleEntity[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        isAvailable: true,
        status: VehicleStatus.AVAILABLE,
      },
    });

    const nearbyVehicles = vehicles
      .map((vehicle) => {
        const distance = this.calculateDistance(
          latitude,
          longitude,
          vehicle.latitude,
          vehicle.longitude,
        );
        return { ...vehicle, distance };
      })
      .filter((vehicle) => vehicle.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    return nearbyVehicles.map((v) => VehicleEntity.fromPrisma(v, v.distance));
  }
}
