import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { AdminBookingsRepository } from '../repositories/admin-bookings.repository';
import { QueryBookingsDto } from '../dto/query-bookings.dto';
import { UpdateBookingStatusDto } from '../dto/update-booking-status.dto';

@Injectable()
export class AdminBookingsService {
  private readonly logger = new Logger(AdminBookingsService.name);

  constructor(
    private readonly bookingsRepository: AdminBookingsRepository,
  ) {}

  /**
   * Get paginated list of all bookings with optional filters
   */
  async getBookings(query: QueryBookingsDto) {
    const { bookings, total } = await this.bookingsRepository.findMany(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    return {
      data: bookings,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin override: update booking status manually
   */
  async updateBookingStatus(bookingId: string, dto: UpdateBookingStatusDto) {
    const booking = await this.bookingsRepository.findById(bookingId);

    if (!booking) {
      throw new NotFoundException(`Booking with ID "${bookingId}" not found`);
    }

    const updated = await this.bookingsRepository.updateStatus(
      bookingId,
      dto.status,
    );

    this.logger.log(
      `Admin updated booking ${bookingId}: ${booking.status} → ${dto.status}`,
    );

    return updated;
  }
}
