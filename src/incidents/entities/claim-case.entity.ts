import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClaimCase, ClaimCaseOutcome, ClaimCaseStatus } from '@prisma/client';

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

  constructor(partial: Partial<ClaimCaseEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(
    claimCase: ClaimCaseLike,
    now = new Date(),
    policy?: Partial<ClaimCaseSlaPolicy>,
  ): ClaimCaseEntity {
    return new ClaimCaseEntity({
      ...claimCase,
      sla: ClaimCaseEntity.buildSla(claimCase, now, policy),
    });
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
