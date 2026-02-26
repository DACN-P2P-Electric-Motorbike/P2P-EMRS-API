import { Controller, Get, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
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
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { DashboardQueryDto, DashboardPeriod } from '../dto/dashboard-query.dto';

@ApiTags('Admin – Dashboard')
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin Dashboard metrics',
    description: `Returns revenue, bookings, users, vehicle metrics, 12-month chart data, and recent transactions.

**Period values**: \`this_month\` (default) | \`last_month\` | \`this_year\` | \`all_time\`

**Custom range**: Provide \`startDate\` + \`endDate\` (ISO 8601) to override period.`,
  })
  @ApiQuery({
    name: 'period',
    enum: DashboardPeriod,
    required: false,
    description: 'Predefined period (ignored if startDate+endDate given)',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Custom start date (ISO 8601). Overrides period.',
    example: '2023-10-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Custom end date (ISO 8601). Overrides period.',
    example: '2023-10-31',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data',
    schema: {
      example: {
        status: 'success',
        data: {
          metrics: {
            revenue: {
              total: 50000000,
              previous_period: 40000000,
              growth_percent: 25,
            },
            bookings: {
              total: 500,
              active: 20,
              pending: 5,
              this_period: 80,
              growth_percent: 15.5,
            },
            users: {
              total: 1200,
              new_this_period: 45,
              growth_percent: 10.2,
            },
            vehicles: {
              total: 80,
              available: 60,
              rented: 12,
              maintenance: 5,
              pendingApproval: 3,
            },
          },
          chart_data: [
            { month: 'Jan', revenue: 10000000, bookings: 120 },
            { month: 'Feb', revenue: 12000000, bookings: 140 },
          ],
          recent_transactions: [
            {
              id: 'uuid',
              user_name: 'Nguyen Van A',
              vehicle_name: 'VINFAST Klara',
              amount: 2500000,
              status: 'COMPLETED',
              date: '2023-10-25T10:00:00Z',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – Admin only' })
  async getDashboard(@Query() query: DashboardQueryDto) {
    const data = await this.dashboardService.getDashboard(query);
    return { status: 'success', data };
  }
}
