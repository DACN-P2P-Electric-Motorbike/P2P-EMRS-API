import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TripEntity } from './entities/trip.entity';
import { StartTripDto } from './dto/start-trip.dto';
import { EndTripDto } from './dto/end-trip.dto';
import { ReportIssueDto } from './dto/report-issue.dto';
import { TripStatus, BookingStatus } from '@prisma/client';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Start a trip
   */
  async startTrip(userId: string, dto: StartTripDto): Promise<TripEntity> {
    this.logger.log(
      `User ${userId} starting trip for booking ${dto.bookingId}`,
    );

    // Get booking details
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { trip: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Verify user is the renter
    if (booking.renterId !== userId) {
      throw new BadRequestException('You can only start your own trips');
    }

    // Check booking status
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        'Can only start trip for confirmed bookings',
      );
    }

    // Check if trip already exists
    if (booking.trip) {
      throw new BadRequestException('Trip has already been started');
    }

    // Check if current time is within booking window
    const now = new Date();
    if (now < booking.startTime) {
      throw new BadRequestException(
        'Cannot start trip before booking start time',
      );
    }

    // Create trip
    const trip = await this.prisma.$transaction(async (tx) => {
      // Create trip record
      const newTrip = await tx.trip.create({
        data: {
          bookingId: dto.bookingId,
          renterId: userId,
          vehicleId: booking.vehicleId,
          status: TripStatus.ONGOING,
          startLatitude: dto.startLatitude,
          startLongitude: dto.startLongitude,
          startAddress: dto.startAddress,
          startBattery: dto.startBattery,
          startedAt: now,
        },
      });

      // Update booking status
      await tx.booking.update({
        where: { id: dto.bookingId },
        data: { status: BookingStatus.ONGOING },
      });

      return newTrip;
    });

    this.logger.log(`Trip ${trip.id} started successfully`);

    // TODO: Send notification to owner that trip has started
    // TODO: Start tracking vehicle location in real-time

    return TripEntity.fromPrisma(trip);
  }

  /**
   * End a trip
   */
  async endTrip(
    tripId: string,
    userId: string,
    dto: EndTripDto,
  ): Promise<TripEntity> {
    this.logger.log(`User ${userId} ending trip ${tripId}`);

    // Get trip details
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { booking: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    // Verify user is the renter
    if (trip.renterId !== userId) {
      throw new BadRequestException('You can only end your own trips');
    }

    // Check trip status
    if (trip.status !== TripStatus.ONGOING) {
      throw new BadRequestException('Can only end ongoing trips');
    }

    if (!trip.startedAt || !trip.startLatitude || !trip.startLongitude) {
      throw new BadRequestException('Trip start data is missing');
    }

    // Calculate trip metrics
    const endTime = new Date();
    const durationMs = endTime.getTime() - trip.startedAt.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));

    const distanceTraveled = this.calculateDistance(
      trip.startLatitude,
      trip.startLongitude,
      dto.endLatitude,
      dto.endLongitude,
    );

    // Update trip
    const updatedTrip = await this.prisma.$transaction(async (tx) => {
      // Update trip record
      const updated = await tx.trip.update({
        where: { id: tripId },
        data: {
          status: TripStatus.COMPLETED,
          endLatitude: dto.endLatitude,
          endLongitude: dto.endLongitude,
          endAddress: dto.endAddress,
          endBattery: dto.endBattery,
          distanceTraveled,
          duration: durationMinutes,
          hasIssues: dto.hasIssues || false,
          issueDescription: dto.issueDescription,
          completedAt: endTime,
        },
      });

      // Update booking status
      await tx.booking.update({
        where: { id: trip.bookingId },
        data: { status: BookingStatus.COMPLETED },
      });

      // Update vehicle total trips
      await tx.vehicle.update({
        where: { id: trip.vehicleId },
        data: { totalTrips: { increment: 1 } },
      });

      return updated;
    });

    this.logger.log(
      `Trip ${tripId} completed. Distance: ${distanceTraveled.toFixed(2)}km, Duration: ${durationMinutes}min`,
    );

    // TODO: Send notification to owner that trip has ended
    // TODO: Trigger payment processing

    return TripEntity.fromPrisma(updatedTrip);
  }

  /**
   * Get trip by ID
   */
  async getTripById(tripId: string, userId: string): Promise<TripEntity> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        booking: {
          include: {
            vehicle: true,
            owner: {
              select: {
                fullName: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    // Verify access
    if (trip.renterId !== userId && trip.booking.ownerId !== userId) {
      throw new NotFoundException('Trip not found');
    }

    return TripEntity.fromPrisma(trip);
  }

  /**
   * Get active trip for user
   */
  async getActiveTrip(userId: string): Promise<TripEntity | null> {
    const trip = await this.prisma.trip.findFirst({
      where: {
        renterId: userId,
        status: TripStatus.ONGOING,
      },
      include: {
        booking: {
          include: {
            vehicle: true,
          },
        },
      },
    });

    return trip ? TripEntity.fromPrisma(trip) : null;
  }

  /**
   * Report issue during trip
   */
  async reportIssue(
    tripId: string,
    userId: string,
    dto: ReportIssueDto,
  ): Promise<TripEntity> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    if (trip.renterId !== userId) {
      throw new BadRequestException(
        'You can only report issues for your own trips',
      );
    }

    if (trip.status !== TripStatus.ONGOING) {
      throw new BadRequestException('Can only report issues for ongoing trips');
    }

    const updatedTrip = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        hasIssues: true,
        issueDescription: dto.issueDescription,
      },
    });

    this.logger.log(
      `Issue reported for trip ${tripId}: ${dto.issueDescription}`,
    );

    // TODO: Send notification to owner about the issue

    return TripEntity.fromPrisma(updatedTrip);
  }

  /**
   * Get trip history for user
   */
  async getTripHistory(userId: string): Promise<TripEntity[]> {
    const trips = await this.prisma.trip.findMany({
      where: {
        renterId: userId,
        status: TripStatus.COMPLETED,
      },
      include: {
        booking: {
          include: {
            vehicle: {
              select: {
                name: true,
                brand: true,
                model: true,
                images: true,
              },
            },
          },
        },
      },
      orderBy: { completedAt: 'desc' },
      take: 50,
    });

    return trips.map((t) => TripEntity.fromPrisma(t));
  }
}
