import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto, UpdateVehicleDto } from './dto';
import { VehicleEntity } from './entities/vehicle.entity';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserEntity } from '../auth/entities/user.entity';

@ApiTags('Vehicles')
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new vehicle',
    description:
      'Owner only. Creates a new vehicle with PENDING_APPROVAL status.',
  })
  @ApiResponse({
    status: 201,
    description: 'Vehicle registered successfully',
    type: VehicleEntity,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - User is not an Owner' })
  @ApiResponse({ status: 409, description: 'License plate already exists' })
  async registerVehicle(
    @CurrentUser() user: UserEntity,
    @Body() dto: CreateVehicleDto,
  ): Promise<VehicleEntity> {
    return this.vehiclesService.registerVehicle(user.id, user.roles, dto);
  }

  @Get('my-vehicles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my vehicles',
    description: 'Get all vehicles owned by the current user.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of user vehicles',
    type: [VehicleEntity],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyVehicles(
    @CurrentUser() user: UserEntity,
  ): Promise<VehicleEntity[]> {
    return this.vehiclesService.getMyVehicles(user.id);
  }

  @Get('available')
  @ApiOperation({
    summary: 'Get available vehicles',
    description: 'Get all available vehicles for renting. Public endpoint.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by vehicle type',
  })
  @ApiQuery({
    name: 'minPrice',
    required: false,
    description: 'Minimum price per hour',
  })
  @ApiQuery({
    name: 'maxPrice',
    required: false,
    description: 'Maximum price per hour',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of results (default: 20)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Offset for pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'List of available vehicles',
  })
  async getAvailableVehicles(
    @Query('type') type?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ vehicles: VehicleEntity[]; total: number }> {
    return this.vehiclesService.getAvailableVehicles({
      type,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get vehicle by ID',
    description: 'Get detailed information about a specific vehicle.',
  })
  @ApiParam({ name: 'id', description: 'Vehicle ID' })
  @ApiResponse({
    status: 200,
    description: 'Vehicle details',
    type: VehicleEntity,
  })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async getVehicleById(@Param('id') id: string): Promise<VehicleEntity> {
    return this.vehiclesService.getVehicleById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update vehicle',
    description:
      'Owner only. Update vehicle information. Owners can only set status to AVAILABLE or MAINTENANCE.',
  })
  @ApiParam({ name: 'id', description: 'Vehicle ID' })
  @ApiResponse({
    status: 200,
    description: 'Vehicle updated successfully',
    type: VehicleEntity,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or invalid status change',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not the owner' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async updateVehicle(
    @Param('id') id: string,
    @CurrentUser() user: UserEntity,
    @Body() dto: UpdateVehicleDto,
  ): Promise<VehicleEntity> {
    return this.vehiclesService.updateVehicle(id, user.id, user.roles, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete vehicle',
    description:
      'Owner only. Delete a vehicle. Cannot delete if currently rented.',
  })
  @ApiParam({ name: 'id', description: 'Vehicle ID' })
  @ApiResponse({ status: 204, description: 'Vehicle deleted successfully' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete - vehicle is currently rented',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not the owner' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async deleteVehicle(
    @Param('id') id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.vehiclesService.deleteVehicle(id, user.id, user.roles);
  }
}
