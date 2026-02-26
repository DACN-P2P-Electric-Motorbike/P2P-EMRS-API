import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
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
import { BookingStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../../auth/guards';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AdminBookingsService } from '../services/admin-bookings.service';
import { QueryBookingsDto } from '../dto/query-bookings.dto';
import { UpdateBookingStatusDto } from '../dto/update-booking-status.dto';

@ApiTags('Admin – Bookings')
@Controller('admin/bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminBookingsController {
  constructor(private readonly bookingsService: AdminBookingsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all bookings (Admin)',
    description:
      'Get paginated list of all bookings. Filter by status, userId, vehicleId, or date range.',
  })
  @ApiQuery({ name: 'status', enum: BookingStatus, required: false })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: String,
    description: 'Filter by renter OR owner ID',
  })
  @ApiQuery({ name: 'vehicleId', required: false, type: String })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    example: '2023-10-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    example: '2023-10-31',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated booking list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – Admin only' })
  async getBookings(@Query() query: QueryBookingsDto) {
    const result = await this.bookingsService.getBookings(query);
    return { status: 'success', data: result };
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update booking status (Admin override)',
    description:
      'Admin can manually override booking status (e.g., for dispute resolution or system correction).',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({
    status: 200,
    description: 'Booking status updated',
    schema: {
      example: {
        status: 'success',
        data: { id: 'uuid', status: 'CANCELLED' },
        message: 'Booking status updated successfully',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async updateBookingStatus(
    @Param('id') bookingId: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    const updated = await this.bookingsService.updateBookingStatus(
      bookingId,
      dto,
    );
    return {
      status: 'success',
      data: updated,
      message: 'Booking status updated successfully',
    };
  }
}
