import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  DepositLedger,
  DepositLedgerStatus,
  ClaimCase,
  ClaimCaseOutcome,
  ClaimCaseStatus,
  IncidentCategory,
  EvidenceAnnotation,
  EvidenceAnnotationTargetType,
  IncidentReport,
  IncidentSeverity,
  IncidentStatus,
  NotificationType,
  OwnerPayout,
  PayoutStatus,
  Prisma,
  PostTripCharge,
  PostTripChargeStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationGateway } from '../notification/notification.gateway';
import { NotificationService } from '../notification/notification.service';
import {
  DepositLedgerEntity,
  OwnerPayoutEntity,
  PostTripChargeEntity,
} from '../financial/entities/financial.entity';
import {
  CreateIncidentReportDto,
  CreateEvidenceAnnotationDto,
  ReviewClaimCaseDto,
  UpdateIncidentStatusDto,
} from './dto';
import {
  BookingClaimSummaryEntity,
  BookingClaimWorkflowStatus,
  ClaimCaseEntity,
  ClaimCaseSlaStatus,
  ClaimActionActor,
  ClaimActionPriority,
  ClaimBlockerEntity,
  ClaimFinancialTotalsEntity,
  ClaimNextActionEntity,
  ClaimTimelineEventEntity,
  EvidenceAnnotationEntity,
  IncidentReportEntity,
} from './entities';

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

const CHARGE_REVIEW_STATUSES = [
  PostTripChargeStatus.PENDING_REVIEW,
  PostTripChargeStatus.DISPUTED,
] as const;

const APPROVED_CHARGE_STATUSES = [PostTripChargeStatus.APPROVED] as const;

const FINALIZED_CHARGE_STATUSES = [
  PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
  PostTripChargeStatus.PAID,
] as const;

const DEPOSIT_DECISION_STATUSES = [
  DepositLedgerStatus.PENDING_CHARGES,
  DepositLedgerStatus.PARTIALLY_CAPTURED,
  DepositLedgerStatus.RELEASE_PENDING,
  DepositLedgerStatus.DISPUTED,
] as const;

const PAYOUT_ACTION_STATUSES = [
  PayoutStatus.PENDING,
  PayoutStatus.ON_HOLD,
  PayoutStatus.FAILED,
] as const;

const FINAL_CLAIM_CASE_STATUSES = [
  ClaimCaseStatus.APPROVED,
  ClaimCaseStatus.REJECTED,
  ClaimCaseStatus.RESOLVED,
  ClaimCaseStatus.CANCELLED,
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

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly notificationService?: NotificationService,
    @Optional()
    private readonly notificationGateway?: NotificationGateway,
  ) {}

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

  async getClaimSummaryForBooking(
    bookingId: string,
    userId: string,
    roles: UserRole[] = [],
  ): Promise<BookingClaimSummaryEntity> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: this.claimSummaryInclude(),
    });

    if (!booking || !this.canViewBooking(booking, userId, roles)) {
      throw new NotFoundException('Booking not found');
    }

    return this.buildClaimSummary(booking, roles.includes(UserRole.ADMIN));
  }

  async listEvidenceAnnotationsForBooking(
    bookingId: string,
  ): Promise<EvidenceAnnotationEntity[]> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const annotations = await this.prisma.evidenceAnnotation.findMany({
      where: { bookingId },
      include: this.evidenceAnnotationInclude(),
      orderBy: { createdAt: 'desc' },
    });

    return annotations.map(EvidenceAnnotationEntity.fromPrisma);
  }

  async createEvidenceAnnotation(
    bookingId: string,
    adminId: string,
    dto: CreateEvidenceAnnotationDto,
  ): Promise<EvidenceAnnotationEntity> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const note = dto.note?.trim();
    if (!note) {
      throw new BadRequestException('Evidence annotation note is required');
    }

    const targetId = dto.targetId.trim();
    await this.assertEvidenceTargetBelongsToBooking(
      bookingId,
      dto.targetType,
      targetId,
    );

    const claimCaseId = dto.claimCaseId?.trim() || null;
    if (claimCaseId) {
      const claimCase = await this.prisma.claimCase.findFirst({
        where: { id: claimCaseId, bookingId },
        select: { id: true },
      });
      if (!claimCase) {
        throw new BadRequestException('Claim case must belong to the booking');
      }
    }

    const data: Prisma.EvidenceAnnotationUncheckedCreateInput = {
      bookingId,
      claimCaseId,
      targetType: dto.targetType,
      targetId,
      authorId: adminId,
      note,
      tags: this.normalizeAnnotationTags(dto.tags),
    };

    if (dto.highlight !== undefined) {
      data.highlight = dto.highlight as Prisma.InputJsonValue;
    }

    const annotation = await this.prisma.evidenceAnnotation.create({
      data,
      include: this.evidenceAnnotationInclude(),
    });

    return EvidenceAnnotationEntity.fromPrisma(annotation);
  }

  async createOrRefreshClaimCase(
    bookingId: string,
    adminId: string,
  ): Promise<ClaimCaseEntity> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: this.claimSummaryInclude(),
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (!this.hasClaimCaseActivity(booking)) {
      throw new BadRequestException(
        'Cannot open a claim case without incidents, charges, deposit blockers, or payout holds',
      );
    }

    if (
      booking.claimCase &&
      FINAL_CLAIM_CASE_STATUSES.includes(booking.claimCase.status as any)
    ) {
      throw new BadRequestException(
        'Finalized claim cases cannot be refreshed',
      );
    }

    const summary = this.describeClaimCaseSnapshot(booking);
    const hadClaimCase = !!booking.claimCase;
    const claimCase = await this.prisma.claimCase.upsert({
      where: { bookingId },
      create: {
        caseNumber: this.buildClaimCaseNumber(bookingId),
        bookingId,
        status: ClaimCaseStatus.OPEN,
        openedBy: adminId,
        summary,
      },
      update: {
        status:
          booking.claimCase?.status === ClaimCaseStatus.PENDING_SECOND_REVIEW
            ? ClaimCaseStatus.PENDING_SECOND_REVIEW
            : ClaimCaseStatus.UNDER_REVIEW,
        summary,
      },
      include: this.claimCaseInclude(),
    });

    await this.notifyClaimParticipants({
      claimCase,
      senderId: adminId,
      transition: hadClaimCase ? 'REFRESHED' : 'OPENED',
      title: hadClaimCase ? 'Hồ sơ claim đã cập nhật' : 'Hồ sơ claim đã mở',
      message: hadClaimCase
        ? `Hồ sơ claim ${claimCase.caseNumber} đã được cập nhật để tiếp tục xử lý.`
        : `Hồ sơ claim ${claimCase.caseNumber} đã được mở và đang chờ Admin review.`,
    });

    return ClaimCaseEntity.fromPrisma(claimCase);
  }

  async getAdminClaimCases(input: {
    status?: ClaimCaseStatus;
    slaStatus?: ClaimCaseSlaStatus;
    limit?: number;
  }): Promise<ClaimCaseEntity[]> {
    const take = Math.min(
      Math.max(Math.trunc(input.limit ?? 50) || 50, 1),
      100,
    );
    const queryTake = input.slaStatus ? 100 : take;
    const claimCases = await this.prisma.claimCase.findMany({
      where: input.status ? { status: input.status } : undefined,
      include: this.claimCaseInclude(),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: queryTake,
    });

    const now = new Date();
    return claimCases
      .map((claimCase) => ClaimCaseEntity.fromPrisma(claimCase, now))
      .filter(
        (claimCase) =>
          !input.slaStatus || claimCase.sla.status === input.slaStatus,
      )
      .sort(this.compareClaimCaseSla)
      .slice(0, take);
  }

  async reviewClaimCase(
    claimCaseId: string,
    adminId: string,
    dto: ReviewClaimCaseDto,
  ): Promise<ClaimCaseEntity> {
    const claimCase = await this.prisma.claimCase.findUnique({
      where: { id: claimCaseId },
    });

    if (!claimCase) {
      throw new NotFoundException('Claim case not found');
    }

    if (FINAL_CLAIM_CASE_STATUSES.includes(claimCase.status as any)) {
      throw new BadRequestException('Finalized claim cases cannot be reviewed');
    }

    const notes = dto.notes?.trim() || null;
    const now = new Date();

    if (!claimCase.firstDecision) {
      const updated = await this.prisma.claimCase.update({
        where: { id: claimCaseId },
        data: {
          status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
          firstDecision: dto.decision,
          firstReviewedBy: adminId,
          firstReviewNotes: notes,
          firstReviewedAt: now,
          outcome: dto.decision,
        },
        include: this.claimCaseInclude(),
      });
      await this.notifyClaimParticipants({
        claimCase: updated,
        senderId: adminId,
        transition: 'FIRST_REVIEWED',
        title: 'Hồ sơ claim chờ duyệt lần 2',
        message: `Hồ sơ claim ${updated.caseNumber} đã có quyết định đầu tiên và cần Admin khác xác nhận.`,
        outcome: dto.decision,
      });
      return ClaimCaseEntity.fromPrisma(updated);
    }

    if (claimCase.firstReviewedBy === adminId) {
      throw new BadRequestException(
        'Second claim review must be completed by a different admin',
      );
    }

    if (claimCase.firstDecision !== dto.decision) {
      throw new BadRequestException(
        'Second claim review must match the first decision',
      );
    }

    const finalStatus = this.resolveFinalClaimCaseStatus(dto.decision);
    const updated = await this.prisma.claimCase.update({
      where: { id: claimCaseId },
      data: {
        status: finalStatus,
        outcome: dto.decision,
        secondDecision: dto.decision,
        secondReviewedBy: adminId,
        secondReviewNotes: notes,
        secondReviewedAt: now,
        resolutionNotes: notes ?? claimCase.firstReviewNotes,
        resolvedAt: now,
      },
      include: this.claimCaseInclude(),
    });

    await this.notifyClaimParticipants({
      claimCase: updated,
      senderId: adminId,
      transition: 'FINALIZED',
      title: 'Hồ sơ claim đã có kết luận',
      message: `Hồ sơ claim ${updated.caseNumber} đã được chốt với kết quả ${dto.decision}.`,
      outcome: dto.decision,
    });

    return ClaimCaseEntity.fromPrisma(updated);
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
      throw new BadRequestException('Incident trip must belong to the booking');
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
    const invalidPhotoIds = requestedPhotoIds.filter(
      (id) => !photoById.has(id),
    );
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
        notes:
          'Open incident report requires admin review before deposit release',
      },
    });
  }

  private hasClaimCaseActivity(booking: {
    depositLedger: DepositLedger | null;
    postTripCharges: PostTripCharge[];
    incidentReports: IncidentReport[];
    ownerPayout: OwnerPayout | null;
  }): boolean {
    return (
      booking.incidentReports.length > 0 ||
      booking.postTripCharges.length > 0 ||
      !!(
        booking.depositLedger &&
        DEPOSIT_DECISION_STATUSES.includes(booking.depositLedger.status as any)
      ) ||
      booking.ownerPayout?.status === PayoutStatus.ON_HOLD
    );
  }

  private describeClaimCaseSnapshot(booking: {
    depositLedger: DepositLedger | null;
    postTripCharges: PostTripCharge[];
    incidentReports: IncidentReport[];
    ownerPayout: OwnerPayout | null;
  }): string {
    const unresolvedIncidents = booking.incidentReports.filter((report) =>
      OPEN_INCIDENT_STATUSES.includes(report.status as any),
    ).length;
    const pendingCharges = booking.postTripCharges.filter((charge) =>
      CHARGE_REVIEW_STATUSES.includes(charge.status as any),
    ).length;
    const approvedCharges = booking.postTripCharges.filter((charge) =>
      APPROVED_CHARGE_STATUSES.includes(charge.status as any),
    ).length;
    const depositStatus = booking.depositLedger?.status ?? 'NO_DEPOSIT_LEDGER';
    const payoutStatus = booking.ownerPayout?.status ?? 'NO_PAYOUT';

    return [
      `${booking.incidentReports.length} incident(s), ${unresolvedIncidents} unresolved`,
      `${pendingCharges} pending/disputed charge(s), ${approvedCharges} approved charge(s)`,
      `deposit ${depositStatus}`,
      `payout ${payoutStatus}`,
    ].join('; ');
  }

  private buildClaimCaseNumber(bookingId: string): string {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14);
    return `CLM-${stamp}-${bookingId.slice(0, 8).toUpperCase()}`;
  }

  private resolveFinalClaimCaseStatus(
    decision: ClaimCaseOutcome,
  ): ClaimCaseStatus {
    switch (decision) {
      case ClaimCaseOutcome.OWNER_CLAIM_REJECTED:
        return ClaimCaseStatus.REJECTED;
      case ClaimCaseOutcome.NO_ACTION_REQUIRED:
        return ClaimCaseStatus.RESOLVED;
      case ClaimCaseOutcome.OWNER_CLAIM_APPROVED:
      case ClaimCaseOutcome.OWNER_CLAIM_PARTIALLY_APPROVED:
      case ClaimCaseOutcome.DEPOSIT_RELEASE_APPROVED:
      case ClaimCaseOutcome.PAYOUT_RELEASE_APPROVED:
        return ClaimCaseStatus.APPROVED;
    }
  }

  private async notifyClaimParticipants(input: {
    claimCase: ClaimCase & {
      booking?: { id: string; renterId: string; ownerId: string } | null;
    };
    senderId: string;
    transition: string;
    title: string;
    message: string;
    outcome?: ClaimCaseOutcome;
  }): Promise<void> {
    const booking = input.claimCase.booking;
    if (!booking || !this.notificationService) return;

    const receivers = [
      { id: booking.renterId, role: 'renter' },
      { id: booking.ownerId, role: 'owner' },
    ].filter(
      (receiver, index, items) =>
        items.findIndex((item) => item.id === receiver.id) === index,
    );
    const baseData = this.stringifyNotificationData({
      bookingId: booking.id,
      claimCaseId: input.claimCase.id,
      caseNumber: input.claimCase.caseNumber,
      status: input.claimCase.status,
      transition: input.transition,
      outcome: input.outcome ?? input.claimCase.outcome,
    });

    try {
      for (const receiver of receivers) {
        const data = {
          ...baseData,
          recipientRole: receiver.role,
        };
        const notification = await this.notificationService.createNotification({
          receiverId: receiver.id,
          senderId: input.senderId,
          type: NotificationType.CLAIM_UPDATED,
          title: input.title,
          message: input.message,
          bookingId: booking.id,
          data,
        });

        if (this.notificationGateway?.isUserOnline(receiver.id)) {
          this.notificationGateway.sendToUser(receiver.id, 'claim_updated', {
            notification,
            bookingId: booking.id,
            ...data,
          });
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to send claim notification for case ${input.claimCase.id}: ${(err as Error).message}`,
      );
    }
  }

  private stringifyNotificationData(
    data: Record<string, unknown>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]),
    );
  }

  private buildClaimSummary(
    booking: {
      id: string;
      renterId: string;
      ownerId: string;
      vehicleId: string;
      status: string;
      startTime: Date;
      endTime: Date;
      createdAt: Date;
      renter?: Record<string, unknown>;
      owner?: Record<string, unknown>;
      vehicle?: Record<string, unknown>;
      trip?: Record<string, unknown> | null;
      payment?: Record<string, unknown> | null;
      depositLedger: DepositLedger | null;
      postTripCharges: PostTripCharge[];
      incidentReports: (IncidentReport & Record<string, unknown>)[];
      ownerPayout: OwnerPayout | null;
      claimCase: (ClaimCase & Record<string, unknown>) | null;
      evidenceAnnotations?: (EvidenceAnnotation & Record<string, unknown>)[];
    },
    includeEvidenceAnnotations = false,
  ): BookingClaimSummaryEntity {
    const incidents = booking.incidentReports.map((report) =>
      IncidentReportEntity.fromPrisma(report as any),
    );
    const charges = booking.postTripCharges.map(
      PostTripChargeEntity.fromPrisma,
    );
    const deposit = booking.depositLedger
      ? DepositLedgerEntity.fromPrisma(booking.depositLedger)
      : null;
    const payout = booking.ownerPayout
      ? OwnerPayoutEntity.fromPrisma(booking.ownerPayout)
      : null;
    const claimCase = booking.claimCase
      ? ClaimCaseEntity.fromPrisma(booking.claimCase as any)
      : null;
    const evidenceAnnotations = includeEvidenceAnnotations
      ? (booking.evidenceAnnotations ?? []).map((annotation) =>
          EvidenceAnnotationEntity.fromPrisma(annotation as any),
        )
      : [];

    const openIncidents = booking.incidentReports.filter(
      (report) => report.status === IncidentStatus.OPEN,
    );
    const underReviewIncidents = booking.incidentReports.filter(
      (report) => report.status === IncidentStatus.UNDER_REVIEW,
    );
    const unresolvedIncidents = booking.incidentReports.filter((report) =>
      OPEN_INCIDENT_STATUSES.includes(report.status as any),
    );
    const reviewCharges = booking.postTripCharges.filter((charge) =>
      CHARGE_REVIEW_STATUSES.includes(charge.status as any),
    );
    const approvedCharges = booking.postTripCharges.filter((charge) =>
      APPROVED_CHARGE_STATUSES.includes(charge.status as any),
    );
    const capturedCharges = booking.postTripCharges.filter(
      (charge) => charge.status === PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
    );
    const finalizedCharges = booking.postTripCharges.filter((charge) =>
      FINALIZED_CHARGE_STATUSES.includes(charge.status as any),
    );

    const pendingChargeAmount = this.sumCharges(reviewCharges);
    const approvedChargeAmount = this.sumCharges(approvedCharges);
    const capturedChargeAmount = this.sumCharges(capturedCharges);
    const finalizedChargeAmount = this.sumCharges(finalizedCharges);
    const heldDepositAmount = booking.depositLedger?.heldAmount ?? 0;
    const releasableDepositAmount = this.roundMoney(
      Math.max(
        heldDepositAmount -
          pendingChargeAmount -
          approvedChargeAmount -
          capturedChargeAmount,
        0,
      ),
    );

    const blockers: ClaimBlockerEntity[] = [];
    if (unresolvedIncidents.length > 0) {
      blockers.push(
        new ClaimBlockerEntity({
          code: 'UNRESOLVED_INCIDENTS',
          label: 'Incident reports are still open or under review',
          count: unresolvedIncidents.length,
          blocksDepositRelease: true,
          blocksOwnerPayout: true,
        }),
      );
    }
    if (reviewCharges.length > 0) {
      blockers.push(
        new ClaimBlockerEntity({
          code: 'UNRESOLVED_POST_TRIP_CHARGES',
          label: 'Post-trip charges need admin review',
          count: reviewCharges.length,
          blocksDepositRelease: true,
          blocksOwnerPayout: true,
        }),
      );
    }
    if (approvedCharges.length > 0) {
      blockers.push(
        new ClaimBlockerEntity({
          code: 'APPROVED_CHARGES_NOT_CAPTURED',
          label: 'Approved charges must be captured or waived before release',
          count: approvedCharges.length,
          blocksDepositRelease: true,
          blocksOwnerPayout: true,
        }),
      );
    }
    if (
      booking.depositLedger &&
      DEPOSIT_DECISION_STATUSES.includes(booking.depositLedger.status as any)
    ) {
      blockers.push(
        new ClaimBlockerEntity({
          code: 'DEPOSIT_DECISION_PENDING',
          label: `Deposit ledger is ${booking.depositLedger.status}`,
          count: 1,
          blocksDepositRelease:
            booking.depositLedger.status !==
            DepositLedgerStatus.RELEASE_PENDING,
          blocksOwnerPayout:
            booking.depositLedger.status !== DepositLedgerStatus.RELEASED,
        }),
      );
    }
    if (
      booking.ownerPayout?.status === PayoutStatus.ON_HOLD &&
      booking.ownerPayout.holdReason
    ) {
      blockers.push(
        new ClaimBlockerEntity({
          code: 'OWNER_PAYOUT_ON_HOLD',
          label: booking.ownerPayout.holdReason,
          count: 1,
          blocksDepositRelease: false,
          blocksOwnerPayout: true,
        }),
      );
    }

    const canReleaseDeposit =
      !!booking.depositLedger &&
      !blockers.some((blocker) => blocker.blocksDepositRelease) &&
      [
        DepositLedgerStatus.HELD,
        DepositLedgerStatus.PARTIALLY_CAPTURED,
        DepositLedgerStatus.RELEASE_PENDING,
      ].includes(booking.depositLedger.status as any);
    const canProcessPayout =
      !!booking.ownerPayout &&
      !blockers.some((blocker) => blocker.blocksOwnerPayout) &&
      PAYOUT_ACTION_STATUSES.includes(booking.ownerPayout.status as any) &&
      booking.ownerPayout.payoutAmount > 0;

    const status = this.resolveClaimStatus({
      hasClaimActivity:
        incidents.length > 0 ||
        charges.length > 0 ||
        blockers.length > 0 ||
        !!booking.ownerPayout,
      openIncidentCount: openIncidents.length,
      underReviewIncidentCount: underReviewIncidents.length,
      reviewChargeCount: reviewCharges.length,
      approvedChargeCount: approvedCharges.length,
      hasDepositDecision: blockers.some(
        (blocker) => blocker.code === 'DEPOSIT_DECISION_PENDING',
      ),
      hasPayoutAction:
        !!booking.ownerPayout &&
        PAYOUT_ACTION_STATUSES.includes(booking.ownerPayout.status as any),
    });

    return new BookingClaimSummaryEntity({
      bookingId: booking.id,
      status,
      statusLabel: this.claimStatusLabel(status),
      booking: {
        id: booking.id,
        status: booking.status,
        renterId: booking.renterId,
        ownerId: booking.ownerId,
        vehicleId: booking.vehicleId,
        startTime: booking.startTime,
        endTime: booking.endTime,
        renter: booking.renter,
        owner: booking.owner,
        vehicle: booking.vehicle,
        trip: booking.trip,
        payment: booking.payment,
      },
      deposit,
      depositStatus: booking.depositLedger?.status ?? null,
      charges,
      incidents,
      ownerPayout: payout,
      claimCase,
      evidenceAnnotations,
      payoutStatus: booking.ownerPayout?.status ?? null,
      totals: new ClaimFinancialTotalsEntity({
        incidentCount: incidents.length,
        openIncidentCount: openIncidents.length,
        unresolvedIncidentCount: unresolvedIncidents.length,
        pendingChargeAmount,
        approvedChargeAmount,
        capturedChargeAmount,
        finalizedChargeAmount,
        heldDepositAmount,
        releasableDepositAmount,
        ownerPayoutAmount: booking.ownerPayout?.payoutAmount ?? 0,
      }),
      blockers,
      nextActions: this.buildClaimNextActions({
        status,
        openIncidentCount: openIncidents.length,
        underReviewIncidentCount: underReviewIncidents.length,
        reviewChargeCount: reviewCharges.length,
        approvedChargeCount: approvedCharges.length,
        depositStatus: booking.depositLedger?.status ?? null,
        payoutStatus: booking.ownerPayout?.status ?? null,
        hasPayout: !!booking.ownerPayout,
        claimCaseStatus: booking.claimCase?.status ?? null,
        canReleaseDeposit,
        canProcessPayout,
      }),
      timeline: this.buildClaimTimeline(booking, includeEvidenceAnnotations),
      canReleaseDeposit,
      canProcessPayout,
    });
  }

  private resolveClaimStatus(input: {
    hasClaimActivity: boolean;
    openIncidentCount: number;
    underReviewIncidentCount: number;
    reviewChargeCount: number;
    approvedChargeCount: number;
    hasDepositDecision: boolean;
    hasPayoutAction: boolean;
  }): BookingClaimWorkflowStatus {
    if (!input.hasClaimActivity) return BookingClaimWorkflowStatus.NO_CLAIM;
    if (input.openIncidentCount > 0) return BookingClaimWorkflowStatus.OPEN;
    if (input.underReviewIncidentCount > 0) {
      return BookingClaimWorkflowStatus.UNDER_REVIEW;
    }
    if (input.reviewChargeCount > 0) {
      return BookingClaimWorkflowStatus.AWAITING_CHARGE_REVIEW;
    }
    if (input.approvedChargeCount > 0 || input.hasDepositDecision) {
      return BookingClaimWorkflowStatus.AWAITING_DEPOSIT_DECISION;
    }
    if (input.hasPayoutAction)
      return BookingClaimWorkflowStatus.AWAITING_PAYOUT;
    return BookingClaimWorkflowStatus.RESOLVED;
  }

  private claimStatusLabel(status: BookingClaimWorkflowStatus): string {
    switch (status) {
      case BookingClaimWorkflowStatus.NO_CLAIM:
        return 'No claim activity';
      case BookingClaimWorkflowStatus.OPEN:
        return 'Claim opened';
      case BookingClaimWorkflowStatus.UNDER_REVIEW:
        return 'Claim under review';
      case BookingClaimWorkflowStatus.AWAITING_CHARGE_REVIEW:
        return 'Awaiting post-trip charge review';
      case BookingClaimWorkflowStatus.AWAITING_DEPOSIT_DECISION:
        return 'Awaiting deposit decision';
      case BookingClaimWorkflowStatus.AWAITING_PAYOUT:
        return 'Awaiting owner payout';
      case BookingClaimWorkflowStatus.RESOLVED:
        return 'Claim resolved';
    }
  }

  private buildClaimNextActions(input: {
    status: BookingClaimWorkflowStatus;
    openIncidentCount: number;
    underReviewIncidentCount: number;
    reviewChargeCount: number;
    approvedChargeCount: number;
    depositStatus: DepositLedgerStatus | null;
    payoutStatus: PayoutStatus | null;
    hasPayout: boolean;
    claimCaseStatus: ClaimCaseStatus | null;
    canReleaseDeposit: boolean;
    canProcessPayout: boolean;
  }): ClaimNextActionEntity[] {
    const actions: ClaimNextActionEntity[] = [];

    if (
      !input.claimCaseStatus &&
      input.status !== BookingClaimWorkflowStatus.NO_CLAIM
    ) {
      actions.push(
        new ClaimNextActionEntity({
          actor: ClaimActionActor.ADMIN,
          action: 'Open durable claim case',
          reason:
            'Claim activity exists but no auditable claim case has been opened',
          priority: ClaimActionPriority.HIGH,
        }),
      );
    } else if (
      input.claimCaseStatus === ClaimCaseStatus.PENDING_SECOND_REVIEW
    ) {
      actions.push(
        new ClaimNextActionEntity({
          actor: ClaimActionActor.ADMIN,
          action: 'Complete second-admin claim review',
          reason:
            'Four-eyes approval requires a different admin to confirm the same outcome',
          priority: ClaimActionPriority.HIGH,
        }),
      );
    } else if (
      input.claimCaseStatus === ClaimCaseStatus.OPEN ||
      input.claimCaseStatus === ClaimCaseStatus.UNDER_REVIEW
    ) {
      actions.push(
        new ClaimNextActionEntity({
          actor: ClaimActionActor.ADMIN,
          action: 'Submit first claim review decision',
          reason: 'The claim case is open and needs an initial Admin outcome',
          priority: ClaimActionPriority.HIGH,
        }),
      );
    }

    if (input.openIncidentCount > 0) {
      actions.push(
        new ClaimNextActionEntity({
          actor: ClaimActionActor.ADMIN,
          action: 'Move incident reports under review',
          reason: `${input.openIncidentCount} incident report(s) are still open`,
          priority: ClaimActionPriority.HIGH,
        }),
      );
    }

    if (input.underReviewIncidentCount > 0) {
      actions.push(
        new ClaimNextActionEntity({
          actor: ClaimActionActor.ADMIN,
          action: 'Resolve or reject incident reports',
          reason: `${input.underReviewIncidentCount} incident report(s) are under review`,
          priority: ClaimActionPriority.HIGH,
        }),
      );
    }

    if (input.reviewChargeCount > 0) {
      actions.push(
        new ClaimNextActionEntity({
          actor: ClaimActionActor.ADMIN,
          action: 'Review disputed or pending post-trip charges',
          reason: `${input.reviewChargeCount} charge(s) need a decision`,
          priority: ClaimActionPriority.HIGH,
        }),
      );
    }

    if (input.approvedChargeCount > 0) {
      actions.push(
        new ClaimNextActionEntity({
          actor: ClaimActionActor.ADMIN,
          action: 'Capture approved charges or waive them',
          reason: `${input.approvedChargeCount} approved charge(s) are not finalized`,
          priority: ClaimActionPriority.HIGH,
        }),
      );
    }

    if (input.canReleaseDeposit) {
      actions.push(
        new ClaimNextActionEntity({
          actor: ClaimActionActor.ADMIN,
          action: 'Release remaining deposit',
          reason: 'No open claim blockers remain on the deposit ledger',
          priority: ClaimActionPriority.MEDIUM,
        }),
      );
    } else if (
      input.depositStatus &&
      DEPOSIT_DECISION_STATUSES.includes(input.depositStatus as any)
    ) {
      actions.push(
        new ClaimNextActionEntity({
          actor: ClaimActionActor.RENTER,
          action: 'Wait for admin deposit decision',
          reason: `Deposit is ${input.depositStatus}`,
          priority: ClaimActionPriority.MEDIUM,
        }),
      );
    }

    if (input.canProcessPayout) {
      actions.push(
        new ClaimNextActionEntity({
          actor: ClaimActionActor.ADMIN,
          action: 'Process owner payout',
          reason: 'Claim blockers are cleared and payout is ready',
          priority: ClaimActionPriority.MEDIUM,
        }),
      );
    } else if (input.payoutStatus === PayoutStatus.ON_HOLD) {
      actions.push(
        new ClaimNextActionEntity({
          actor: ClaimActionActor.OWNER,
          action: 'Wait for payout hold to clear',
          reason: 'Owner payout is still held by the claim workflow',
          priority: ClaimActionPriority.MEDIUM,
        }),
      );
    } else if (
      !input.hasPayout &&
      input.status === BookingClaimWorkflowStatus.RESOLVED
    ) {
      actions.push(
        new ClaimNextActionEntity({
          actor: ClaimActionActor.ADMIN,
          action: 'Create or refresh owner payout',
          reason: 'Claim is resolved and payout can be prepared',
          priority: ClaimActionPriority.LOW,
        }),
      );
    }

    return actions;
  }

  private buildClaimTimeline(
    booking: {
      id: string;
      createdAt: Date;
      payment?: Record<string, unknown> | null;
      trip?: Record<string, unknown> | null;
      depositLedger: DepositLedger | null;
      postTripCharges: PostTripCharge[];
      incidentReports: (IncidentReport & Record<string, unknown>)[];
      ownerPayout: OwnerPayout | null;
      claimCase: ClaimCase | null;
      evidenceAnnotations?: EvidenceAnnotation[];
    },
    includeEvidenceAnnotations = false,
  ): ClaimTimelineEventEntity[] {
    const events: ClaimTimelineEventEntity[] = [];

    this.pushTimelineEvent(events, {
      type: 'BOOKING_CREATED',
      label: 'Booking created',
      occurredAt: booking.createdAt,
      sourceId: booking.id,
    });

    this.pushTimelineEvent(events, {
      type: 'PAYMENT_COMPLETED',
      label: 'Payment completed',
      status: booking.payment?.status as string | undefined,
      amount: booking.payment?.amount as number | undefined,
      occurredAt: booking.payment?.paidAt as Date | null | undefined,
      sourceId: booking.payment?.id as string | undefined,
    });

    this.pushTimelineEvent(events, {
      type: 'TRIP_COMPLETED',
      label: 'Trip completed',
      status: booking.trip?.status as string | undefined,
      occurredAt: booking.trip?.completedAt as Date | null | undefined,
      sourceId: booking.trip?.id as string | undefined,
    });

    if (booking.depositLedger) {
      this.pushTimelineEvent(events, {
        type: 'DEPOSIT_HELD',
        label: 'Deposit held',
        status: booking.depositLedger.status,
        amount: booking.depositLedger.heldAmount,
        occurredAt: booking.depositLedger.heldAt,
        sourceId: booking.depositLedger.id,
      });
      this.pushTimelineEvent(events, {
        type: 'DEPOSIT_DISPUTED',
        label: 'Deposit marked disputed',
        status: booking.depositLedger.status,
        occurredAt: booking.depositLedger.disputedAt,
        sourceId: booking.depositLedger.id,
      });
      this.pushTimelineEvent(events, {
        type: 'DEPOSIT_RELEASED',
        label: 'Deposit released',
        status: booking.depositLedger.status,
        amount: booking.depositLedger.releasedAmount,
        occurredAt: booking.depositLedger.releasedAt,
        sourceId: booking.depositLedger.id,
      });
    }

    for (const charge of booking.postTripCharges) {
      this.pushTimelineEvent(events, {
        type: 'POST_TRIP_CHARGE_CREATED',
        label: `Post-trip charge created: ${charge.type}`,
        status: charge.status,
        amount: charge.amount,
        occurredAt: charge.createdAt,
        sourceId: charge.id,
      });
      this.pushTimelineEvent(events, {
        type: 'POST_TRIP_CHARGE_REVIEWED',
        label: `Post-trip charge reviewed: ${charge.type}`,
        status: charge.status,
        amount: charge.amount,
        occurredAt: charge.reviewedAt,
        sourceId: charge.id,
        actorId: charge.reviewedBy,
      });
    }

    for (const incident of booking.incidentReports) {
      this.pushTimelineEvent(events, {
        type: 'INCIDENT_CREATED',
        label: `Incident filed: ${incident.category}`,
        status: incident.status,
        occurredAt: incident.createdAt,
        sourceId: incident.id,
        actorId: incident.reporterId,
      });
      this.pushTimelineEvent(events, {
        type: 'INCIDENT_REVIEWED',
        label: `Incident reviewed: ${incident.category}`,
        status: incident.status,
        occurredAt: incident.reviewedAt,
        sourceId: incident.id,
        actorId: incident.reviewedBy,
      });
      this.pushTimelineEvent(events, {
        type: 'INCIDENT_RESOLVED',
        label: `Incident finalized: ${incident.category}`,
        status: incident.status,
        occurredAt: incident.resolvedAt,
        sourceId: incident.id,
        actorId: incident.reviewedBy,
      });
    }

    if (booking.ownerPayout) {
      this.pushTimelineEvent(events, {
        type: 'OWNER_PAYOUT_CREATED',
        label: 'Owner payout prepared',
        status: booking.ownerPayout.status,
        amount: booking.ownerPayout.payoutAmount,
        occurredAt: booking.ownerPayout.createdAt,
        sourceId: booking.ownerPayout.id,
        actorId: booking.ownerPayout.createdBy,
      });
      this.pushTimelineEvent(events, {
        type: 'OWNER_PAYOUT_PROCESSED',
        label: 'Owner payout processing started',
        status: booking.ownerPayout.status,
        amount: booking.ownerPayout.payoutAmount,
        occurredAt: booking.ownerPayout.processedAt,
        sourceId: booking.ownerPayout.id,
        actorId: booking.ownerPayout.processedBy,
      });
      this.pushTimelineEvent(events, {
        type: 'OWNER_PAYOUT_COMPLETED',
        label: 'Owner payout completed',
        status: booking.ownerPayout.status,
        amount: booking.ownerPayout.payoutAmount,
        occurredAt: booking.ownerPayout.completedAt,
        sourceId: booking.ownerPayout.id,
        actorId: booking.ownerPayout.processedBy,
      });
    }

    if (booking.claimCase) {
      this.pushTimelineEvent(events, {
        type: 'CLAIM_CASE_OPENED',
        label: 'Claim case opened',
        status: booking.claimCase.status,
        occurredAt: booking.claimCase.createdAt,
        sourceId: booking.claimCase.id,
        actorId: booking.claimCase.openedBy,
      });
      this.pushTimelineEvent(events, {
        type: 'CLAIM_CASE_FIRST_REVIEWED',
        label: 'First Admin claim review completed',
        status: booking.claimCase.firstDecision ?? undefined,
        occurredAt: booking.claimCase.firstReviewedAt,
        sourceId: booking.claimCase.id,
        actorId: booking.claimCase.firstReviewedBy,
      });
      this.pushTimelineEvent(events, {
        type: 'CLAIM_CASE_FINALIZED',
        label: 'Second Admin claim review completed',
        status: booking.claimCase.outcome ?? undefined,
        occurredAt: booking.claimCase.secondReviewedAt,
        sourceId: booking.claimCase.id,
        actorId: booking.claimCase.secondReviewedBy,
      });
    }

    if (includeEvidenceAnnotations) {
      for (const annotation of booking.evidenceAnnotations ?? []) {
        this.pushTimelineEvent(events, {
          type: 'EVIDENCE_ANNOTATED',
          label: `Evidence annotated: ${annotation.targetType}`,
          occurredAt: annotation.createdAt,
          sourceId: annotation.id,
          actorId: annotation.authorId,
          metadata: {
            targetType: annotation.targetType,
            targetId: annotation.targetId,
            claimCaseId: annotation.claimCaseId,
            tags: annotation.tags,
          },
        });
      }
    }

    return events.sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    );
  }

  private pushTimelineEvent(
    events: ClaimTimelineEventEntity[],
    input: {
      type: string;
      label: string;
      status?: string;
      amount?: number;
      occurredAt?: Date | string | null;
      sourceId?: string;
      actorId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): void {
    if (!input.occurredAt) return;
    events.push(
      new ClaimTimelineEventEntity({
        type: input.type,
        label: input.label,
        status: input.status,
        amount: input.amount,
        occurredAt:
          input.occurredAt instanceof Date
            ? input.occurredAt
            : new Date(input.occurredAt),
        sourceId: input.sourceId,
        actorId: input.actorId,
        metadata: input.metadata,
      }),
    );
  }

  private sumCharges(charges: PostTripCharge[]): number {
    return this.roundMoney(
      charges.reduce((sum, charge) => sum + (charge.amount ?? 0), 0),
    );
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private compareClaimCaseSla(
    left: ClaimCaseEntity,
    right: ClaimCaseEntity,
  ): number {
    const priority: Record<ClaimCaseSlaStatus, number> = {
      [ClaimCaseSlaStatus.OVERDUE]: 0,
      [ClaimCaseSlaStatus.AT_RISK]: 1,
      [ClaimCaseSlaStatus.ON_TRACK]: 2,
      [ClaimCaseSlaStatus.COMPLETED]: 3,
    };
    const priorityDelta = priority[left.sla.status] - priority[right.sla.status];
    if (priorityDelta !== 0) return priorityDelta;

    const leftDue = left.sla.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightDue = right.sla.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) return leftDue - rightDue;

    return right.createdAt.getTime() - left.createdAt.getTime();
  }

  private normalizeAnnotationTags(tags?: string[]): string[] {
    return [
      ...new Set(
        (tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      ),
    ];
  }

  private async assertEvidenceTargetBelongsToBooking(
    bookingId: string,
    targetType: EvidenceAnnotationTargetType,
    targetId: string,
  ): Promise<void> {
    let targetExists = false;

    switch (targetType) {
      case EvidenceAnnotationTargetType.INCIDENT_REPORT:
        targetExists = !!(await this.prisma.incidentReport.findFirst({
          where: { id: targetId, bookingId },
          select: { id: true },
        }));
        break;
      case EvidenceAnnotationTargetType.POST_TRIP_CHARGE:
        targetExists = !!(await this.prisma.postTripCharge.findFirst({
          where: { id: targetId, bookingId },
          select: { id: true },
        }));
        break;
      case EvidenceAnnotationTargetType.VEHICLE_HANDOVER:
        targetExists = !!(await this.prisma.vehicleHandover.findFirst({
          where: { id: targetId, bookingId },
          select: { id: true },
        }));
        break;
      case EvidenceAnnotationTargetType.HANDOVER_PHOTO:
        targetExists = !!(await this.prisma.handoverPhoto.findFirst({
          where: {
            id: targetId,
            handover: { bookingId },
          },
          select: { id: true },
        }));
        break;
    }

    if (!targetExists) {
      throw new BadRequestException(
        'Evidence annotation target must belong to the booking',
      );
    }
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

  private claimSummaryInclude() {
    return {
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
      payment: {
        select: {
          id: true,
          status: true,
          amount: true,
          platformFee: true,
          ownerAmount: true,
          paidAt: true,
        },
      },
      depositLedger: true,
      postTripCharges: {
        orderBy: { createdAt: 'desc' },
      },
      incidentReports: {
        include: this.incidentInclude(),
        orderBy: { createdAt: 'desc' },
      },
      ownerPayout: true,
      claimCase: {
        include: this.claimCaseInclude(),
      },
      evidenceAnnotations: {
        include: this.evidenceAnnotationInclude(),
        orderBy: { createdAt: 'desc' },
      },
    } satisfies Prisma.BookingInclude;
  }

  private evidenceAnnotationInclude() {
    return {
      author: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    } satisfies Prisma.EvidenceAnnotationInclude;
  }

  private claimCaseInclude() {
    return {
      opener: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      firstReviewer: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      secondReviewer: {
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
            },
          },
          owner: {
            select: {
              id: true,
              fullName: true,
              email: true,
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
    } satisfies Prisma.ClaimCaseInclude;
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
