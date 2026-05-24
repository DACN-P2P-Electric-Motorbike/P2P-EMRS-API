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
import { DisputePostTripChargeDto } from './dto/dispute-post-trip-charge.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';
import { UpdatePayoutStatusDto } from './dto/update-payout-status.dto';
import {
  FinancialSummaryEntity,
  OwnerPayoutEntity,
} from './entities/financial.entity';
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

  @Post('charges/:chargeId/dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dispute a post-trip charge',
    description:
      'Renter-only dispute action for pending or approved post-trip charges before deposit capture.',
  })
  @ApiParam({ name: 'chargeId', description: 'Post-trip charge UUID' })
  @ApiResponse({ status: 200, type: FinancialSummaryEntity })
  async disputePostTripCharge(
    @Param('chargeId') chargeId: string,
    @CurrentUser('id') renterId: string,
    @Body() dto: DisputePostTripChargeDto,
  ): Promise<FinancialSummaryEntity> {
    return this.financialService.disputePostTripCharge(chargeId, renterId, dto);
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

  @Post('bookings/:bookingId/payout')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create or refresh owner payout',
    description:
      'Admin-only payout preparation. Calculates owner net rental plus finalized post-trip charges and holds payouts until trip, deposit, and incident blockers are cleared.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 200, type: OwnerPayoutEntity })
  async createOrRefreshOwnerPayout(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') adminId: string,
  ): Promise<OwnerPayoutEntity> {
    return this.financialService.createOrRefreshOwnerPayout(bookingId, adminId);
  }

  @Patch('payouts/:payoutId/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update owner payout status',
    description:
      'Admin-only payout operation for moving a payout through processing, completed, failed, or cancelled states.',
  })
  @ApiParam({ name: 'payoutId', description: 'Owner payout UUID' })
  @ApiResponse({ status: 200, type: OwnerPayoutEntity })
  async updateOwnerPayoutStatus(
    @Param('payoutId') payoutId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdatePayoutStatusDto,
  ): Promise<OwnerPayoutEntity> {
    return this.financialService.updateOwnerPayoutStatus(
      payoutId,
      adminId,
      dto,
    );
  }
}
