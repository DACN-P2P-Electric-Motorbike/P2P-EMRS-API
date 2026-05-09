import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { TripEntity } from './entities/trip.entity';
import { StartTripDto } from './dto/start-trip.dto';
import { EndTripDto } from './dto/end-trip.dto';
import { ReportIssueDto } from './dto/report-issue.dto';
import {
  TripStatus,
  BookingStatus,
  PaymentStatus,
  VehicleStatus,
} from '@prisma/client';
import { TripIssueReportedEvent } from '../events/admin.events';
import { TripStartedEvent, TripCompletedEvent } from '../events/trip.events';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);
  private readonly START_EARLY_GRACE_MS = 15 * 60 * 1000;
  private readonly START_LATE_GRACE_MS = 2 * 60 * 60 * 1000;
  private readonly MIN_TRIP_DURATION_MS = 2 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
      include: { trip: true, payment: true },
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

    if (booking.payment?.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException(
        'Payment must be completed before starting the trip',
      );
    }

    if (dto.startLatitude == null || dto.startLongitude == null) {
      throw new BadRequestException('Start location is required to start trip');
    }

    // Check if trip already exists
    if (booking.trip) {
      throw new BadRequestException('Trip has already been started');
    }

    // Check if current time is within the allowed pickup window
    const now = new Date();
    const earliestStart = new Date(
      booking.startTime.getTime() - this.START_EARLY_GRACE_MS,
    );
    const latestStart = new Date(
      booking.startTime.getTime() + this.START_LATE_GRACE_MS,
    );
    if (now < earliestStart) {
      throw new BadRequestException(
        'Cannot start trip more than 15 minutes before booking start time',
      );
    }
    if (now > latestStart) {
      throw new BadRequestException(
        'Cannot start trip more than 2 hours after booking start time',
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

      await tx.vehicle.update({
        where: { id: booking.vehicleId },
        data: { status: VehicleStatus.RENTED },
      });

      return newTrip;
    });

    this.logger.log(`Trip ${trip.id} started successfully`);

    // Emit event so owner gets notified
    this.eventEmitter.emit(
      'trip.started',
      new TripStartedEvent(
        trip.id,
        trip.bookingId,
        userId,
        booking.ownerId,
        trip.vehicleId,
      ),
    );

    return TripEntity.fromPrisma(trip, { includeExactLocation: true });
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
    if (durationMs < this.MIN_TRIP_DURATION_MS) {
      throw new BadRequestException(
        'Trip cannot be ended less than 2 minutes after it starts',
      );
    }
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
        data: {
          status: VehicleStatus.AVAILABLE,
          totalTrips: { increment: 1 },
        },
      });

      return updated;
    });

    this.logger.log(
      `Trip ${tripId} completed. Distance: ${distanceTraveled.toFixed(2)}km, Duration: ${durationMinutes}min`,
    );

    // Reward renter with +2 trust score for completing a trip
    await this.adjustTrustScore(trip.renterId, 2);

    // Emit event so both renter and owner get notified
    this.eventEmitter.emit(
      'trip.completed',
      new TripCompletedEvent(
        tripId,
        trip.bookingId,
        trip.renterId,
        trip.booking.ownerId,
        trip.vehicleId,
        distanceTraveled,
        durationMinutes,
      ),
    );

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

    return TripEntity.fromPrisma(trip, {
      includeExactLocation: trip.status === TripStatus.ONGOING,
    });
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

    return trip
      ? TripEntity.fromPrisma(trip, { includeExactLocation: true })
      : null;
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

    // NOTE: Trust score is NOT auto-adjusted here. The renter is reporting
    // a problem (e.g. vehicle breakdown) and should not be penalised for it.
    // An admin review event is emitted instead; the admin can act on it.
    this.logger.log(
      `Issue reported for trip ${tripId}: ${dto.issueDescription}`,
    );

    // Emit admin alert event
    this.eventEmitter.emit(
      'trip.issue_reported',
      new TripIssueReportedEvent(
        updatedTrip.id,
        updatedTrip.renterId,
        updatedTrip.vehicleId,
        dto.issueDescription,
      ),
    );

    return TripEntity.fromPrisma(updatedTrip, { includeExactLocation: true });
  }

  private async adjustTrustScore(userId: string, delta: number): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const newScore = Math.min(100, Math.max(0, user.trustScore + delta));
    await this.prisma.user.update({
      where: { id: userId },
      data: { trustScore: newScore },
    });
    this.logger.log(
      `Trust score for user ${userId}: ${user.trustScore} -> ${newScore} (delta: ${delta})`,
    );
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
