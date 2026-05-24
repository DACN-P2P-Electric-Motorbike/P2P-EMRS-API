import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DepositLedgerStatus, PayoutStatus } from '@prisma/client';
import {
  DepositLedgerEntity,
  OwnerPayoutEntity,
  PostTripChargeEntity,
} from '../../financial/entities/financial.entity';
import { ClaimCaseEntity } from './claim-case.entity';
import { EvidenceAnnotationEntity } from './evidence-annotation.entity';
import { IncidentReportEntity } from './incident-report.entity';

export enum BookingClaimWorkflowStatus {
  NO_CLAIM = 'NO_CLAIM',
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  AWAITING_CHARGE_REVIEW = 'AWAITING_CHARGE_REVIEW',
  AWAITING_DEPOSIT_DECISION = 'AWAITING_DEPOSIT_DECISION',
  AWAITING_PAYOUT = 'AWAITING_PAYOUT',
  RESOLVED = 'RESOLVED',
}

export enum ClaimActionActor {
  RENTER = 'RENTER',
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
}

export enum ClaimActionPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export class ClaimBlockerEntity {
  @ApiProperty()
  code: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  count: number;

  @ApiProperty()
  blocksDepositRelease: boolean;

  @ApiProperty()
  blocksOwnerPayout: boolean;

  constructor(partial: Partial<ClaimBlockerEntity>) {
    Object.assign(this, partial);
  }
}

export class ClaimNextActionEntity {
  @ApiProperty({ enum: ClaimActionActor })
  actor: ClaimActionActor;

  @ApiProperty()
  action: string;

  @ApiProperty()
  reason: string;

  @ApiProperty({ enum: ClaimActionPriority })
  priority: ClaimActionPriority;

  constructor(partial: Partial<ClaimNextActionEntity>) {
    Object.assign(this, partial);
  }
}

export class ClaimTimelineEventEntity {
  @ApiProperty()
  type: string;

  @ApiProperty()
  label: string;

  @ApiPropertyOptional()
  status?: string;

  @ApiPropertyOptional()
  amount?: number;

  @ApiProperty()
  occurredAt: Date;

  @ApiPropertyOptional()
  sourceId?: string;

  @ApiPropertyOptional()
  actorId?: string | null;

  @ApiPropertyOptional()
  metadata?: Record<string, unknown>;

  constructor(partial: Partial<ClaimTimelineEventEntity>) {
    Object.assign(this, partial);
  }
}

export class ClaimFinancialTotalsEntity {
  @ApiProperty()
  incidentCount: number;

  @ApiProperty()
  openIncidentCount: number;

  @ApiProperty()
  unresolvedIncidentCount: number;

  @ApiProperty()
  pendingChargeAmount: number;

  @ApiProperty()
  approvedChargeAmount: number;

  @ApiProperty()
  capturedChargeAmount: number;

  @ApiProperty()
  finalizedChargeAmount: number;

  @ApiProperty()
  heldDepositAmount: number;

  @ApiProperty()
  releasableDepositAmount: number;

  @ApiProperty()
  ownerPayoutAmount: number;

  constructor(partial: Partial<ClaimFinancialTotalsEntity>) {
    Object.assign(this, partial);
  }
}

export class BookingClaimSummaryEntity {
  @ApiProperty()
  bookingId: string;

  @ApiProperty({ enum: BookingClaimWorkflowStatus })
  status: BookingClaimWorkflowStatus;

  @ApiProperty()
  statusLabel: string;

  @ApiPropertyOptional()
  booking?: Record<string, unknown>;

  @ApiPropertyOptional({ type: DepositLedgerEntity, nullable: true })
  deposit: DepositLedgerEntity | null;

  @ApiProperty({ enum: DepositLedgerStatus, nullable: true })
  depositStatus: DepositLedgerStatus | null;

  @ApiProperty({ type: [PostTripChargeEntity] })
  charges: PostTripChargeEntity[];

  @ApiProperty({ type: [IncidentReportEntity] })
  incidents: IncidentReportEntity[];

  @ApiPropertyOptional({ type: OwnerPayoutEntity, nullable: true })
  ownerPayout: OwnerPayoutEntity | null;

  @ApiPropertyOptional({ type: ClaimCaseEntity, nullable: true })
  claimCase: ClaimCaseEntity | null;

  @ApiProperty({ type: [EvidenceAnnotationEntity] })
  evidenceAnnotations: EvidenceAnnotationEntity[];

  @ApiProperty({ enum: PayoutStatus, nullable: true })
  payoutStatus: PayoutStatus | null;

  @ApiProperty({ type: ClaimFinancialTotalsEntity })
  totals: ClaimFinancialTotalsEntity;

  @ApiProperty({ type: [ClaimBlockerEntity] })
  blockers: ClaimBlockerEntity[];

  @ApiProperty({ type: [ClaimNextActionEntity] })
  nextActions: ClaimNextActionEntity[];

  @ApiProperty({ type: [ClaimTimelineEventEntity] })
  timeline: ClaimTimelineEventEntity[];

  @ApiProperty()
  canReleaseDeposit: boolean;

  @ApiProperty()
  canProcessPayout: boolean;

  constructor(partial: Partial<BookingClaimSummaryEntity>) {
    Object.assign(this, partial);
  }
}
