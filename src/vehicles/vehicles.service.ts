import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DateTime, FixedOffsetZone, Zone } from 'luxon';
import { PrismaService } from '../database/prisma.service';
import {
  CreateAvailabilityWindowDto,
  CreateVehicleDto,
  UpdateVehicleDto,
} from './dto';
import { VehicleEntity } from './entities/vehicle.entity';
import { VehicleAvailabilityWindowEntity } from './entities/vehicle-availability-window.entity';
import {
  PublicVehicleAvailabilityRuleEntity,
  PublicVehicleAvailabilitySummaryEntity,
} from './entities/public-vehicle-availability-summary.entity';
import {
  AvailabilityWindowRecurrence,
  AvailabilityWindowType,
  BatteryType,
  VehicleStatus,
  VehicleCondition,
  UserRole,
  BookingStatus,
  UserStatus,
} from '@prisma/client';
import { VehicleSubmittedForApprovalEvent } from '../events/admin.events';
import { TrustScoreService } from '../trust-score/trust-score.service';
import { KycService } from '../kyc/kyc.service';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly trustScoreService: TrustScoreService,
    private readonly kycService: KycService,
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

    if (!ownerRole.includes(UserRole.ADMIN)) {
      await this.trustScoreService.assertCanRegisterVehicle(ownerId);
      await this.kycService.assertApproved(ownerId, 'vehicle');
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
        instantBook: dto.instantBook ?? false,
        cancellationPolicy: dto.cancellationPolicy,
        dailyKmLimit: dto.dailyKmLimit,
        excessKmPrice: dto.excessKmPrice,
        weeklyDiscount: dto.weeklyDiscount,
        monthlyDiscount: dto.monthlyDiscount,
        allowSmoke: dto.allowSmoke ?? false,
        allowPets: dto.allowPets ?? false,
        geoRestriction: dto.geoRestriction,
        batteryReturnMin: dto.batteryReturnMin,
        firstRegistrationYear: dto.firstRegistrationYear,
        condition: dto.condition,
        batteryType: dto.batteryType,
        batteryHealth: dto.batteryHealth,
        batteryCycleCount: dto.batteryCycleCount,
        batteryLastServicedAt: dto.batteryLastServicedAt
          ? new Date(dto.batteryLastServicedAt)
          : undefined,
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
      'pricePerDay',
      'address',
      'latitude',
      'longitude',
      'description',
      'images',
      'isAvailable',
      'instantBook',
      'cancellationPolicy',
      'dailyKmLimit',
      'excessKmPrice',
      'weeklyDiscount',
      'monthlyDiscount',
      'allowSmoke',
      'allowPets',
      'geoRestriction',
      'batteryReturnMin',
      'firstRegistrationYear',
      'condition',
      'batteryType',
      'batteryHealth',
      'batteryCycleCount',
      'batteryLastServicedAt',
    ];

    fieldsToMap.forEach((field) => {
      if (dto[field] !== undefined) {
        updateData[field] =
          field === 'batteryLastServicedAt' && dto[field] !== null
            ? new Date(dto[field] as string)
            : dto[field];
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

    const blockingBooking = await this.prisma.booking.findFirst({
      where: {
        vehicleId,
        status: {
          in: [
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
            BookingStatus.ONGOING,
          ],
        },
        endTime: { gt: new Date() },
      },
      select: { id: true },
    });

    if (blockingBooking) {
      throw new BadRequestException(
        'Cannot delete a vehicle with active or upcoming bookings',
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
    instantBook?: boolean;
    condition?: VehicleCondition | string;
    batteryType?: BatteryType | string;
    minBatteryHealth?: number;
    excludeOwnerId?: string;
  }): Promise<{ vehicles: VehicleEntity[]; total: number }> {
    const where: any = {
      status: VehicleStatus.AVAILABLE,
      isAvailable: true,
      owner: {
        is: {
          trustScore: { gte: 40 },
          status: { notIn: [UserStatus.BLOCKED, UserStatus.RESTRICTED] },
        },
      },
    };

    if (params?.excludeOwnerId) {
      where.ownerId = { not: params.excludeOwnerId };
    }

    if (params?.type) {
      where.type = params.type;
    }

    if (params?.minPrice || params?.maxPrice) {
      where.pricePerHour = {};
      if (params.minPrice) where.pricePerHour.gte = params.minPrice;
      if (params.maxPrice) where.pricePerHour.lte = params.maxPrice;
    }

    // Instant book filter
    if (params?.instantBook !== undefined) {
      where.instantBook = params.instantBook;
    }

    if (params?.condition) {
      where.condition = params.condition;
    }

    if (params?.batteryType) {
      where.batteryType = params.batteryType;
    }

    if (params?.minBatteryHealth !== undefined) {
      where.batteryHealth = { gte: params.minBatteryHealth };
    }

    // Date-range availability filter: exclude vehicles with overlapping bookings,
    // active checkout locks, blocked owner windows, or missing calendar coverage
    // for vehicles that have opted into AVAILABLE windows.
    if (params?.startTime && params?.endTime) {
      const requestedStart = new Date(params.startTime);
      const requestedEnd = new Date(params.endTime);
      if (
        Number.isNaN(requestedStart.getTime()) ||
        Number.isNaN(requestedEnd.getTime()) ||
        requestedStart >= requestedEnd
      ) {
        throw new BadRequestException('Invalid availability time range');
      }

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
          startTime: { lt: requestedEnd },
          endTime: { gt: requestedStart },
        },
        select: { vehicleId: true },
        distinct: ['vehicleId'],
      });

      // Also check for active booking locks
      const conflictingLocks = await this.prisma.bookingLock.findMany({
        where: {
          expiresAt: { gt: new Date() },
          startTime: { lt: requestedEnd },
          endTime: { gt: requestedStart },
        },
        select: { vehicleId: true },
        distinct: ['vehicleId'],
      });

      const blockedWindows =
        await this.prisma.vehicleAvailabilityWindow.findMany({
          where: {
            type: AvailabilityWindowType.BLOCKED,
            OR: [
              {
                recurrence: AvailabilityWindowRecurrence.ONCE,
                startTime: { lt: requestedEnd },
                endTime: { gt: requestedStart },
              },
              {
                recurrence: AvailabilityWindowRecurrence.WEEKLY,
                startTime: { lt: requestedEnd },
                OR: [
                  { recurrenceEndsAt: null },
                  { recurrenceEndsAt: { gt: requestedStart } },
                ],
              },
            ],
          },
        });

      const availableWindows =
        await this.prisma.vehicleAvailabilityWindow.findMany({
          where: { type: AvailabilityWindowType.AVAILABLE },
        });

      const blockedVehicleIds = new Set(
        blockedWindows
          .filter((window) =>
            this.availabilityWindowOverlaps(
              window,
              requestedStart,
              requestedEnd,
            ),
          )
          .map((window) => window.vehicleId),
      );
      const vehiclesWithAvailableCalendar = new Set(
        availableWindows.map((window) => window.vehicleId),
      );
      const calendarCoveredVehicleIds = new Set(
        availableWindows
          .filter((window) =>
            this.availabilityWindowCovers(window, requestedStart, requestedEnd),
          )
          .map((window) => window.vehicleId),
      );
      const calendarNotCoveredVehicleIds = [
        ...vehiclesWithAvailableCalendar,
      ].filter((vehicleId) => !calendarCoveredVehicleIds.has(vehicleId));

      const conflictingVehicleIds = [
        ...new Set([
          ...conflictingBookings.map((b) => b.vehicleId),
          ...conflictingLocks.map((l) => l.vehicleId),
          ...blockedVehicleIds,
          ...calendarNotCoveredVehicleIds,
        ]),
      ];

      if (conflictingVehicleIds.length > 0) {
        where.id = { notIn: conflictingVehicleIds };
      }
    }

    // Fetch a larger pool for ranking, then paginate after scoring
    const useGeoFilter =
      params?.latitude !== undefined && params?.longitude !== undefined;

    const dbLimit = useGeoFilter ? 1000 : 200;

    const [rawVehicles, rawTotal] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: dbLimit,
        skip: 0,
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

    // --- Composite ranking ---
    const scoredVehicles = rawVehicles.map((v) => {
      let score = 0;

      // 1. Proximity score (max 30 points, closer = higher)
      if (useGeoFilter && v.latitude !== null && v.longitude !== null) {
        const dist = this.haversineKm(
          params!.latitude!,
          params!.longitude!,
          v.latitude,
          v.longitude,
        );
        score += Math.max(0, 30 - (dist / (params!.radiusKm ?? 10)) * 30);
      }

      // 2. Owner trust score (max 20 points)
      const ownerTrust = (v as any).owner?.trustScore ?? 50;
      score += (ownerTrust / 150) * 20;

      // 3. Listing quality — photos and description (max 15 points)
      const photoScore = Math.min(v.images.length, 5) * 2; // up to 10
      const descScore = v.description
        ? Math.min(v.description.length / 100, 1) * 5
        : 0; // up to 5
      score += photoScore + descScore;

      // 4. Popularity — totalTrips (max 15 points)
      score += Math.min(v.totalTrips, 30) * 0.5;

      // 5. Rating (max 10 points)
      score += (v.totalRating / 5) * 10;

      // 6. Instant book bonus (5 points)
      if (v.instantBook) {
        score += 5;
      }

      // 7. EV condition and battery lifecycle signal (max 10 points)
      score += this.vehicleConditionScore(v.condition) * 5;
      if (v.batteryHealth !== null) {
        score += (Math.max(0, Math.min(v.batteryHealth, 100)) / 100) * 4;
      }
      score += this.batteryTypeScore(v.batteryType);

      const distance =
        useGeoFilter && v.latitude !== null && v.longitude !== null
          ? this.haversineKm(
              params!.latitude!,
              params!.longitude!,
              v.latitude,
              v.longitude,
            )
          : undefined;

      return { vehicle: v, score, distance };
    });

    // 8. Price competitiveness bonus (max 5 points — lower = higher score)
    if (scoredVehicles.length > 0) {
      const prices = scoredVehicles.map((sv) =>
        Number(sv.vehicle.pricePerHour),
      );
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      for (const sv of scoredVehicles) {
        const price = Number(sv.vehicle.pricePerHour);
        if (avgPrice > 0) {
          sv.score += Math.max(0, (1 - price / avgPrice) * 5);
        }
      }
    }

    // Sort by composite score descending
    scoredVehicles.sort((a, b) => b.score - a.score);

    if (useGeoFilter) {
      const radius = params!.radiusKm ?? 10;
      const geoFiltered = scoredVehicles
        .filter((sv) => sv.distance !== undefined && sv.distance <= radius)
        .sort(
          (a, b) =>
            (a.distance ?? Number.POSITIVE_INFINITY) -
            (b.distance ?? Number.POSITIVE_INFINITY),
        );

      const pageSize = params?.limit ?? 50;
      const pageOffset = params?.offset ?? 0;
      const paged = geoFiltered.slice(pageOffset, pageOffset + pageSize);

      return {
        vehicles: paged.map((sv) =>
          VehicleEntity.fromPrisma(sv.vehicle, sv.distance),
        ),
        total: geoFiltered.length,
      };
    }

    // Apply pagination to scored results
    const pageSize = params?.limit ?? 20;
    const pageOffset = params?.offset ?? 0;
    const paged = scoredVehicles.slice(pageOffset, pageOffset + pageSize);

    return {
      vehicles: paged.map((sv) => VehicleEntity.fromPrisma(sv.vehicle)),
      total: scoredVehicles.length,
    };
  }

  private vehicleConditionScore(condition: VehicleCondition | null): number {
    switch (condition) {
      case VehicleCondition.NEW:
        return 1;
      case VehicleCondition.LIKE_NEW:
        return 0.9;
      case VehicleCondition.GOOD:
        return 0.75;
      case VehicleCondition.FAIR:
        return 0.45;
      case VehicleCondition.NEEDS_MAINTENANCE:
      default:
        return 0;
    }
  }

  private batteryTypeScore(batteryType: BatteryType | null): number {
    switch (batteryType) {
      case BatteryType.SWAPPABLE:
        return 1;
      case BatteryType.REMOVABLE:
        return 0.75;
      case BatteryType.FIXED_NON_REMOVABLE:
        return 0.4;
      default:
        return 0;
    }
  }

  private assertValidAvailabilityRange(startTime: Date, endTime: Date): void {
    if (
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime()) ||
      startTime >= endTime
    ) {
      throw new BadRequestException(
        'Availability window end time must be after start time',
      );
    }
  }

  private async assertVehicleCalendarAccess(
    vehicleId: string,
    userId: string,
    userRole: UserRole[],
  ): Promise<void> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, ownerId: true },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.ownerId !== userId && !userRole.includes(UserRole.ADMIN)) {
      throw new ForbiddenException(
        'You can only manage availability for your own vehicles',
      );
    }
  }

  async getAvailabilityWindows(
    vehicleId: string,
    userId: string,
    userRole: UserRole[],
    from?: string,
    to?: string,
  ): Promise<VehicleAvailabilityWindowEntity[]> {
    await this.assertVehicleCalendarAccess(vehicleId, userId, userRole);

    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (from || to) {
      fromDate = from ? new Date(from) : undefined;
      toDate = to ? new Date(to) : undefined;

      if (
        (fromDate && Number.isNaN(fromDate.getTime())) ||
        (toDate && Number.isNaN(toDate.getTime())) ||
        (fromDate && toDate && fromDate >= toDate)
      ) {
        throw new BadRequestException('Invalid availability query range');
      }
    }

    const windows = await this.prisma.vehicleAvailabilityWindow.findMany({
      where: { vehicleId },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    });

    const filteredWindows =
      fromDate && toDate
        ? windows.filter((window) =>
            this.availabilityWindowOverlaps(window, fromDate, toDate),
          )
        : windows.filter((window) => {
            if (window.recurrence !== AvailabilityWindowRecurrence.WEEKLY) {
              return (
                (!fromDate || window.endTime > fromDate) &&
                (!toDate || window.startTime < toDate)
              );
            }
            return (
              (!fromDate ||
                window.recurrenceEndsAt === null ||
                window.recurrenceEndsAt > fromDate) &&
              (!toDate || window.startTime < toDate)
            );
          });

    return filteredWindows.map((window) =>
      VehicleAvailabilityWindowEntity.fromPrisma(window),
    );
  }

  async getPublicAvailabilitySummary(
    vehicleId: string,
  ): Promise<PublicVehicleAvailabilitySummaryEntity> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const now = new Date();
    const windows = await this.prisma.vehicleAvailabilityWindow.findMany({
      where: {
        vehicleId,
        OR: [
          {
            recurrence: AvailabilityWindowRecurrence.ONCE,
            endTime: { gt: now },
          },
          {
            recurrence: AvailabilityWindowRecurrence.WEEKLY,
            startTime: { lt: now },
            OR: [{ recurrenceEndsAt: null }, { recurrenceEndsAt: { gt: now } }],
          },
          {
            recurrence: AvailabilityWindowRecurrence.WEEKLY,
            startTime: { gte: now },
          },
        ],
      },
      orderBy: [{ type: 'asc' }, { startTime: 'asc' }],
    });
    const rules = windows.map((window) =>
      PublicVehicleAvailabilityRuleEntity.fromPrisma(window),
    );

    return new PublicVehicleAvailabilitySummaryEntity({
      hasAvailableCalendar: rules.some(
        (rule) => rule.type === AvailabilityWindowType.AVAILABLE,
      ),
      rules,
    });
  }

  async createAvailabilityWindow(
    vehicleId: string,
    userId: string,
    userRole: UserRole[],
    dto: CreateAvailabilityWindowDto,
  ): Promise<VehicleAvailabilityWindowEntity> {
    await this.assertVehicleCalendarAccess(vehicleId, userId, userRole);

    const data = this.normalizeAvailabilityWindowDto(dto);
    await this.assertNoAvailabilityConflict(vehicleId, dto.type, data);

    const window = await this.prisma.vehicleAvailabilityWindow.create({
      data: {
        vehicleId,
        type: dto.type,
        ...data,
      },
    });

    return VehicleAvailabilityWindowEntity.fromPrisma(window);
  }

  async updateAvailabilityWindow(
    vehicleId: string,
    windowId: string,
    userId: string,
    userRole: UserRole[],
    dto: CreateAvailabilityWindowDto,
  ): Promise<VehicleAvailabilityWindowEntity> {
    await this.assertVehicleCalendarAccess(vehicleId, userId, userRole);

    const currentWindow = await this.prisma.vehicleAvailabilityWindow.findFirst(
      {
        where: { id: windowId, vehicleId },
        select: { id: true },
      },
    );
    if (!currentWindow) {
      throw new NotFoundException('Availability window not found');
    }

    const data = this.normalizeAvailabilityWindowDto(dto);
    await this.assertNoAvailabilityConflict(
      vehicleId,
      dto.type,
      data,
      windowId,
    );

    const window = await this.prisma.vehicleAvailabilityWindow.update({
      where: { id: windowId },
      data: {
        type: dto.type,
        ...data,
      },
    });

    return VehicleAvailabilityWindowEntity.fromPrisma(window);
  }

  private normalizeAvailabilityWindowDto(dto: CreateAvailabilityWindowDto): {
    recurrence: AvailabilityWindowRecurrence;
    recurringWeekdays: number[];
    timezoneOffsetMinutes: number | null;
    timezoneName: string | null;
    recurrenceEndsAt: Date | null;
    startTime: Date;
    endTime: Date;
    note?: string;
  } {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    this.assertValidAvailabilityRange(startTime, endTime);
    const recurrence = dto.recurrence ?? AvailabilityWindowRecurrence.ONCE;
    const recurrenceEndsAt = dto.recurrenceEndsAt
      ? new Date(dto.recurrenceEndsAt)
      : null;
    const timezoneName = dto.timezoneName?.trim() || null;

    if (recurrence === AvailabilityWindowRecurrence.WEEKLY) {
      if (
        !dto.recurringWeekdays?.length ||
        (!timezoneName && dto.timezoneOffsetMinutes === undefined) ||
        endTime.getTime() - startTime.getTime() > 24 * 60 * 60 * 1000
      ) {
        throw new BadRequestException(
          'Weekly availability requires weekdays, a timezone, and a window of 24 hours or less',
        );
      }
      if (timezoneName && !DateTime.now().setZone(timezoneName).isValid) {
        throw new BadRequestException('Invalid availability timezone name');
      }
      if (
        dto.recurringWeekdays.some((weekday) => weekday < 1 || weekday > 7) ||
        new Set(dto.recurringWeekdays).size !== dto.recurringWeekdays.length
      ) {
        throw new BadRequestException('Invalid weekly availability weekdays');
      }
      if (recurrenceEndsAt && recurrenceEndsAt <= startTime) {
        throw new BadRequestException(
          'Recurring availability end must be after its start time',
        );
      }
    }

    return {
      recurrence,
      recurringWeekdays:
        recurrence === AvailabilityWindowRecurrence.WEEKLY
          ? dto.recurringWeekdays!
          : [],
      timezoneOffsetMinutes:
        recurrence === AvailabilityWindowRecurrence.WEEKLY
          ? (dto.timezoneOffsetMinutes ??
            DateTime.fromJSDate(startTime, { zone: 'utc' }).setZone(
              timezoneName!,
            ).offset)
          : null,
      timezoneName:
        recurrence === AvailabilityWindowRecurrence.WEEKLY
          ? timezoneName
          : null,
      recurrenceEndsAt:
        recurrence === AvailabilityWindowRecurrence.WEEKLY
          ? recurrenceEndsAt
          : null,
      startTime,
      endTime,
      note: dto.note,
    };
  }

  private async assertNoAvailabilityConflict(
    vehicleId: string,
    type: AvailabilityWindowType,
    data: {
      recurrence: AvailabilityWindowRecurrence;
      recurringWeekdays: number[];
      timezoneOffsetMinutes: number | null;
      timezoneName: string | null;
      startTime: Date;
      endTime: Date;
    },
    excludedWindowId?: string,
  ): Promise<void> {
    let hasOverlap = false;
    if (data.recurrence === AvailabilityWindowRecurrence.ONCE) {
      const overlappingWindow =
        await this.prisma.vehicleAvailabilityWindow.findFirst({
          where: {
            vehicleId,
            type,
            recurrence: AvailabilityWindowRecurrence.ONCE,
            ...(excludedWindowId ? { id: { not: excludedWindowId } } : {}),
            startTime: { lt: data.endTime },
            endTime: { gt: data.startTime },
          },
          select: { id: true },
        });
      hasOverlap = Boolean(overlappingWindow);
    } else {
      const existingRules =
        await this.prisma.vehicleAvailabilityWindow.findMany({
          where: {
            vehicleId,
            type,
            recurrence: AvailabilityWindowRecurrence.WEEKLY,
            ...(excludedWindowId ? { id: { not: excludedWindowId } } : {}),
          },
        });
      hasOverlap = existingRules.some((rule) =>
        this.weeklyRulesConflict(rule, {
          startTime: data.startTime,
          endTime: data.endTime,
          recurringWeekdays: data.recurringWeekdays,
          timezoneOffsetMinutes: data.timezoneOffsetMinutes!,
          timezoneName: data.timezoneName,
        }),
      );
    }

    if (hasOverlap) {
      throw new BadRequestException(
        'Availability window overlaps an existing window of the same type',
      );
    }
  }

  private availabilityWindowOverlaps(
    window: {
      recurrence?: AvailabilityWindowRecurrence;
      recurringWeekdays?: number[];
      timezoneOffsetMinutes?: number | null;
      timezoneName?: string | null;
      recurrenceEndsAt?: Date | null;
      startTime: Date;
      endTime: Date;
    },
    rangeStart: Date,
    rangeEnd: Date,
  ): boolean {
    if (window.recurrence !== AvailabilityWindowRecurrence.WEEKLY) {
      return window.startTime < rangeEnd && window.endTime > rangeStart;
    }
    return this.weeklyOccurrences(window, rangeStart, rangeEnd).some(
      ({ startTime, endTime }) => startTime < rangeEnd && endTime > rangeStart,
    );
  }

  private availabilityWindowCovers(
    window: {
      recurrence?: AvailabilityWindowRecurrence;
      recurringWeekdays?: number[];
      timezoneOffsetMinutes?: number | null;
      timezoneName?: string | null;
      recurrenceEndsAt?: Date | null;
      startTime: Date;
      endTime: Date;
    },
    rangeStart: Date,
    rangeEnd: Date,
  ): boolean {
    if (window.recurrence !== AvailabilityWindowRecurrence.WEEKLY) {
      return window.startTime <= rangeStart && window.endTime >= rangeEnd;
    }
    return this.weeklyOccurrences(window, rangeStart, rangeEnd).some(
      ({ startTime, endTime }) =>
        startTime <= rangeStart && endTime >= rangeEnd,
    );
  }

  private weeklyOccurrences(
    window: {
      recurringWeekdays?: number[];
      timezoneOffsetMinutes?: number | null;
      timezoneName?: string | null;
      recurrenceEndsAt?: Date | null;
      startTime: Date;
      endTime: Date;
    },
    rangeStart: Date,
    rangeEnd: Date,
  ): Array<{ startTime: Date; endTime: Date }> {
    const zone = this.availabilityTimezone(window);
    const anchorStartLocal = DateTime.fromJSDate(window.startTime, {
      zone: 'utc',
    }).setZone(zone);
    const anchorEndLocal = DateTime.fromJSDate(window.endTime, {
      zone: 'utc',
    }).setZone(zone);
    const endDayOffset = this.wallDateDifference(
      anchorStartLocal,
      anchorEndLocal,
    );
    const scanStartLocal = DateTime.fromJSDate(rangeStart, {
      zone: 'utc',
    })
      .setZone(zone)
      .minus({ days: 1 })
      .startOf('day');
    const scanEndLocal = DateTime.fromJSDate(rangeEnd, {
      zone: 'utc',
    })
      .setZone(zone)
      .startOf('day');
    const weekdays = new Set(window.recurringWeekdays ?? []);
    const occurrences: Array<{ startTime: Date; endTime: Date }> = [];

    for (
      let cursor = scanStartLocal;
      cursor <= scanEndLocal;
      cursor = cursor.plus({ days: 1 })
    ) {
      if (!weekdays.has(cursor.weekday)) continue;

      const occurrenceStartLocal = cursor.set({
        hour: anchorStartLocal.hour,
        minute: anchorStartLocal.minute,
        second: anchorStartLocal.second,
        millisecond: anchorStartLocal.millisecond,
      });
      const occurrenceEndLocal = cursor.plus({ days: endDayOffset }).set({
        hour: anchorEndLocal.hour,
        minute: anchorEndLocal.minute,
        second: anchorEndLocal.second,
        millisecond: anchorEndLocal.millisecond,
      });
      const occurrenceStart = occurrenceStartLocal.toUTC().toJSDate();
      if (
        occurrenceStart < window.startTime ||
        (window.recurrenceEndsAt && occurrenceStart >= window.recurrenceEndsAt)
      ) {
        continue;
      }
      occurrences.push({
        startTime: occurrenceStart,
        endTime: occurrenceEndLocal.toUTC().toJSDate(),
      });
    }
    return occurrences;
  }

  private weeklyRulesConflict(
    existing: {
      startTime: Date;
      endTime: Date;
      recurringWeekdays: number[];
      timezoneOffsetMinutes: number | null;
      timezoneName?: string | null;
    },
    candidate: {
      startTime: Date;
      endTime: Date;
      recurringWeekdays: number[];
      timezoneOffsetMinutes: number;
      timezoneName: string | null;
    },
  ): boolean {
    if (
      existing.timezoneName || candidate.timezoneName
        ? existing.timezoneName !== candidate.timezoneName
        : existing.timezoneOffsetMinutes !== candidate.timezoneOffsetMinutes
    ) {
      return false;
    }
    if (
      !existing.recurringWeekdays.some((weekday) =>
        candidate.recurringWeekdays.includes(weekday),
      )
    ) {
      return false;
    }
    const zone = this.availabilityTimezone(candidate);
    const existingStart = DateTime.fromJSDate(existing.startTime, {
      zone: 'utc',
    }).setZone(zone);
    const existingEnd = DateTime.fromJSDate(existing.endTime, {
      zone: 'utc',
    }).setZone(zone);
    const candidateStart = DateTime.fromJSDate(candidate.startTime, {
      zone: 'utc',
    }).setZone(zone);
    const candidateEnd = DateTime.fromJSDate(candidate.endTime, {
      zone: 'utc',
    }).setZone(zone);
    const existingStartMinutes = existingStart.hour * 60 + existingStart.minute;
    const candidateStartMinutes =
      candidateStart.hour * 60 + candidateStart.minute;
    const existingEndMinutes =
      existingStartMinutes +
      this.wallDurationMinutes(existingStart, existingEnd);
    const candidateEndMinutes =
      candidateStartMinutes +
      this.wallDurationMinutes(candidateStart, candidateEnd);
    return (
      existingStartMinutes < candidateEndMinutes &&
      existingEndMinutes > candidateStartMinutes
    );
  }

  private availabilityTimezone(window: {
    timezoneName?: string | null;
    timezoneOffsetMinutes?: number | null;
  }): string | Zone {
    return (
      window.timezoneName ??
      FixedOffsetZone.instance(window.timezoneOffsetMinutes ?? 0)
    );
  }

  private wallDateDifference(start: DateTime, end: DateTime): number {
    return Math.round(
      DateTime.utc(end.year, end.month, end.day).diff(
        DateTime.utc(start.year, start.month, start.day),
        'days',
      ).days,
    );
  }

  private wallDurationMinutes(start: DateTime, end: DateTime): number {
    return DateTime.utc(
      end.year,
      end.month,
      end.day,
      end.hour,
      end.minute,
    ).diff(
      DateTime.utc(
        start.year,
        start.month,
        start.day,
        start.hour,
        start.minute,
      ),
      'minutes',
    ).minutes;
  }

  async deleteAvailabilityWindow(
    vehicleId: string,
    windowId: string,
    userId: string,
    userRole: UserRole[],
  ): Promise<void> {
    await this.assertVehicleCalendarAccess(vehicleId, userId, userRole);

    const window = await this.prisma.vehicleAvailabilityWindow.findFirst({
      where: { id: windowId, vehicleId },
      select: { id: true },
    });

    if (!window) {
      throw new NotFoundException('Availability window not found');
    }

    await this.prisma.vehicleAvailabilityWindow.delete({
      where: { id: windowId },
    });
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
