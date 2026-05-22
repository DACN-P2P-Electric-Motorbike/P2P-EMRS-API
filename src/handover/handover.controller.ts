import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { JwtAuthGuard } from '../auth/guards';
import { CreateHandoverDto } from './dto';
import {
  HandoverSummaryEntity,
  VehicleHandoverEntity,
} from './entities/handover.entity';
import { HandoverService } from './handover.service';

@ApiTags('Handover')
@Controller('handover')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class HandoverController {
  constructor(private readonly handoverService: HandoverService) {}

  @Post('check-in')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create booking check-in handover' })
  @ApiResponse({
    status: 201,
    description: 'Check-in handover created',
    type: VehicleHandoverEntity,
  })
  createCheckIn(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateHandoverDto,
  ): Promise<VehicleHandoverEntity> {
    return this.handoverService.createCheckIn(userId, dto);
  }

  @Post('check-out')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create booking check-out handover' })
  @ApiResponse({
    status: 201,
    description: 'Check-out handover created',
    type: VehicleHandoverEntity,
  })
  createCheckOut(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateHandoverDto,
  ): Promise<VehicleHandoverEntity> {
    return this.handoverService.createCheckOut(userId, dto);
  }

  @Get(':bookingId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get handover summary for a booking' })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({
    status: 200,
    description: 'Booking handover summary',
    type: HandoverSummaryEntity,
  })
  getByBooking(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: UserRole[],
  ): Promise<HandoverSummaryEntity> {
    return this.handoverService.getByBooking(bookingId, userId, roles);
  }

  @Patch(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm owner/renter sign-off for a handover' })
  @ApiParam({ name: 'id', description: 'Handover UUID' })
  @ApiResponse({
    status: 200,
    description: 'Handover confirmed',
    type: VehicleHandoverEntity,
  })
  confirm(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<VehicleHandoverEntity> {
    return this.handoverService.confirm(id, userId);
  }
}
