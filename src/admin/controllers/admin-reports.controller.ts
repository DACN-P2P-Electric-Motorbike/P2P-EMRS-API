import {
  Controller,
  Get,
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
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../../auth/guards';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AdminReportsService } from '../services/admin-reports.service';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

class TopListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

@ApiTags('Admin – Reports')
@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminReportsController {
  constructor(private readonly reportsService: AdminReportsService) {}

  @Get('top-vehicles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Top vehicles by booking count (Admin)',
    description: 'Returns the most rented vehicles ranked by completed booking count.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of vehicles to return (default: 10, max: 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'Top vehicles report',
    schema: {
      example: {
        status: 'success',
        data: [
          {
            vehicleId: 'uuid',
            totalBookings: 45,
            vehicle: {
              id: 'uuid',
              model: 'Klara',
              brand: 'VINFAST',
              licensePlate: '59A-12345',
              owner: { id: 'uuid', fullName: 'Nguyen Van A', email: 'a@gmail.com' },
            },
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – Admin only' })
  async getTopVehicles(@Query() query: TopListQueryDto) {
    const data = await this.reportsService.getTopVehicles(query.limit ?? 10);
    return { status: 'success', data };
  }

  @Get('top-owners')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Top owners by revenue (Admin)',
    description: 'Returns the highest-earning vehicle owners ranked by total revenue.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of owners to return (default: 10, max: 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'Top owners report',
    schema: {
      example: {
        status: 'success',
        data: [
          {
            ownerId: 'uuid',
            totalRevenue: 50000000,
            owner: {
              id: 'uuid',
              fullName: 'Tran Thi B',
              email: 'b@gmail.com',
              totalVehicles: 3,
            },
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – Admin only' })
  async getTopOwners(@Query() query: TopListQueryDto) {
    const data = await this.reportsService.getTopOwners(query.limit ?? 10);
    return { status: 'success', data };
  }
}
