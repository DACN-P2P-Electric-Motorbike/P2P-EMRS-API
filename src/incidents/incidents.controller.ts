import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CreateIncidentReportDto, UpdateIncidentStatusDto } from './dto';
import { IncidentReportEntity } from './entities';
import { IncidentsService } from './incidents.service';

@ApiTags('Incidents')
@Controller('incidents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an incident report',
    description:
      'Booking participants and admins can report structured incidents. Damage, accident, theft, vehicle mismatch, and critical incidents require evidence.',
  })
  @ApiResponse({ status: 201, type: IncidentReportEntity })
  async createReport(
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: UserRole[] = [],
    @Body() dto: CreateIncidentReportDto,
  ): Promise<IncidentReportEntity> {
    return this.incidentsService.createReport(userId, roles, dto);
  }

  @Get('admin/queue')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List open incidents for admin review',
  })
  async getAdminQueue(@Query('limit') limit?: string) {
    return {
      status: 'success',
      data: await this.incidentsService.getAdminQueue(Number(limit)),
    };
  }

  @Get('bookings/:bookingId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List incident reports for a booking',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 200, type: [IncidentReportEntity] })
  async listForBooking(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: UserRole[] = [],
  ): Promise<IncidentReportEntity[]> {
    return this.incidentsService.listForBooking(bookingId, userId, roles);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Review or resolve an incident report',
  })
  @ApiParam({ name: 'id', description: 'Incident report UUID' })
  @ApiResponse({ status: 200, type: IncidentReportEntity })
  async updateStatus(
    @Param('id') reportId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateIncidentStatusDto,
  ): Promise<IncidentReportEntity> {
    return this.incidentsService.updateStatus(reportId, adminId, dto);
  }
}
