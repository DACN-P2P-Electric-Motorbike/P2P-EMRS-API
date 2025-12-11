import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateVehicleDto, UpdateVehicleDto } from './dto';
import { VehicleEntity } from './entities/vehicle.entity';
import { VehicleStatus, UserRole } from '@prisma/client';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a new vehicle (Owner only)
   */
  async registerVehicle(
    ownerId: string,
    ownerRole: UserRole,
    dto: CreateVehicleDto,
  ): Promise<VehicleEntity> {
    this.logger.log(`User ${ownerId} attempting to register vehicle: ${dto.licensePlate}`);

    // Check if user has OWNER role
    if (ownerRole !== UserRole.OWNER && ownerRole !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Only users with OWNER role can register vehicles. Please upgrade your account.',
      );
    }

    // Check if license plate already exists
    const existingVehicle = await this.prisma.vehicle.findUnique({
      where: { licensePlate: dto.licensePlate },
    });

    if (existingVehicle) {
      throw new ConflictException('A vehicle with this license plate already exists');
    }

    // Create vehicle with PENDING_APPROVAL status
    const vehicle = await this.prisma.vehicle.create({
      data: {
        licensePlate: dto.licensePlate,
        model: dto.model,
        brand: dto.brand,
        type: dto.type ?? 'OTHER',
        features: dto.features ?? [],
        status: VehicleStatus.PENDING_APPROVAL,
        pricePerHour: dto.pricePerHour,
        pricePerDay: dto.pricePerDay,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        description: dto.description,
        images: dto.images,
        licenseNumber: dto.licenseNumber,
        licenseFront: dto.licenseFront,
        licenseBack: dto.licenseBack,
        batteryLevel: dto.batteryLevel ?? 100,
        ownerId,
      },
    });

    this.logger.log(`Vehicle registered: ${vehicle.id} with status PENDING_APPROVAL`);
    return VehicleEntity.fromPrisma(vehicle);
  }

  /**
   * Get all vehicles owned by a user
   */
  async getMyVehicles(ownerId: string): Promise<VehicleEntity[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });

    return vehicles.map(VehicleEntity.fromPrisma);
  }

  /**
   * Get vehicle by ID
   */
  async getVehicleById(vehicleId: string): Promise<VehicleEntity> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        owner: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            avatarUrl: true,
            trustScore: true,
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
   * Update vehicle (Owner only)
   */
  async updateVehicle(
    vehicleId: string,
    userId: string,
    userRole: UserRole,
    dto: UpdateVehicleDto,
  ): Promise<VehicleEntity> {
    this.logger.log(`User ${userId} attempting to update vehicle: ${vehicleId}`);

    // Find vehicle
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    // Check ownership (Admin can update any vehicle)
    if (vehicle.ownerId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own vehicles');
    }

    // Validate status change for non-admin users
    if (dto.status && userRole !== UserRole.ADMIN) {
      const allowedOwnerStatuses: VehicleStatus[] = [
        VehicleStatus.AVAILABLE,
        VehicleStatus.MAINTENANCE,
      ];

      if (!allowedOwnerStatuses.includes(dto.status)) {
        throw new BadRequestException(
          'Owners can only set status to AVAILABLE or MAINTENANCE',
        );
      }

      // Owner cannot change status if currently PENDING_APPROVAL, REJECTED, or LOCKED
      const restrictedStatuses: VehicleStatus[] = [
        VehicleStatus.PENDING_APPROVAL,
        VehicleStatus.REJECTED,
        VehicleStatus.LOCKED,
      ];

      if (restrictedStatuses.includes(vehicle.status)) {
        throw new BadRequestException(
          `Cannot change status while vehicle is ${vehicle.status}. Contact admin for assistance.`,
        );
      }

      // Cannot set to AVAILABLE if vehicle is currently RENTED
      if (vehicle.status === VehicleStatus.RENTED && dto.status === VehicleStatus.AVAILABLE) {
        throw new BadRequestException(
          'Cannot set status to AVAILABLE while vehicle is being rented',
        );
      }
    }

    // Build update data
    const updateData: any = {};
    
    if (dto.model !== undefined) updateData.model = dto.model;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.batteryLevel !== undefined) updateData.batteryLevel = dto.batteryLevel;
    if (dto.pricePerHour !== undefined) updateData.pricePerHour = dto.pricePerHour;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.latitude !== undefined) updateData.latitude = dto.latitude;
    if (dto.longitude !== undefined) updateData.longitude = dto.longitude;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.images !== undefined) updateData.images = dto.images;

    const updatedVehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: updateData,
    });

    this.logger.log(`Vehicle updated: ${vehicleId}`);
    return VehicleEntity.fromPrisma(updatedVehicle);
  }

  /**
   * Delete vehicle (Owner only)
   */
  async deleteVehicle(
    vehicleId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<void> {
    this.logger.log(`User ${userId} attempting to delete vehicle: ${vehicleId}`);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    // Check ownership
    if (vehicle.ownerId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only delete your own vehicles');
    }

    // Cannot delete if currently rented
    if (vehicle.status === VehicleStatus.RENTED) {
      throw new BadRequestException('Cannot delete a vehicle that is currently being rented');
    }

    await this.prisma.vehicle.delete({
      where: { id: vehicleId },
    });

    this.logger.log(`Vehicle deleted: ${vehicleId}`);
  }

  /**
   * Get all available vehicles (for renters)
   */
  async getAvailableVehicles(params?: {
    type?: string;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ vehicles: VehicleEntity[]; total: number }> {
    const where: any = {
      status: VehicleStatus.AVAILABLE,
    };

    if (params?.type) {
      where.type = params.type;
    }

    if (params?.minPrice || params?.maxPrice) {
      where.pricePerHour = {};
      if (params.minPrice) where.pricePerHour.gte = params.minPrice;
      if (params.maxPrice) where.pricePerHour.lte = params.maxPrice;
    }

    const [vehicles, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params?.limit ?? 20,
        skip: params?.offset ?? 0,
        include: {
          owner: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              trustScore: true,
            },
          },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      vehicles: vehicles.map(VehicleEntity.fromPrisma),
      total,
    };
  }

  /**
   * Admin: Update vehicle status
   */
  async adminUpdateStatus(
    vehicleId: string,
    status: VehicleStatus,
  ): Promise<VehicleEntity> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const updatedVehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status },
    });

    this.logger.log(`Admin updated vehicle ${vehicleId} status to ${status}`);
    return VehicleEntity.fromPrisma(updatedVehicle);
  }
}
