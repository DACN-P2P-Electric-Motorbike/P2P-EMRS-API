import {
  Controller,
  Get,
  Patch,
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
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { OwnerBookingsService } from './owner-bookings.service';
import { BookingEntity } from './entities/booking.entity';
import { ApproveBookingDto, RejectBookingDto } from './dto/owner-booking.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BookingStatus } from '@prisma/client';

@ApiTags('Owner Bookings')
@Controller('owner/bookings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OwnerBookingsController {
  constructor(private readonly ownerBookingsService: OwnerBookingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get owner bookings',
    description: 'Get all bookings for vehicles owned by the current user',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: BookingStatus,
    description: 'Filter by booking status',
  })
  @ApiResponse({
    status: 200,
    description: 'List of bookings',
    type: [BookingEntity],
  })
  async getOwnerBookings(
    @CurrentUser('id') userId: string,
    @Query('status') status?: BookingStatus,
  ): Promise<BookingEntity[]> {
    return this.ownerBookingsService.getOwnerBookings(userId, status);
  }

  @Get('pending')
  @ApiOperation({
    summary: 'Get pending bookings',
    description: 'Get all pending booking requests for owner vehicles',
  })
  @ApiResponse({
    status: 200,
    description: 'List of pending bookings',
    type: [BookingEntity],
  })
  async getPendingBookings(
    @CurrentUser('id') userId: string,
  ): Promise<BookingEntity[]> {
    return this.ownerBookingsService.getPendingBookings(userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get booking details',
    description: 'Get detailed information about a specific booking',
  })
  @ApiParam({
    name: 'id',
    description: 'Booking ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking details',
    type: BookingEntity,
  })
  @ApiResponse({
    status: 404,
    description: 'Booking not found',
  })
  async getBooking(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<BookingEntity> {
    return this.ownerBookingsService.getOwnerBookingById(id, userId);
  }

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve booking',
    description: 'Owner approves a booking request',
  })
  @ApiParam({
    name: 'id',
    description: 'Booking ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking approved successfully',
    type: BookingEntity,
  })
  @ApiResponse({
    status: 400,
    description: 'Booking cannot be approved',
  })
  async approveBooking(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ApproveBookingDto,
  ): Promise<BookingEntity> {
    return this.ownerBookingsService.approveBooking(id, userId, dto);
  }

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject booking',
    description: 'Owner rejects a booking request',
  })
  @ApiParam({
    name: 'id',
    description: 'Booking ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking rejected successfully',
    type: BookingEntity,
  })
  @ApiResponse({
    status: 400,
    description: 'Booking cannot be rejected',
  })
  async rejectBooking(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RejectBookingDto,
  ): Promise<BookingEntity> {
    return this.ownerBookingsService.rejectBooking(id, userId, dto);
  }
}