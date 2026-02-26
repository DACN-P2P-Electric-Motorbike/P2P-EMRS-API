import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { VehicleStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../../auth/guards';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AdminVehiclesService } from '../services/admin-vehicles.service';
import { QueryVehiclesDto } from '../dto/query-vehicles.dto';
import { UpdateVehicleStatusDto } from '../dto/update-vehicle-status.dto';

@ApiTags('Admin – Vehicles')
@Controller('admin/vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminVehiclesController {
  constructor(private readonly vehiclesService: AdminVehiclesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List vehicles (Admin)',
    description:
      'Get paginated list of vehicles. Filter by status, ownerId. Sorted by created_at DESC.',
  })
  @ApiQuery({ name: 'status', enum: VehicleStatus, required: false })
  @ApiQuery({ name: 'ownerId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Paginated vehicle list',
    schema: {
      example: {
        status: 'success',
        data: {
          data: [
            {
              id: 'uuid',
              owner: {
                id: 'uuid',
                full_name: 'Nguyen Van A',
                email: 'abc@gmail.com',
              },
              created_at: '2023-10-25T10:00:00Z',
              vehicle_info: {
                name: 'Honda Wave',
                brand: 'VINFAST',
                model: 'A125',
                year: 2022,
                plate_number: '59A-12345',
                images: [],
              },
              status: 'PENDING_APPROVAL',
            },
          ],
          pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – Admin only' })
  async getVehicles(@Query() query: QueryVehiclesDto) {
    const result = await this.vehiclesService.getVehicles(query);
    return { status: 'success', data: result };
  }

  @Patch(':vehicleId/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update vehicle status (Admin)',
    description: `Update vehicle approval status.
    
Allowed transitions:
- PENDING_APPROVAL → AVAILABLE (approve)
- PENDING_APPROVAL → REJECTED
- AVAILABLE → MAINTENANCE
- MAINTENANCE → AVAILABLE`,
  })
  @ApiParam({ name: 'vehicleId', description: 'Vehicle UUID' })
  @ApiResponse({
    status: 200,
    description: 'Vehicle status updated',
    schema: {
      example: {
        status: 'success',
        data: { id: 'uuid', status: 'AVAILABLE' },
        message: 'Vehicle status updated successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async updateVehicleStatus(
    @Param('vehicleId') vehicleId: string,
    @Body() dto: UpdateVehicleStatusDto,
  ) {
    const updated = await this.vehiclesService.updateVehicleStatus(
      vehicleId,
      dto,
    );
    return {
      status: 'success',
      data: updated,
      message: 'Vehicle status updated successfully',
    };
  }
}
