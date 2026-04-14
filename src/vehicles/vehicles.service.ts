import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { CreateVehicleDto, UpdateVehicleDto } from './dto';
import { VehicleEntity } from './entities/vehicle.entity';
import { VehicleStatus, UserRole, BookingStatus } from '@prisma/client';
import { VehicleSubmittedForApprovalEvent } from '../events/admin.events';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Register a new vehicle (Owner only)
   */
  async registerVehicle(
    ownerId: string,
    ownerRole: UserRole[],
    dto: CreateVehicleDto,
  ): Promise<VehicleEntity> {
    this.logger.log(
      `User ${ownerId} attempting to register vehicle: ${dto.licensePlate}`,
    );

    // Check if user has OWNER role
    if (
      !ownerRole.includes(UserRole.OWNER) &&
      !ownerRole.includes(UserRole.ADMIN)
    ) {
      throw new ForbiddenException(
        'Only users with OWNER role can register vehicles. Please upgrade your account.',
      );
    }

    // Check if license plate already exists
    const existingVehicle = await this.prisma.vehicle.findUnique({
      where: { licensePlate: dto.licensePlate },
    });

    if (existingVehicle) {
      throw new ConflictException(
        'A vehicle with this license plate already exists',
      );
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

    this.logger.log(
      `Vehicle registered: ${vehicle.id} with status PENDING_APPROVAL`,
    );

    // Emit admin alert event
    const vehicleName = `${vehicle.brand} ${vehicle.model}`;
    this.eventEmitter.emit(
      'vehicle.submitted',
      new VehicleSubmittedForApprovalEvent(
        vehicle.id,
        ownerId,
        vehicleName,
        vehicle.licensePlate,
      ),
    );

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

    return vehicles.map((vehicle) => VehicleEntity.fromPrisma(vehicle));
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
   * Validate status change permissions for non-admin users
   */
  private validateStatusChange(
    currentStatus: VehicleStatus,
    newStatus: VehicleStatus | undefined,
    isAdmin: boolean,
  ): void {
    if (!newStatus || isAdmin) return;

    const ALLOWED_OWNER_STATUSES: VehicleStatus[] = [
      VehicleStatus.AVAILABLE,
      VehicleStatus.MAINTENANCE,
    ];
    if (!ALLOWED_OWNER_STATUSES.includes(newStatus)) {
      throw new BadRequestException(
        'Owners can only set status to AVAILABLE or MAINTENANCE',
      );
    }

    const RESTRICTED_STATUSES: VehicleStatus[] = [
      VehicleStatus.PENDING_APPROVAL,
      VehicleStatus.REJECTED,
      VehicleStatus.LOCKED,
    ];
    if (RESTRICTED_STATUSES.includes(currentStatus)) {
      throw new BadRequestException(
        `Cannot change status while vehicle is ${currentStatus}. Contact admin for assistance.`,
      );
    }

    if (
      currentStatus === VehicleStatus.RENTED &&
      newStatus === VehicleStatus.AVAILABLE
    ) {
      throw new BadRequestException(
        'Cannot set status to AVAILABLE while vehicle is being rented',
      );
    }
  }

  /**
   * Build partial update data from DTO, excluding undefined fields
   */
  private buildUpdateData(dto: UpdateVehicleDto): Record<string, unknown> {
    const updateData: Record<string, unknown> = {};
    const fieldsToMap: (keyof UpdateVehicleDto)[] = [
      'model',
      'type',
      'status',
      'batteryLevel',
      'pricePerHour',
      'address',
      'latitude',
      'longitude',
      'description',
      'images',
      'isAvailable',
    ];

    fieldsToMap.forEach((field) => {
      if (dto[field] !== undefined) {
        updateData[field] = dto[field];
      }
    });

    return updateData;
  }

  /**
   * Update vehicle (Owner only)
   */
  async updateVehicle(
    vehicleId: string,
    userId: string,
    userRole: UserRole[],
    dto: UpdateVehicleDto,
  ): Promise<VehicleEntity> {
    this.logger.log(
      `User ${userId} attempting to update vehicle: ${vehicleId}`,
    );

    // Find vehicle
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    // Check ownership (Admin can update any vehicle)
    if (vehicle.ownerId !== userId && !userRole.includes(UserRole.ADMIN)) {
      throw new ForbiddenException('You can only update your own vehicles');
    }

    const isAdmin = userRole.includes(UserRole.ADMIN);
    this.validateStatusChange(vehicle.status, dto.status, isAdmin);

    // Build update data only from provided fields
    const updateData = this.buildUpdateData(dto);

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
    userRole: UserRole[],
  ): Promise<void> {
    this.logger.log(
      `User ${userId} attempting to delete vehicle: ${vehicleId}`,
    );

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    // Check ownership
    if (vehicle.ownerId !== userId && !userRole.includes(UserRole.ADMIN)) {
      throw new ForbiddenException('You can only delete your own vehicles');
    }

    // Cannot delete if currently rented
    if (vehicle.status === VehicleStatus.RENTED) {
      throw new BadRequestException(
        'Cannot delete a vehicle that is currently being rented',
      );
    }

    await this.prisma.vehicle.delete({
      where: { id: vehicleId },
    });

    this.logger.log(`Vehicle deleted: ${vehicleId}`);
  }

  /**
   * Get all available vehicles (for renters)
   */
  /**
   * Haversine formula — returns distance in km between two lat/lng points
   */
  private haversineKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async getAvailableVehicles(params?: {
    type?: string;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
    offset?: number;
    startTime?: string;
    endTime?: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
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

    // Date-range availability filter: exclude vehicles with overlapping bookings
    if (params?.startTime && params?.endTime) {
      const requestedStart = new Date(params.startTime);
      const requestedEnd = new Date(params.endTime);

      // Find vehicle IDs that have conflicting bookings in the requested window
      const conflictingBookings = await this.prisma.booking.findMany({
        where: {
          status: {
            in: [
              BookingStatus.PENDING,
              BookingStatus.CONFIRMED,
              BookingStatus.ONGOING,
            ],
          },
          // Overlap condition: existing.startTime < requested.endTime AND existing.endTime > requested.startTime
          startTime: { lt: requestedEnd },
          endTime: { gt: requestedStart },
        },
        select: { vehicleId: true },
        distinct: ['vehicleId'],
      });

      const conflictingVehicleIds = conflictingBookings.map(
        (b) => b.vehicleId,
      );

      if (conflictingVehicleIds.length > 0) {
        where.id = { notIn: conflictingVehicleIds };
      }
    }

    // When distance filtering is requested, fetch all matching vehicles first,
    // then apply Haversine in-memory so the returned `total` reflects geo-filtered count.
    const useGeoFilter =
      params?.latitude !== undefined && params?.longitude !== undefined;

    const dbLimit = useGeoFilter ? 1000 : (params?.limit ?? 20);
    const dbOffset = useGeoFilter ? 0 : (params?.offset ?? 0);

    const [rawVehicles, rawTotal] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: dbLimit,
        skip: dbOffset,
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

    if (useGeoFilter) {
      const radius = params!.radiusKm ?? 10;
      const filtered = rawVehicles.filter((v) => {
        if (v.latitude === null || v.longitude === null) return false;
        return (
          this.haversineKm(
            params!.latitude!,
            params!.longitude!,
            v.latitude,
            v.longitude,
          ) <= radius
        );
      });

      const pageSize = params?.limit ?? 20;
      const pageOffset = params?.offset ?? 0;
      const paged = filtered.slice(pageOffset, pageOffset + pageSize);

      return {
        vehicles: paged.map((v) => VehicleEntity.fromPrisma(v)),
        total: filtered.length,
      };
    }

    return {
      vehicles: rawVehicles.map((vehicle) => VehicleEntity.fromPrisma(vehicle)),
      total: rawTotal,
    };
  }

  /**
   * Toggle vehicle availability (Owner only)
   * This is the quick on/off switch for owners to make their vehicle available for rent
   */
  async toggleAvailability(
    vehicleId: string,
    userId: string,
    userRole: UserRole[],
  ): Promise<VehicleEntity> {
    this.logger.log(
      `User ${userId} toggling availability for vehicle: ${vehicleId}`,
    );

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    // Check ownership
    if (vehicle.ownerId !== userId && !userRole.includes(UserRole.ADMIN)) {
      throw new ForbiddenException('You can only toggle your own vehicles');
    }

    // Cannot toggle if vehicle is in restricted status
    const restrictedStatuses: VehicleStatus[] = [
      VehicleStatus.PENDING_APPROVAL,
      VehicleStatus.REJECTED,
      VehicleStatus.LOCKED,
      VehicleStatus.RENTED,
    ];

    if (restrictedStatuses.includes(vehicle.status)) {
      throw new BadRequestException(
        `Cannot toggle availability while vehicle is ${vehicle.status}. ${
          vehicle.status === VehicleStatus.RENTED
            ? 'Please wait until the rental is complete.'
            : 'Contact admin for assistance.'
        }`,
      );
    }

    // Toggle: if currently available, make unavailable; otherwise make available
    const newIsAvailable = !vehicle.isAvailable;
    const newStatus = newIsAvailable
      ? VehicleStatus.AVAILABLE
      : VehicleStatus.UNAVAILABLE;

    const updatedVehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        isAvailable: newIsAvailable,
        status: newStatus,
      },
    });

    this.logger.log(
      `Vehicle ${vehicleId} availability toggled: isAvailable=${newIsAvailable}, status=${newStatus}`,
    );
    return VehicleEntity.fromPrisma(updatedVehicle);
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
