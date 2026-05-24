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

const FIRST_REVIEW_SLA_HOURS = 24;
const SECOND_REVIEW_SLA_HOURS = 12;
const AT_RISK_WINDOW_HOURS = 2;

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
  ): ClaimCaseEntity {
    return new ClaimCaseEntity({
      ...claimCase,
      sla: ClaimCaseEntity.buildSla(claimCase, now),
    });
  }

  private static buildSla(
    claimCase: ClaimCaseLike,
    now: Date,
  ): ClaimCaseSlaEntity {
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
        ? claimCase.firstReviewedAt ?? claimCase.updatedAt
        : claimCase.createdAt;
    const dueAt = new Date(
      startAt.getTime() +
        ClaimCaseEntity.hoursToMs(
          stage === ClaimCaseSlaStage.SECOND_REVIEW
            ? SECOND_REVIEW_SLA_HOURS
            : FIRST_REVIEW_SLA_HOURS,
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
            ClaimCaseEntity.hoursToMinutes(AT_RISK_WINDOW_HOURS)
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
      escalationLevel: ClaimCaseEntity.escalationLevel(status, overdueMinutes),
    });
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
  ): number {
    if (status === ClaimCaseSlaStatus.AT_RISK) return 1;
    if (status !== ClaimCaseSlaStatus.OVERDUE) return 0;
    return overdueMinutes >= ClaimCaseEntity.hoursToMinutes(24) ? 3 : 2;
  }

  private static hoursToMs(hours: number): number {
    return hours * 60 * 60 * 1000;
  }

  private static hoursToMinutes(hours: number): number {
    return hours * 60;
  }
}
