import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DepositLedgerStatus,
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateIncidentReportDto, UpdateIncidentStatusDto } from './dto';
import { IncidentReportEntity } from './entities';

const EVIDENCE_REQUIRED_CATEGORIES = new Set<IncidentCategory>([
  IncidentCategory.ACCIDENT,
  IncidentCategory.DAMAGE,
  IncidentCategory.THEFT,
  IncidentCategory.VEHICLE_MISMATCH,
]);

const DEPOSIT_HOLD_CATEGORIES = new Set<IncidentCategory>([
  IncidentCategory.ACCIDENT,
  IncidentCategory.DAMAGE,
  IncidentCategory.THEFT,
  IncidentCategory.VEHICLE_MISMATCH,
  IncidentCategory.LATE_RETURN,
]);

const OPEN_INCIDENT_STATUSES = [
  IncidentStatus.OPEN,
  IncidentStatus.UNDER_REVIEW,
] as const;

type IncidentBooking = Prisma.BookingGetPayload<{
  include: {
    trip: true;
    depositLedger: true;
    postTripCharges: {
      select: {
        id: true;
      };
    };
    handovers: {
      include: {
        photos: true;
      };
    };
  };
}>;

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createReport(
    userId: string,
    roles: UserRole[] = [],
    dto: CreateIncidentReportDto,
  ): Promise<IncidentReportEntity> {
    const booking = await this.findBookingForIncident(dto.bookingId);

    if (!booking || !this.canViewBooking(booking, userId, roles)) {
      throw new NotFoundException('Booking not found');
    }

    const report = await this.createForBooking(booking, userId, dto);
    this.logger.log(
      `Incident ${report.id} created for booking ${report.bookingId}`,
    );
    return report;
  }

  async createFromTripIssue(input: {
    tripId: string;
    bookingId: string;
    reporterId: string;
    description: string;
    category?: IncidentCategory;
    severity?: IncidentSeverity;
    evidenceUrls?: string[];
  }): Promise<IncidentReportEntity> {
    return this.createReport(input.reporterId, [], {
      bookingId: input.bookingId,
      tripId: input.tripId,
      category: input.category ?? IncidentCategory.MECHANICAL_ISSUE,
      severity: input.severity ?? IncidentSeverity.MEDIUM,
      description: input.description,
      evidenceUrls: input.evidenceUrls,
    });
  }

  async listForBooking(
    bookingId: string,
    userId: string,
    roles: UserRole[] = [],
  ): Promise<IncidentReportEntity[]> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        renterId: true,
        ownerId: true,
      },
    });

    if (!booking || !this.canViewBooking(booking, userId, roles)) {
      throw new NotFoundException('Booking not found');
    }

    const reports = await this.prisma.incidentReport.findMany({
      where: { bookingId },
      include: this.incidentInclude(),
      orderBy: { createdAt: 'desc' },
    });

    return reports.map(IncidentReportEntity.fromPrisma);
  }

  async getAdminQueue(limit = 50): Promise<IncidentReportEntity[]> {
    const take = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
    const reports = await this.prisma.incidentReport.findMany({
      where: {
        status: { in: [...OPEN_INCIDENT_STATUSES] },
      },
      include: this.incidentInclude(),
      orderBy: { createdAt: 'desc' },
      take,
    });

    return reports.map(IncidentReportEntity.fromPrisma);
  }

  async updateStatus(
    reportId: string,
    adminId: string,
    dto: UpdateIncidentStatusDto,
  ): Promise<IncidentReportEntity> {
    if (
      ![
        IncidentStatus.UNDER_REVIEW,
        IncidentStatus.RESOLVED,
        IncidentStatus.REJECTED,
      ].includes(dto.status)
    ) {
      throw new BadRequestException('Unsupported incident review status');
    }

    const report = await this.prisma.incidentReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Incident report not found');
    }

    if (
      report.status === IncidentStatus.RESOLVED ||
      report.status === IncidentStatus.REJECTED
    ) {
      throw new BadRequestException('Finalized incidents cannot be changed');
    }

    const now = new Date();
    const updated = await this.prisma.incidentReport.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        adminNotes: dto.adminNotes?.trim() || null,
        reviewedBy: adminId,
        reviewedAt: now,
        resolvedAt:
          dto.status === IncidentStatus.RESOLVED ||
          dto.status === IncidentStatus.REJECTED
            ? now
            : null,
      },
      include: this.incidentInclude(),
    });

    return IncidentReportEntity.fromPrisma(updated);
  }

  static openStatuses(): IncidentStatus[] {
    return [...OPEN_INCIDENT_STATUSES];
  }

  private async createForBooking(
    booking: IncidentBooking,
    userId: string,
    dto: CreateIncidentReportDto,
  ): Promise<IncidentReportEntity> {
    const description = dto.description?.trim();
    if (!description) {
      throw new BadRequestException('Incident description is required');
    }

    const tripId = dto.tripId ?? booking.trip?.id ?? null;
    if (dto.tripId && dto.tripId !== booking.trip?.id) {
      throw new BadRequestException(
        'Incident trip must belong to the booking',
      );
    }

    if (
      dto.postTripChargeId &&
      !booking.postTripCharges.some(
        (charge) => charge.id === dto.postTripChargeId,
      )
    ) {
      throw new BadRequestException(
        'Post-trip charge must belong to the booking',
      );
    }

    const { evidence, requiredEvidence } = this.buildEvidencePayload(
      booking,
      dto,
      userId,
    );

    const report = await this.prisma.incidentReport.create({
      data: {
        bookingId: booking.id,
        tripId,
        postTripChargeId: dto.postTripChargeId ?? null,
        reporterId: userId,
        category: dto.category,
        severity: dto.severity ?? IncidentSeverity.MEDIUM,
        status: IncidentStatus.OPEN,
        description,
        evidence,
        requiredEvidence,
      },
      include: this.incidentInclude(),
    });

    await this.markDepositDisputedIfNeeded(booking.id, dto.category);
    return IncidentReportEntity.fromPrisma(report);
  }

  private buildEvidencePayload(
    booking: IncidentBooking,
    dto: CreateIncidentReportDto,
    reporterId: string,
  ): {
    evidence: Prisma.InputJsonValue;
    requiredEvidence: Prisma.InputJsonValue;
  } {
    const evidenceUrls = (dto.evidenceUrls ?? [])
      .map((url) => url.trim())
      .filter(Boolean);
    const requestedPhotoIds = [...new Set(dto.handoverPhotoIds ?? [])];
    const handoverPhotos = booking.handovers.flatMap((handover) =>
      handover.photos.map((photo) => ({
        id: photo.id,
        handoverId: handover.id,
        handoverType: handover.type,
        photoUrl: photo.photoUrl,
        photoType: photo.photoType,
        capturedAt: photo.capturedAt.toISOString(),
      })),
    );

    const photoById = new Map(handoverPhotos.map((photo) => [photo.id, photo]));
    const invalidPhotoIds = requestedPhotoIds.filter((id) => !photoById.has(id));
    if (invalidPhotoIds.length > 0) {
      throw new BadRequestException(
        'Handover evidence must belong to the booking',
      );
    }

    const attachedHandoverPhotos = requestedPhotoIds.map(
      (id) => photoById.get(id)!,
    );
    const hasEvidence =
      evidenceUrls.length > 0 || attachedHandoverPhotos.length > 0;
    const requiresPhoto =
      EVIDENCE_REQUIRED_CATEGORIES.has(dto.category) ||
      dto.severity === IncidentSeverity.CRITICAL;

    if (requiresPhoto && !hasEvidence) {
      throw new BadRequestException(
        `${dto.category} incidents require at least one evidence URL or handover photo`,
      );
    }

    return {
      evidence: {
        reportedBy: reporterId,
        reportedAt: new Date().toISOString(),
        evidenceUrls,
        handoverPhotos: attachedHandoverPhotos,
      },
      requiredEvidence: {
        photoRequired: requiresPhoto,
        minimumItems: requiresPhoto ? 1 : 0,
        satisfied: hasEvidence || !requiresPhoto,
        acceptedSources: ['evidenceUrls', 'handoverPhotoIds'],
      },
    };
  }

  private async markDepositDisputedIfNeeded(
    bookingId: string,
    category: IncidentCategory,
  ): Promise<void> {
    if (!DEPOSIT_HOLD_CATEGORIES.has(category)) return;

    await this.prisma.depositLedger.updateMany({
      where: {
        bookingId,
        status: {
          in: [
            DepositLedgerStatus.HELD,
            DepositLedgerStatus.PENDING_CHARGES,
            DepositLedgerStatus.PARTIALLY_CAPTURED,
            DepositLedgerStatus.RELEASE_PENDING,
          ],
        },
      },
      data: {
        status: DepositLedgerStatus.DISPUTED,
        disputedAt: new Date(),
        notes: 'Open incident report requires admin review before deposit release',
      },
    });
  }

  private async findBookingForIncident(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        trip: true,
        depositLedger: true,
        postTripCharges: {
          select: {
            id: true,
          },
        },
        handovers: {
          include: {
            photos: true,
          },
        },
      },
    });
  }

  private canViewBooking(
    booking: { renterId: string; ownerId: string },
    userId: string,
    roles: UserRole[],
  ): boolean {
    return (
      roles.includes(UserRole.ADMIN) ||
      booking.renterId === userId ||
      booking.ownerId === userId
    );
  }

  private incidentInclude() {
    return {
      reporter: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          trustScore: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      booking: {
        select: {
          id: true,
          status: true,
          renterId: true,
          ownerId: true,
          vehicleId: true,
          startTime: true,
          endTime: true,
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
      postTripCharge: {
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          description: true,
        },
      },
    } satisfies Prisma.IncidentReportInclude;
  }
}
