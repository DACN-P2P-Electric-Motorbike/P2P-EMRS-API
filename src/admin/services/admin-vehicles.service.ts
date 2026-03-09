import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';
import { AdminVehiclesRepository } from '../repositories/admin-vehicles.repository';
import { QueryVehiclesDto } from '../dto/query-vehicles.dto';
import { UpdateVehicleStatusDto } from '../dto/update-vehicle-status.dto';

/** Valid status transitions allowed for admin vehicle approval */
const ALLOWED_TRANSITIONS: Partial<Record<VehicleStatus, VehicleStatus[]>> = {
  [VehicleStatus.PENDING_APPROVAL]: [
    VehicleStatus.AVAILABLE,
    VehicleStatus.REJECTED,
  ],
  [VehicleStatus.AVAILABLE]: [VehicleStatus.MAINTENANCE],
  [VehicleStatus.MAINTENANCE]: [VehicleStatus.AVAILABLE],
};

@Injectable()
export class AdminVehiclesService {
  private readonly logger = new Logger(AdminVehiclesService.name);

  constructor(private readonly vehiclesRepository: AdminVehiclesRepository) {}

  /**
   * Get paginated list of vehicles with optional filters
   */
  async getVehicles(query: QueryVehiclesDto) {
    const { vehicles, total } = await this.vehiclesRepository.findMany(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    return {
      data: vehicles.map((v) => ({
        id: v.id,
        owner: {
          id: v.owner.id,
          full_name: v.owner.fullName,
          email: v.owner.email,
        },
        created_at: v.createdAt,
        vehicle_info: {
          name: v.name,
          brand: v.brand,
          model: v.model,
          year: v.year,
          plate_number: v.licensePlate,
          images: v.images,
        },
        status: v.status,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update vehicle status with transition validation
   */
  async updateVehicleStatus(vehicleId: string, dto: UpdateVehicleStatusDto) {
    const vehicle = await this.vehiclesRepository.findById(vehicleId);

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID "${vehicleId}" not found`);
    }

    const { status: newStatus } = dto;
    const currentStatus = vehicle.status;

    // Validate the transition
    const allowedNext = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${currentStatus} → ${newStatus}. ` +
          `Allowed transitions from ${currentStatus}: [${allowedNext?.join(', ') ?? 'none'}]`,
      );
    }

    const updated = await this.vehiclesRepository.updateStatus(
      vehicleId,
      newStatus,
    );

    this.logger.log(
      `Admin updated vehicle ${vehicleId}: ${currentStatus} → ${newStatus}`,
    );

    return updated;
  }
}
