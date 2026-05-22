import {
  Controller,
  Post,
  Get,
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
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { BookingEntity } from './entities/booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingLockDto } from './dto/booking-lock.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BookingStatus } from '@prisma/client';
import { BookingLockService } from './booking-lock.service';

@ApiTags('Bookings')
@Controller('bookings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly bookingLockService: BookingLockService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new booking',
    description: 'Renter creates a booking request for a vehicle',
  })
  @ApiResponse({
    status: 201,
    description: 'Booking created successfully',
    type: BookingEntity,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid booking data',
  })
  @ApiResponse({
    status: 409,
    description: 'Vehicle not available for selected time',
  })
  async createBooking(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateBookingDto,
  ): Promise<BookingEntity> {
    return this.bookingsService.createBooking(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get renter bookings',
    description: 'Get all bookings for the current user as renter',
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
  async getRenterBookings(
    @CurrentUser('id') userId: string,
    @Query('status') status?: BookingStatus,
  ): Promise<BookingEntity[]> {
    return this.bookingsService.getRenterBookings(userId, status);
  }

  @Get('upcoming')
  @ApiOperation({
    summary: 'Get upcoming bookings',
    description: 'Get confirmed/ongoing bookings that are upcoming',
  })
  @ApiResponse({
    status: 200,
    description: 'List of upcoming bookings',
    type: [BookingEntity],
  })
  async getUpcomingBookings(
    @CurrentUser('id') userId: string,
  ): Promise<BookingEntity[]> {
    return this.bookingsService.getUpcomingBookings(userId);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Get booking history',
    description: 'Get completed and cancelled bookings',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking history',
    type: [BookingEntity],
  })
  async getBookingHistory(
    @CurrentUser('id') userId: string,
  ): Promise<BookingEntity[]> {
    return this.bookingsService.getBookingHistory(userId);
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
    return this.bookingsService.getBookingById(id, userId);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel booking',
    description:
      'Cancel a booking. Both renter and owner can cancel. Policy: Owner cancel = full refund + penalty. Renter cancel = time-based refund policy.',
  })
  @ApiParam({
    name: 'id',
    description: 'Booking ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking cancelled successfully',
    type: BookingEntity,
  })
  @ApiResponse({
    status: 400,
    description: 'Booking cannot be cancelled',
  })
  async cancelBooking(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CancelBookingDto,
  ): Promise<BookingEntity> {
    return this.bookingsService.cancelBooking(id, userId, dto);
  }

  @Get('vehicle/:vehicleId/schedule')
  @ApiOperation({
    summary: 'Get vehicle booking schedule',
    description:
      'Get all active/upcoming bookings for a vehicle to show availability',
  })
  @ApiParam({
    name: 'vehicleId',
    description: 'Vehicle ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Vehicle booking schedule',
    type: [BookingEntity],
  })
  async getVehicleSchedule(
    @Param('vehicleId') vehicleId: string,
  ): Promise<BookingEntity[]> {
    return this.bookingsService.getVehicleSchedule(vehicleId);
  }

  @Post('lock')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create booking lock',
    description:
      'Creates a 15-minute soft lock on a vehicle time slot while the renter completes checkout. Prevents double-booking.',
  })
  @ApiResponse({
    status: 201,
    description: 'Lock created successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Time slot already locked or booked',
  })
  async createBookingLock(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateBookingLockDto,
  ): Promise<{ id: string; expiresAt: Date }> {
    return this.bookingLockService.createLock(
      dto.vehicleId,
      userId,
      new Date(dto.startTime),
      new Date(dto.endTime),
    );
  }

  @Delete('lock/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Release booking lock',
    description: 'Release a booking lock when the user cancels checkout',
  })
  @ApiParam({ name: 'id', description: 'Booking lock ID' })
  @ApiResponse({ status: 204, description: 'Lock released' })
  async releaseBookingLock(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.bookingLockService.releaseLock(id, userId);
  }
}
