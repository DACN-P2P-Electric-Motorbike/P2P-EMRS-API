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
import { CreatePostTripChargeDto } from './dto/create-post-trip-charge.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';
import { FinancialSummaryEntity } from './entities/financial.entity';
import { FinancialService } from './financial.service';

@ApiTags('Financial')
@Controller('financial')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Get('admin/queue')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List financial operations queue',
    description:
      'Admin-only queue of deposits and post-trip charges that need review, capture, or release.',
  })
  async getAdminFinancialQueue(@Query('limit') limit?: string) {
    return {
      status: 'success',
      data: await this.financialService.getAdminFinancialQueue(Number(limit)),
    };
  }

  @Get('bookings/:bookingId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get booking financial summary',
    description:
      'Returns deposit ledger state and post-trip charges for a booking participant or admin.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 200, type: FinancialSummaryEntity })
  async getBookingFinancialSummary(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: UserRole[] = [],
  ): Promise<FinancialSummaryEntity> {
    return this.financialService.getBookingFinancialSummary(
      bookingId,
      userId,
      roles,
    );
  }

  @Post('bookings/:bookingId/recalculate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recalculate post-trip charges',
    description:
      'Admin-only idempotent recalculation from trip timing, handover readings, and listing policies.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 200, type: FinancialSummaryEntity })
  async recalculatePostTripCharges(
    @Param('bookingId') bookingId: string,
  ): Promise<FinancialSummaryEntity> {
    return this.financialService.recalculatePostTripChargesForBooking(
      bookingId,
    );
  }

  @Post('bookings/:bookingId/charges')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a manual post-trip charge',
    description:
      'Owner/admin charge submission for cleaning, damage, roadside assistance, or other approved post-trip fees. Owner submissions require admin review; admin submissions are approved immediately.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 201, type: FinancialSummaryEntity })
  async createManualPostTripCharge(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: UserRole[] = [],
    @Body() dto: CreatePostTripChargeDto,
  ): Promise<FinancialSummaryEntity> {
    return this.financialService.createManualPostTripCharge(
      bookingId,
      userId,
      roles,
      dto,
    );
  }

  @Patch('charges/:chargeId/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Review a post-trip charge',
    description:
      'Admin-only charge review. Approve, waive, dispute, or cancel a pending charge.',
  })
  @ApiParam({ name: 'chargeId', description: 'Post-trip charge UUID' })
  @ApiResponse({ status: 200, type: FinancialSummaryEntity })
  async updateChargeStatus(
    @Param('chargeId') chargeId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateChargeStatusDto,
  ): Promise<FinancialSummaryEntity> {
    return this.financialService.updateChargeStatus(chargeId, adminId, dto);
  }

  @Post('bookings/:bookingId/capture-approved')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Capture approved charges from deposit',
    description:
      'Admin-only ledger operation. Marks approved post-trip charges as deducted from the held deposit.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 200, type: FinancialSummaryEntity })
  async captureApprovedCharges(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') adminId: string,
  ): Promise<FinancialSummaryEntity> {
    return this.financialService.captureApprovedChargesFromDeposit(
      bookingId,
      adminId,
    );
  }

  @Post('bookings/:bookingId/release-deposit')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Release remaining deposit',
    description:
      'Admin-only ledger operation. Records remaining deposit as releasable/released after all charges are resolved.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 200, type: FinancialSummaryEntity })
  async releaseDeposit(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') adminId: string,
  ): Promise<FinancialSummaryEntity> {
    return this.financialService.releaseDeposit(bookingId, adminId);
  }
}
