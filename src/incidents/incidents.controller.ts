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
import { ClaimCaseStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import {
  CreateEvidenceAnnotationDto,
  CreateIncidentReportDto,
  ReviewClaimCaseDto,
  UpdateClaimCaseAssignmentDto,
  UpdateIncidentStatusDto,
} from './dto';
import {
  BookingClaimSummaryEntity,
  ClaimCaseAssignmentFilter,
  ClaimCaseEntity,
  ClaimCaseQueueSummaryEntity,
  ClaimCaseSlaStatus,
  ClaimCaseSlaStage,
  EvidenceAnnotationEntity,
  IncidentReportEntity,
} from './entities';
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

  @Get('bookings/:bookingId/claim-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get unified claim workflow summary for a booking',
    description:
      'Aggregates incidents, post-trip charges, deposit state, and owner payout state so participant and admin clients can show one claim timeline.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 200, type: BookingClaimSummaryEntity })
  async getClaimSummaryForBooking(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: UserRole[] = [],
  ): Promise<BookingClaimSummaryEntity> {
    return this.incidentsService.getClaimSummaryForBooking(
      bookingId,
      userId,
      roles,
    );
  }

  @Get('bookings/:bookingId/evidence-annotations')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List admin evidence annotations for a booking claim review',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 200, type: [EvidenceAnnotationEntity] })
  async listEvidenceAnnotationsForBooking(
    @Param('bookingId') bookingId: string,
  ) {
    return {
      status: 'success',
      data: await this.incidentsService.listEvidenceAnnotationsForBooking(
        bookingId,
      ),
    };
  }

  @Post('bookings/:bookingId/evidence-annotations')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add an admin annotation to claim evidence',
    description:
      'Annotations can point at incident reports, post-trip charges, vehicle handovers, or individual handover photos owned by the booking.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 201, type: EvidenceAnnotationEntity })
  async createEvidenceAnnotation(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateEvidenceAnnotationDto,
  ): Promise<EvidenceAnnotationEntity> {
    return this.incidentsService.createEvidenceAnnotation(
      bookingId,
      adminId,
      dto,
    );
  }

  @Post('bookings/:bookingId/claim-case')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create or refresh a durable claim case for a booking',
    description:
      'Creates an auditable claim case from existing incident, financial, deposit, and payout state. Existing open cases are refreshed with the latest snapshot.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 201, type: ClaimCaseEntity })
  async createOrRefreshClaimCase(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') adminId: string,
  ): Promise<ClaimCaseEntity> {
    return this.incidentsService.createOrRefreshClaimCase(bookingId, adminId);
  }

  @Get('admin/claim-cases/summary')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get claim-case workload summary for admin triage',
  })
  @ApiResponse({ status: 200, type: ClaimCaseQueueSummaryEntity })
  async getAdminClaimCaseQueueSummary(@CurrentUser('id') adminId: string) {
    return {
      status: 'success',
      data: await this.incidentsService.getAdminClaimCaseQueueSummary(adminId),
    };
  }

  @Get('admin/claim-cases')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List claim cases for admin review',
  })
  async getAdminClaimCases(
    @CurrentUser('id') adminId: string,
    @Query('status') status?: string,
    @Query('slaStatus') slaStatus?: string,
    @Query('slaStage') slaStage?: string,
    @Query('assignment') assignment?: string,
    @Query('limit') limit?: string,
  ) {
    const claimCaseStatus = Object.values(ClaimCaseStatus).includes(
      status as ClaimCaseStatus,
    )
      ? (status as ClaimCaseStatus)
      : undefined;
    const claimCaseSlaStatus = Object.values(ClaimCaseSlaStatus).includes(
      slaStatus as ClaimCaseSlaStatus,
    )
      ? (slaStatus as ClaimCaseSlaStatus)
      : undefined;
    const claimCaseSlaStage = Object.values(ClaimCaseSlaStage).includes(
      slaStage as ClaimCaseSlaStage,
    )
      ? (slaStage as ClaimCaseSlaStage)
      : undefined;
    const claimCaseAssignment = Object.values(
      ClaimCaseAssignmentFilter,
    ).includes(assignment as ClaimCaseAssignmentFilter)
      ? (assignment as ClaimCaseAssignmentFilter)
      : undefined;

    return {
      status: 'success',
      data: await this.incidentsService.getAdminClaimCases({
        status: claimCaseStatus,
        slaStatus: claimCaseSlaStatus,
        slaStage: claimCaseSlaStage,
        assignment: claimCaseAssignment,
        adminId,
        limit: Number(limit),
      }),
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

  @Patch('claim-cases/:id/review')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit a four-eyes claim case review decision',
    description:
      'The first Admin review moves the case to pending second review. A different Admin must submit the same decision to finalize the case.',
  })
  @ApiParam({ name: 'id', description: 'Claim case UUID' })
  @ApiResponse({ status: 200, type: ClaimCaseEntity })
  async reviewClaimCase(
    @Param('id') claimCaseId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ReviewClaimCaseDto,
  ): Promise<ClaimCaseEntity> {
    return this.incidentsService.reviewClaimCase(claimCaseId, adminId, dto);
  }

  @Patch('claim-cases/:id/assignment')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign or release a claim case for Admin ownership',
  })
  @ApiParam({ name: 'id', description: 'Claim case UUID' })
  @ApiResponse({ status: 200, type: ClaimCaseEntity })
  async updateClaimCaseAssignment(
    @Param('id') claimCaseId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateClaimCaseAssignmentDto,
  ): Promise<ClaimCaseEntity> {
    return this.incidentsService.updateClaimCaseAssignment(
      claimCaseId,
      adminId,
      dto,
    );
  }
}
