import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ClaimCase,
  ClaimCaseOutcome,
  ClaimCaseStatus,
  PostTripChargeStatus,
  PostTripChargeType,
  ProtectionPlanType,
} from '@prisma/client';

export enum ClaimCaseSlaStatus {
  ON_TRACK = 'ON_TRACK',
  AT_RISK = 'AT_RISK',
  OVERDUE = 'OVERDUE',
  COMPLETED = 'COMPLETED',
}

export enum ClaimCaseSlaStage {
  FIRST_REVIEW = 'FIRST_REVIEW',
  SECOND_REVIEW = 'SECOND_REVIEW',
  CLOSED = 'CLOSED',
}

export enum ClaimCaseAssignmentFilter {
  MINE = 'MINE',
  UNASSIGNED = 'UNASSIGNED',
}

export enum ClaimCaseRiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export type ClaimCaseSlaPolicy = {
  firstReviewHours: number;
  secondReviewHours: number;
  atRiskWindowHours: number;
  highEscalationOverdueHours: number;
};

export const DEFAULT_CLAIM_CASE_SLA_POLICY: ClaimCaseSlaPolicy = {
  firstReviewHours: 24,
  secondReviewHours: 12,
  atRiskWindowHours: 2,
  highEscalationOverdueHours: 24,
};

export class ClaimCaseSlaPolicyEntity implements ClaimCaseSlaPolicy {
  @ApiProperty()
  firstReviewHours: number;

  @ApiProperty()
  secondReviewHours: number;

  @ApiProperty()
  atRiskWindowHours: number;

  @ApiProperty()
  highEscalationOverdueHours: number;

  constructor(partial: Partial<ClaimCaseSlaPolicyEntity>) {
    Object.assign(this, partial);
  }
}

export class ClaimCaseSlaEntity {
  @ApiProperty({ enum: ClaimCaseSlaStatus })
  status: ClaimCaseSlaStatus;

  @ApiProperty({ enum: ClaimCaseSlaStage })
  stage: ClaimCaseSlaStage;

  @ApiPropertyOptional({ nullable: true })
  dueAt: Date | null;

  @ApiProperty()
  label: string;

  @ApiProperty()
  remainingMinutes: number;

  @ApiProperty()
  overdueMinutes: number;

  @ApiProperty()
  escalationLevel: number;

  constructor(partial: Partial<ClaimCaseSlaEntity>) {
    Object.assign(this, partial);
  }
}

export class ClaimCaseRiskIndicatorEntity {
  @ApiProperty()
  code: string;

  @ApiProperty()
  label: string;

  @ApiProperty({ enum: ClaimCaseRiskLevel })
  severity: ClaimCaseRiskLevel;

  constructor(partial: Partial<ClaimCaseRiskIndicatorEntity>) {
    Object.assign(this, partial);
  }
}

export class ClaimCaseRiskEntity {
  @ApiProperty({ enum: ClaimCaseRiskLevel })
  level: ClaimCaseRiskLevel;

  @ApiProperty()
  score: number;

  @ApiProperty({ type: [ClaimCaseRiskIndicatorEntity] })
  indicators: ClaimCaseRiskIndicatorEntity[];

  constructor(partial: Partial<ClaimCaseRiskEntity>) {
    Object.assign(this, partial);
  }
}

export enum ClaimProtectionSettlementStatus {
  AWAITING_APPROVED_DAMAGE_CHARGE = 'AWAITING_APPROVED_DAMAGE_CHARGE',
  CALCULATED = 'CALCULATED',
}

export class ClaimProtectionSettlementEntity {
  @ApiProperty({ enum: ClaimProtectionSettlementStatus })
  status: ClaimProtectionSettlementStatus;

  @ApiProperty({ enum: ProtectionPlanType })
  protectionPlan: ProtectionPlanType;

  @ApiProperty()
  eligibleDamageAmount: number;

  @ApiProperty()
  nonCoveredChargeAmount: number;

  @ApiProperty()
  deductibleAmount: number;

  @ApiProperty()
  deductibleAppliedAmount: number;

  @ApiProperty()
  coverageLimit: number;

  @ApiProperty()
  platformCoverageAmount: number;

  @ApiProperty()
  renterLiabilityAmount: number;

  @ApiProperty()
  excessAboveCoverageAmount: number;

  constructor(partial: Partial<ClaimProtectionSettlementEntity>) {
    Object.assign(this, partial);
  }
}

export class ClaimCaseQueueSummaryEntity {
  @ApiProperty({ type: ClaimCaseSlaPolicyEntity })
  policy: ClaimCaseSlaPolicyEntity;

  @ApiProperty()
  total: number;

  @ApiProperty()
  active: number;

  @ApiProperty()
  finalized: number;

  @ApiProperty()
  assignedToMe: number;

  @ApiProperty()
  unassigned: number;

  @ApiProperty()
  firstReview: number;

  @ApiProperty()
  secondReview: number;

  @ApiProperty()
  closed: number;

  @ApiProperty()
  overdue: number;

  @ApiProperty()
  atRisk: number;

  @ApiProperty()
  onTrack: number;

  @ApiProperty()
  completed: number;

  @ApiProperty()
  highRisk: number;

  @ApiProperty()
  mediumRisk: number;

  constructor(partial: Partial<ClaimCaseQueueSummaryEntity>) {
    Object.assign(this, partial);
  }
}

type ClaimCaseUserSummary = {
  id: string;
  fullName: string;
  email?: string;
};

type ClaimCaseBookingSummary = {
  id: string;
  status: string;
  renterId: string;
  ownerId: string;
  vehicleId: string;
  startTime: Date;
  endTime: Date;
  protectionPlan?: ProtectionPlanType;
  protectionDeductible?: number;
  protectionCoverageLimit?: number;
  postTripCharges?: Array<{
    type: PostTripChargeType;
    status: PostTripChargeStatus;
    amount: number;
    createdAt?: Date | string;
  }>;
  renter?: ClaimCaseUserSummary;
  owner?: ClaimCaseUserSummary;
  vehicle?: {
    id: string;
    brand: string;
    model: string;
    licensePlate: string;
    images?: string[];
  };
};

type ClaimCaseLike = ClaimCase & {
  booking?: ClaimCaseBookingSummary;
  opener?: ClaimCaseUserSummary | null;
  assignee?: ClaimCaseUserSummary | null;
  firstReviewer?: ClaimCaseUserSummary | null;
  secondReviewer?: ClaimCaseUserSummary | null;
};

export class ClaimCaseEntity implements ClaimCase {
  @ApiProperty()
  id: string;

  @ApiProperty()
  caseNumber: string;

  @ApiProperty()
  bookingId: string;

  @ApiProperty({ enum: ClaimCaseStatus })
  status: ClaimCaseStatus;

  @ApiPropertyOptional({ enum: ClaimCaseOutcome, nullable: true })
  outcome: ClaimCaseOutcome | null;

  @ApiPropertyOptional()
  summary: string | null;

  @ApiPropertyOptional()
  openedBy: string | null;

  @ApiPropertyOptional()
  assignedAdminId: string | null;

  @ApiPropertyOptional()
  assignedAt: Date | null;

  @ApiPropertyOptional({ enum: ClaimCaseOutcome, nullable: true })
  firstDecision: ClaimCaseOutcome | null;

  @ApiPropertyOptional()
  firstReviewedBy: string | null;

  @ApiPropertyOptional()
  firstReviewNotes: string | null;

  @ApiPropertyOptional()
  firstReviewedAt: Date | null;

  @ApiPropertyOptional({ enum: ClaimCaseOutcome, nullable: true })
  secondDecision: ClaimCaseOutcome | null;

  @ApiPropertyOptional()
  secondReviewedBy: string | null;

  @ApiPropertyOptional()
  secondReviewNotes: string | null;

  @ApiPropertyOptional()
  secondReviewedAt: Date | null;

  @ApiPropertyOptional()
  resolutionNotes: string | null;

  @ApiPropertyOptional()
  resolvedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  booking?: ClaimCaseBookingSummary;

  @ApiPropertyOptional()
  opener?: ClaimCaseUserSummary | null;

  @ApiPropertyOptional()
  assignee?: ClaimCaseUserSummary | null;

  @ApiPropertyOptional()
  firstReviewer?: ClaimCaseUserSummary | null;

  @ApiPropertyOptional()
  secondReviewer?: ClaimCaseUserSummary | null;

  @ApiProperty({ type: ClaimCaseSlaEntity })
  sla: ClaimCaseSlaEntity;

  @ApiPropertyOptional({ type: ClaimCaseRiskEntity })
  risk?: ClaimCaseRiskEntity;

  @ApiPropertyOptional({
    type: ClaimProtectionSettlementEntity,
    nullable: true,
  })
  protectionSettlement?: ClaimProtectionSettlementEntity | null;

  constructor(partial: Partial<ClaimCaseEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(
    claimCase: ClaimCaseLike,
    now = new Date(),
    policy?: Partial<ClaimCaseSlaPolicy>,
    options: { includeRisk?: boolean } = {},
  ): ClaimCaseEntity {
    const { booking, ...rest } = claimCase;
    return new ClaimCaseEntity({
      ...rest,
      booking: ClaimCaseEntity.toBookingSummary(booking),
      sla: ClaimCaseEntity.buildSla(claimCase, now, policy),
      protectionSettlement:
        ClaimCaseEntity.buildProtectionSettlement(claimCase),
      ...(options.includeRisk
        ? { risk: ClaimCaseEntity.buildRisk(claimCase) }
        : {}),
    });
  }

  private static toBookingSummary(
    booking?: ClaimCaseBookingSummary,
  ): ClaimCaseBookingSummary | undefined {
    if (!booking) return undefined;
    return {
      id: booking.id,
      status: booking.status,
      renterId: booking.renterId,
      ownerId: booking.ownerId,
      vehicleId: booking.vehicleId,
      startTime: booking.startTime,
      endTime: booking.endTime,
      renter: ClaimCaseEntity.toUserSummary(booking.renter),
      owner: ClaimCaseEntity.toUserSummary(booking.owner),
      vehicle: booking.vehicle,
    };
  }

  private static toUserSummary(
    user?: ClaimCaseUserSummary | null,
  ): ClaimCaseUserSummary | undefined {
    if (!user) return undefined;
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
    };
  }

  private static buildProtectionSettlement(
    claimCase: ClaimCaseLike,
  ): ClaimProtectionSettlementEntity | null {
    if (
      claimCase.status !== ClaimCaseStatus.APPROVED ||
      (claimCase.outcome !== ClaimCaseOutcome.OWNER_CLAIM_APPROVED &&
        claimCase.outcome !== ClaimCaseOutcome.OWNER_CLAIM_PARTIALLY_APPROVED)
    ) {
      return null;
    }

    const booking = claimCase.booking;
    if (
      !booking?.protectionPlan ||
      booking.protectionDeductible == null ||
      booking.protectionCoverageLimit == null
    ) {
      return null;
    }

    const settledStatuses = new Set<PostTripChargeStatus>([
      PostTripChargeStatus.APPROVED,
      PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
      PostTripChargeStatus.PAID,
    ]);
    const settledCharges = (booking.postTripCharges ?? []).filter((charge) =>
      settledStatuses.has(charge.status),
    );
    const eligibleDamageAmount = ClaimCaseEntity.roundMoney(
      settledCharges
        .filter((charge) => charge.type === PostTripChargeType.DAMAGE)
        .reduce((total, charge) => total + (Number(charge.amount) || 0), 0),
    );
    const nonCoveredChargeAmount = ClaimCaseEntity.roundMoney(
      settledCharges
        .filter((charge) => charge.type !== PostTripChargeType.DAMAGE)
        .reduce((total, charge) => total + (Number(charge.amount) || 0), 0),
    );
    const deductibleAmount = Math.max(0, booking.protectionDeductible);
    const coverageLimit = Math.max(0, booking.protectionCoverageLimit);
    const deductibleAppliedAmount = Math.min(
      eligibleDamageAmount,
      deductibleAmount,
    );
    const amountAfterDeductible = Math.max(
      eligibleDamageAmount - deductibleAppliedAmount,
      0,
    );
    const platformCoverageAmount = Math.min(
      amountAfterDeductible,
      coverageLimit,
    );
    const excessAboveCoverageAmount = Math.max(
      amountAfterDeductible - platformCoverageAmount,
      0,
    );

    return new ClaimProtectionSettlementEntity({
      status:
        eligibleDamageAmount > 0
          ? ClaimProtectionSettlementStatus.CALCULATED
          : ClaimProtectionSettlementStatus.AWAITING_APPROVED_DAMAGE_CHARGE,
      protectionPlan: booking.protectionPlan,
      eligibleDamageAmount,
      nonCoveredChargeAmount,
      deductibleAmount: ClaimCaseEntity.roundMoney(deductibleAmount),
      deductibleAppliedAmount: ClaimCaseEntity.roundMoney(
        deductibleAppliedAmount,
      ),
      coverageLimit: ClaimCaseEntity.roundMoney(coverageLimit),
      platformCoverageAmount: ClaimCaseEntity.roundMoney(
        platformCoverageAmount,
      ),
      renterLiabilityAmount: ClaimCaseEntity.roundMoney(
        deductibleAppliedAmount + excessAboveCoverageAmount,
      ),
      excessAboveCoverageAmount: ClaimCaseEntity.roundMoney(
        excessAboveCoverageAmount,
      ),
    });
  }

  private static buildRisk(claimCase: ClaimCaseLike): ClaimCaseRiskEntity {
    const booking = claimCase.booking as
      | (ClaimCaseBookingSummary & Record<string, any>)
      | undefined;
    const incidents = Array.isArray(booking?.incidentReports)
      ? booking.incidentReports
      : [];
    const charges = Array.isArray(booking?.postTripCharges)
      ? booking.postTripCharges
      : [];
    const indicators: ClaimCaseRiskIndicatorEntity[] = [];
    let score = 0;

    const addIndicator = (
      code: string,
      label: string,
      severity: ClaimCaseRiskLevel,
      points: number,
    ) => {
      indicators.push(
        new ClaimCaseRiskIndicatorEntity({ code, label, severity }),
      );
      score += points;
    };

    if (incidents.some((incident) => incident.severity === 'CRITICAL')) {
      addIndicator(
        'CRITICAL_INCIDENT',
        'Critical-severity incident in this claim',
        ClaimCaseRiskLevel.HIGH,
        40,
      );
    } else if (incidents.some((incident) => incident.severity === 'HIGH')) {
      addIndicator(
        'HIGH_SEVERITY_INCIDENT',
        'High-severity incident in this claim',
        ClaimCaseRiskLevel.MEDIUM,
        25,
      );
    }

    if (incidents.length >= 2) {
      addIndicator(
        'MULTIPLE_INCIDENTS',
        `${incidents.length} incident reports are linked to this booking`,
        ClaimCaseRiskLevel.MEDIUM,
        20,
      );
    }

    const heldDeposit = Number(booking?.depositLedger?.heldAmount) || 0;
    const reviewChargeAmount = charges
      .filter((charge) =>
        ['PENDING_REVIEW', 'APPROVED', 'DISPUTED'].includes(
          String(charge.status),
        ),
      )
      .reduce((total, charge) => total + (Number(charge.amount) || 0), 0);
    if (heldDeposit > 0 && reviewChargeAmount >= heldDeposit) {
      addIndicator(
        'CLAIM_AMOUNT_EXCEEDS_DEPOSIT',
        'Open claim amount is at least the held deposit',
        ClaimCaseRiskLevel.HIGH,
        35,
      );
    } else if (heldDeposit > 0 && reviewChargeAmount >= heldDeposit * 0.5) {
      addIndicator(
        'CLAIM_AMOUNT_OVER_HALF_DEPOSIT',
        'Open claim amount is at least 50% of the held deposit',
        ClaimCaseRiskLevel.MEDIUM,
        25,
      );
    }

    if (
      booking?.depositLedger?.status === 'DISPUTED' ||
      charges.some((charge) => charge.status === 'DISPUTED')
    ) {
      addIndicator(
        'UNRESOLVED_DISPUTE',
        'Deposit or post-trip charge is currently disputed',
        ClaimCaseRiskLevel.MEDIUM,
        20,
      );
    }

    const tripCompletedAt = ClaimCaseEntity.toDate(booking?.trip?.completedAt);
    const firstActivityAt = ClaimCaseEntity.earliestDate([
      ...incidents.map((incident) => incident.createdAt),
      ...charges.map((charge) => charge.createdAt),
      claimCase.createdAt,
    ]);
    if (
      tripCompletedAt &&
      firstActivityAt &&
      firstActivityAt.getTime() >= tripCompletedAt.getTime() &&
      firstActivityAt.getTime() - tripCompletedAt.getTime() <=
        ClaimCaseEntity.hoursToMs(2)
    ) {
      addIndicator(
        'RAPID_POST_TRIP_CLAIM',
        'Claim activity started within 2 hours after trip completion',
        ClaimCaseRiskLevel.LOW,
        10,
      );
    }

    const lowTrustParties = [booking?.renter, booking?.owner].filter(
      (user: any) =>
        Number(user?.trustScore) > 0 && Number(user.trustScore) < 50,
    );
    if (lowTrustParties.length > 0) {
      addIndicator(
        'LOW_TRUST_PARTY',
        'One booking party has trust score below 50',
        ClaimCaseRiskLevel.MEDIUM,
        15,
      );
    }

    return new ClaimCaseRiskEntity({
      level:
        score >= 60
          ? ClaimCaseRiskLevel.HIGH
          : score >= 25
            ? ClaimCaseRiskLevel.MEDIUM
            : ClaimCaseRiskLevel.LOW,
      score,
      indicators,
    });
  }

  private static roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private static buildSla(
    claimCase: ClaimCaseLike,
    now: Date,
    policyInput?: Partial<ClaimCaseSlaPolicy>,
  ): ClaimCaseSlaEntity {
    const policy = ClaimCaseEntity.normalizePolicy(policyInput);
    if (ClaimCaseEntity.isFinalStatus(claimCase.status)) {
      return new ClaimCaseSlaEntity({
        status: ClaimCaseSlaStatus.COMPLETED,
        stage: ClaimCaseSlaStage.CLOSED,
        dueAt: null,
        label: 'Claim case is finalized',
        remainingMinutes: 0,
        overdueMinutes: 0,
        escalationLevel: 0,
      });
    }

    const stage =
      claimCase.status === ClaimCaseStatus.PENDING_SECOND_REVIEW
        ? ClaimCaseSlaStage.SECOND_REVIEW
        : ClaimCaseSlaStage.FIRST_REVIEW;
    const startAt =
      stage === ClaimCaseSlaStage.SECOND_REVIEW
        ? (claimCase.firstReviewedAt ?? claimCase.updatedAt)
        : claimCase.createdAt;
    const dueAt = new Date(
      startAt.getTime() +
        ClaimCaseEntity.hoursToMs(
          stage === ClaimCaseSlaStage.SECOND_REVIEW
            ? policy.secondReviewHours
            : policy.firstReviewHours,
        ),
    );
    const remainingMinutes = Math.ceil(
      (dueAt.getTime() - now.getTime()) / 60_000,
    );
    const overdueMinutes = Math.max(-remainingMinutes, 0);
    const status =
      overdueMinutes > 0
        ? ClaimCaseSlaStatus.OVERDUE
        : remainingMinutes <=
            ClaimCaseEntity.hoursToMinutes(policy.atRiskWindowHours)
          ? ClaimCaseSlaStatus.AT_RISK
          : ClaimCaseSlaStatus.ON_TRACK;

    return new ClaimCaseSlaEntity({
      status,
      stage,
      dueAt,
      label:
        stage === ClaimCaseSlaStage.SECOND_REVIEW
          ? 'Second admin review due'
          : 'First admin review due',
      remainingMinutes: Math.max(remainingMinutes, 0),
      overdueMinutes,
      escalationLevel: ClaimCaseEntity.escalationLevel(
        status,
        overdueMinutes,
        policy,
      ),
    });
  }

  private static normalizePolicy(
    policy?: Partial<ClaimCaseSlaPolicy>,
  ): ClaimCaseSlaPolicy {
    return {
      firstReviewHours: ClaimCaseEntity.positiveNumber(
        policy?.firstReviewHours,
        DEFAULT_CLAIM_CASE_SLA_POLICY.firstReviewHours,
      ),
      secondReviewHours: ClaimCaseEntity.positiveNumber(
        policy?.secondReviewHours,
        DEFAULT_CLAIM_CASE_SLA_POLICY.secondReviewHours,
      ),
      atRiskWindowHours: ClaimCaseEntity.positiveNumber(
        policy?.atRiskWindowHours,
        DEFAULT_CLAIM_CASE_SLA_POLICY.atRiskWindowHours,
      ),
      highEscalationOverdueHours: ClaimCaseEntity.positiveNumber(
        policy?.highEscalationOverdueHours,
        DEFAULT_CLAIM_CASE_SLA_POLICY.highEscalationOverdueHours,
      ),
    };
  }

  private static isFinalStatus(status: ClaimCaseStatus): boolean {
    return (
      status === ClaimCaseStatus.APPROVED ||
      status === ClaimCaseStatus.REJECTED ||
      status === ClaimCaseStatus.RESOLVED ||
      status === ClaimCaseStatus.CANCELLED
    );
  }

  private static escalationLevel(
    status: ClaimCaseSlaStatus,
    overdueMinutes: number,
    policy: ClaimCaseSlaPolicy,
  ): number {
    if (status === ClaimCaseSlaStatus.AT_RISK) return 1;
    if (status !== ClaimCaseSlaStatus.OVERDUE) return 0;
    return overdueMinutes >=
      ClaimCaseEntity.hoursToMinutes(policy.highEscalationOverdueHours)
      ? 3
      : 2;
  }

  private static hoursToMs(hours: number): number {
    return hours * 60 * 60 * 1000;
  }

  private static hoursToMinutes(hours: number): number {
    return hours * 60;
  }

  private static earliestDate(values: unknown[]): Date | null {
    const dates = values
      .map((value) => ClaimCaseEntity.toDate(value))
      .filter((value): value is Date => !!value)
      .sort((a, b) => a.getTime() - b.getTime());
    return dates[0] ?? null;
  }

  private static toDate(value: unknown): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private static positiveNumber(
    value: number | undefined,
    fallback: number,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return value;
  }
}
