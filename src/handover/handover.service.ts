import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, HandoverType, TripStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateHandoverDto } from './dto';
import {
  HandoverDifferencesEntity,
  HandoverSummaryEntity,
  VehicleHandoverEntity,
} from './entities/handover.entity';

@Injectable()
export class HandoverService {
  private readonly logger = new Logger(HandoverService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createCheckIn(
    userId: string,
    dto: CreateHandoverDto,
  ): Promise<VehicleHandoverEntity> {
    const booking = await this.findBookingForMutation(dto.bookingId, userId);

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        'Check-in is only available for confirmed bookings before trip start',
      );
    }

    if (booking.trip) {
      throw new BadRequestException(
        'Check-in must be completed before the trip starts',
      );
    }

    if (this.findExistingHandover(booking, HandoverType.CHECK_IN)) {
      throw new BadRequestException('Check-in handover already exists');
    }

    const handover = await this.prisma.vehicleHandover.create({
      data: {
        bookingId: booking.id,
        type: HandoverType.CHECK_IN,
        performedBy: userId,
        ...this.readingData(dto),
        confirmedByOwner: userId === booking.ownerId,
        confirmedByRenter: userId === booking.renterId,
        photos: {
          create: this.photoData(dto),
        },
      },
      include: this.handoverInclude(),
    });

    this.logger.log(`Check-in handover ${handover.id} created`);
    return VehicleHandoverEntity.fromPrisma(handover);
  }

  async createCheckOut(
    userId: string,
    dto: CreateHandoverDto,
  ): Promise<VehicleHandoverEntity> {
    const booking = await this.findBookingForMutation(dto.bookingId, userId);

    if (booking.status !== BookingStatus.ONGOING || !booking.trip) {
      throw new BadRequestException(
        'Check-out is only available for an ongoing trip',
      );
    }

    if (booking.trip.status !== TripStatus.ONGOING) {
      throw new BadRequestException(
        'Check-out is only available for an ongoing trip',
      );
    }

    const checkIn = this.findExistingHandover(
      booking,
      HandoverType.CHECK_IN,
    );
    if (!this.isComplete(checkIn)) {
      throw new BadRequestException(
        'Completed check-in handover is required before check-out',
      );
    }

    if (this.findExistingHandover(booking, HandoverType.CHECK_OUT)) {
      throw new BadRequestException('Check-out handover already exists');
    }

    const handover = await this.prisma.vehicleHandover.create({
      data: {
        bookingId: booking.id,
        tripId: booking.trip.id,
        type: HandoverType.CHECK_OUT,
        performedBy: userId,
        ...this.readingData(dto),
        confirmedByOwner: userId === booking.ownerId,
        confirmedByRenter: userId === booking.renterId,
        photos: {
          create: this.photoData(dto),
        },
      },
      include: this.handoverInclude(),
    });

    this.logger.log(`Check-out handover ${handover.id} created`);
    return VehicleHandoverEntity.fromPrisma(handover);
  }

  async getByBooking(
    bookingId: string,
    userId: string,
    roles: UserRole[] = [],
  ): Promise<HandoverSummaryEntity> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        handovers: {
          include: this.handoverInclude(),
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!booking || !this.canViewBooking(booking, userId, roles)) {
      throw new NotFoundException('Booking not found');
    }

    return this.toSummary(booking.id, booking.handovers);
  }

  async getAdminReviewQueue(limit = 50) {
    const take = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
    const bookings = await this.prisma.booking.findMany({
      where: {
        handovers: {
          some: {},
        },
      },
      include: {
        renter: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            trustScore: true,
          },
        },
        owner: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            trustScore: true,
          },
        },
        vehicle: {
          select: {
            id: true,
            brand: true,
            model: true,
            licensePlate: true,
            images: true,
          },
        },
        trip: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
          },
        },
        handovers: {
          include: this.handoverInclude(),
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take,
    });

    return bookings.map((booking) => ({
      booking: {
        id: booking.id,
        status: booking.status,
        startTime: booking.startTime,
        endTime: booking.endTime,
        renter: booking.renter,
        owner: booking.owner,
        vehicle: booking.vehicle,
        trip: booking.trip,
      },
      handover: this.toSummary(booking.id, booking.handovers),
    }));
  }

  async confirm(
    handoverId: string,
    userId: string,
  ): Promise<VehicleHandoverEntity> {
    const handover = await this.prisma.vehicleHandover.findUnique({
      where: { id: handoverId },
      include: {
        ...this.handoverInclude(),
        booking: {
          select: {
            renterId: true,
            ownerId: true,
          },
        },
      },
    });

    if (!handover) {
      throw new NotFoundException('Handover not found');
    }

    const data =
      userId === handover.booking.ownerId
        ? { confirmedByOwner: true }
        : userId === handover.booking.renterId
          ? { confirmedByRenter: true }
          : null;

    if (!data) {
      throw new NotFoundException('Handover not found');
    }

    const updated = await this.prisma.vehicleHandover.update({
      where: { id: handoverId },
      data,
      include: this.handoverInclude(),
    });

    return VehicleHandoverEntity.fromPrisma(updated);
  }

  private async findBookingForMutation(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        trip: true,
        handovers: {
          include: this.handoverInclude(),
        },
      },
    });

    if (!booking || !this.isBookingParticipant(booking, userId)) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  private handoverInclude() {
    return {
      photos: {
        orderBy: { createdAt: 'asc' as const },
      },
    };
  }

  private readingData(dto: CreateHandoverDto) {
    return {
      odometerReading: dto.odometerReading,
      batteryLevel: dto.batteryLevel,
      fuelLevel: dto.fuelLevel,
      latitude: dto.latitude,
      longitude: dto.longitude,
      notes: dto.notes?.trim() || null,
    };
  }

  private photoData(dto: CreateHandoverDto) {
    return dto.photos.map((photo) => ({
      photoUrl: photo.photoUrl,
      photoType: photo.photoType.trim(),
      latitude: photo.latitude,
      longitude: photo.longitude,
      capturedAt: photo.capturedAt ? new Date(photo.capturedAt) : new Date(),
    }));
  }

  private isBookingParticipant(
    booking: { renterId: string; ownerId: string },
    userId: string,
  ): boolean {
    return booking.renterId === userId || booking.ownerId === userId;
  }

  private canViewBooking(
    booking: { renterId: string; ownerId: string },
    userId: string,
    roles: UserRole[],
  ): boolean {
    return (
      roles.includes(UserRole.ADMIN) || this.isBookingParticipant(booking, userId)
    );
  }

  private findExistingHandover(
    booking: {
      handovers?: Array<{
        type: HandoverType;
        confirmedByOwner: boolean;
        confirmedByRenter: boolean;
      }>;
    },
    type: HandoverType,
  ) {
    return booking.handovers?.find((handover) => handover.type === type);
  }

  private isComplete(
    handover:
      | { confirmedByOwner: boolean; confirmedByRenter: boolean }
      | undefined,
  ): boolean {
    return Boolean(handover?.confirmedByOwner && handover.confirmedByRenter);
  }

  private toSummary(
    bookingId: string,
    handovers: Array<Parameters<typeof VehicleHandoverEntity.fromPrisma>[0]>,
  ): HandoverSummaryEntity {
    const checkIn = handovers.find((item) => item.type === HandoverType.CHECK_IN);
    const checkOut = handovers.find(
      (item) => item.type === HandoverType.CHECK_OUT,
    );

    return {
      bookingId,
      checkIn: checkIn ? VehicleHandoverEntity.fromPrisma(checkIn) : null,
      checkOut: checkOut ? VehicleHandoverEntity.fromPrisma(checkOut) : null,
      differences: this.calculateDifferences(checkIn, checkOut),
    };
  }

  private calculateDifferences(
    checkIn:
      | Parameters<typeof VehicleHandoverEntity.fromPrisma>[0]
      | undefined,
    checkOut:
      | Parameters<typeof VehicleHandoverEntity.fromPrisma>[0]
      | undefined,
  ): HandoverDifferencesEntity {
    const differences: HandoverDifferencesEntity = {};

    if (checkIn?.odometerReading != null && checkOut?.odometerReading != null) {
      differences.kmDriven =
        checkOut.odometerReading - checkIn.odometerReading;
    }
    if (checkIn?.batteryLevel != null && checkOut?.batteryLevel != null) {
      differences.batteryDelta = checkOut.batteryLevel - checkIn.batteryLevel;
    }
    if (checkIn?.fuelLevel != null && checkOut?.fuelLevel != null) {
      differences.fuelDelta = checkOut.fuelLevel - checkIn.fuelLevel;
    }

    return differences;
  }
}
