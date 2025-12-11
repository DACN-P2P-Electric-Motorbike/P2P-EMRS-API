import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { VehicleEntity } from './entities/vehicle.entity';
import {
  SearchVehiclesDto,
  SearchVehiclesResponseDto,
} from './dto/search-vehicles.dto';
import { JwtAuthGuard } from '../auth/guards';

@ApiTags('Vehicles')
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Search vehicles near location',
    description:
      'Find available vehicles within specified radius from user location',
  })
  @ApiResponse({
    status: 200,
    description: 'List of vehicles found',
    type: SearchVehiclesResponseDto,
  })
  async searchVehicles(
    @Query() dto: SearchVehiclesDto,
  ): Promise<SearchVehiclesResponseDto> {
    return this.vehiclesService.searchVehicles(dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get vehicle details',
    description: 'Get detailed information about a specific vehicle',
  })
  @ApiParam({
    name: 'id',
    description: 'Vehicle ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Vehicle details',
    type: VehicleEntity,
  })
  @ApiResponse({
    status: 404,
    description: 'Vehicle not found',
  })
  async getVehicle(@Param('id') id: string): Promise<VehicleEntity> {
    return this.vehiclesService.getVehicleById(id);
  }
}
