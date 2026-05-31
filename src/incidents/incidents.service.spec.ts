import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  BookingStatus,
  ClaimCaseOutcome,
  ClaimCaseStatus,
  DepositLedgerStatus,
  EvidenceAnnotationTargetType,
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  NotificationType,
  PayoutStatus,
  PostTripChargeSource,
  PostTripChargeStatus,
  PostTripChargeType,
  ProtectionPlanType,
  TripStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IncidentEvidenceReceiptService } from '../upload/incident-evidence-receipt.service';
import {
  ClaimCaseAssignmentFilter,
  ClaimCaseRiskLevel,
  ClaimCaseSlaStage,
  ClaimCaseSlaStatus,
} from './entities';
import { ClaimCaseAssignmentAction } from './dto';
import { IncidentsService } from './incidents.service';

const BOOKING_ID = 'booking-uuid';
const TRIP_ID = 'trip-uuid';
const CHARGE_ID = 'charge-uuid';
const RENTER_ID = 'renter-uuid';
const OWNER_ID = 'owner-uuid';
const ADMIN_ID = 'admin-uuid';
const VEHICLE_ID = 'vehicle-uuid';

const makeBooking = (overrides: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  renterId: RENTER_ID,
  ownerId: OWNER_ID,
  vehicleId: VEHICLE_ID,
  status: BookingStatus.COMPLETED,
  startTime: new Date('2026-05-23T01:00:00.000Z'),
  endTime: new Date('2026-05-23T03:00:00.000Z'),
  trip: {
    id: TRIP_ID,
    status: TripStatus.COMPLETED,
    startedAt: new Date('2026-05-23T01:00:00.000Z'),
    completedAt: new Date('2026-05-23T03:05:00.000Z'),
  },
  depositLedger: {
    id: 'deposit-uuid',
    status: DepositLedgerStatus.HELD,
  },
  postTripCharges: [{ id: CHARGE_ID }],
  handovers: [
    {
      id: 'handover-uuid',
      type: 'CHECK_OUT',
      confirmedByOwner: true,
      confirmedByRenter: true,
      photos: [
        {
          id: 'photo-uuid',
          photoUrl: 'https://cdn.example.com/scratch.jpg',
          photoType: 'rear_panel',
          capturedAt: new Date('2026-05-23T03:00:00.000Z'),
        },
      ],
    },
  ],
  ...overrides,
});

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  id: 'incident-uuid',
  bookingId: BOOKING_ID,
  tripId: TRIP_ID,
  postTripChargeId: null,
  reporterId: RENTER_ID,
  category: IncidentCategory.DAMAGE,
  severity: IncidentSeverity.HIGH,
  status: IncidentStatus.OPEN,
  description: 'Rear panel scratch',
  evidence: {},
  requiredEvidence: {},
  adminNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  resolvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeClaimBooking = (overrides: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  renterId: RENTER_ID,
  ownerId: OWNER_ID,
  vehicleId: VEHICLE_ID,
  status: BookingStatus.COMPLETED,
  startTime: new Date('2026-05-23T01:00:00.000Z'),
  endTime: new Date('2026-05-23T03:00:00.000Z'),
  createdAt: new Date('2026-05-22T12:00:00.000Z'),
  renter: { id: RENTER_ID, fullName: 'Renter One' },
  owner: { id: OWNER_ID, fullName: 'Owner One' },
  vehicle: {
    id: VEHICLE_ID,
    brand: 'VinFast',
    model: 'Klara S',
    licensePlate: '51A-12345',
    images: [],
  },
  trip: {
    id: TRIP_ID,
    status: TripStatus.COMPLETED,
    startedAt: new Date('2026-05-23T01:00:00.000Z'),
    completedAt: new Date('2026-05-23T03:05:00.000Z'),
  },
  payment: {
    id: 'payment-uuid',
    status: 'COMPLETED',
    amount: 700_000,
    platformFee: 30_000,
    ownerAmount: 170_000,
    paidAt: new Date('2026-05-22T12:05:00.000Z'),
  },
  depositLedger: {
    id: 'deposit-uuid',
    bookingId: BOOKING_ID,
    paymentId: 'payment-uuid',
    status: DepositLedgerStatus.DISPUTED,
    heldAmount: 500_000,
    pendingChargeAmount: 120_000,
    capturedAmount: 0,
    releasedAmount: 0,
    refundedAmount: 0,
    notes: 'Open incident report requires admin review',
    heldAt: new Date('2026-05-22T12:05:00.000Z'),
    releaseDueAt: new Date('2026-05-24T03:05:00.000Z'),
    releasedAt: null,
    disputedAt: new Date('2026-05-23T04:00:00.000Z'),
    createdAt: new Date('2026-05-22T12:05:00.000Z'),
    updatedAt: new Date('2026-05-23T04:00:00.000Z'),
  },
  postTripCharges: [
    {
      id: CHARGE_ID,
      bookingId: BOOKING_ID,
      tripId: TRIP_ID,
      type: PostTripChargeType.DAMAGE,
      status: PostTripChargeStatus.PENDING_REVIEW,
      source: PostTripChargeSource.OWNER,
      amount: 120_000,
      quantity: null,
      unitPrice: null,
      description: 'Rear panel repair',
      evidence: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date('2026-05-23T03:30:00.000Z'),
      updatedAt: new Date('2026-05-23T03:30:00.000Z'),
    },
  ],
  incidentReports: [
    makeIncident({
      status: IncidentStatus.UNDER_REVIEW,
      createdAt: new Date('2026-05-23T03:20:00.000Z'),
      reviewedAt: new Date('2026-05-23T04:05:00.000Z'),
    }),
  ],
  ownerPayout: {
    id: 'payout-uuid',
    bookingId: BOOKING_ID,
    ownerId: OWNER_ID,
    paymentId: 'payment-uuid',
    status: PayoutStatus.ON_HOLD,
    grossRentalAmount: 200_000,
    platformFee: 30_000,
    ownerRentalAmount: 170_000,
    postTripChargeAmount: 0,
    payoutAmount: 170_000,
    holdReason: 'incident reports are open or under review',
    externalReference: null,
    notes: null,
    createdBy: ADMIN_ID,
    processedBy: null,
    processedAt: null,
    completedAt: null,
    createdAt: new Date('2026-05-23T05:00:00.000Z'),
    updatedAt: new Date('2026-05-23T05:00:00.000Z'),
  },
  claimCase: null,
  evidenceAnnotations: [],
  ...overrides,
});

const makeClaimCase = (overrides: Record<string, unknown> = {}) => ({
  id: 'claim-case-uuid',
  caseNumber: 'CLM-20260524010101-BOOKING',
  bookingId: BOOKING_ID,
  status: ClaimCaseStatus.OPEN,
  outcome: null,
  summary: '1 incident(s), 1 unresolved',
  openedBy: ADMIN_ID,
  assignedAdminId: null,
  assignedAt: null,
  firstDecision: null,
  firstReviewedBy: null,
  firstReviewNotes: null,
  firstReviewedAt: null,
  secondDecision: null,
  secondReviewedBy: null,
  secondReviewNotes: null,
  secondReviewedAt: null,
  resolutionNotes: null,
  resolvedAt: null,
  createdAt: new Date('2026-05-24T01:00:00.000Z'),
  updatedAt: new Date('2026-05-24T01:00:00.000Z'),
  assignee: null,
  ...overrides,
});

const makeClaimCaseBookingForRisk = (
  overrides: Record<string, unknown> = {},
) => ({
  id: BOOKING_ID,
  status: BookingStatus.COMPLETED,
  renterId: RENTER_ID,
  ownerId: OWNER_ID,
  vehicleId: VEHICLE_ID,
  startTime: new Date('2026-05-23T01:00:00.000Z'),
  endTime: new Date('2026-05-23T03:00:00.000Z'),
  renter: {
    id: RENTER_ID,
    fullName: 'Renter One',
    email: 'renter@example.com',
    trustScore: 45,
  },
  owner: {
    id: OWNER_ID,
    fullName: 'Owner One',
    email: 'owner@example.com',
    trustScore: 100,
  },
  vehicle: {
    id: VEHICLE_ID,
    brand: 'VinFast',
    model: 'Klara S',
    licensePlate: '51A-12345',
    images: [],
  },
  trip: {
    id: TRIP_ID,
    completedAt: new Date('2026-05-23T03:05:00.000Z'),
  },
  depositLedger: {
    id: 'deposit-uuid',
    status: DepositLedgerStatus.DISPUTED,
    heldAmount: 200_000,
  },
  postTripCharges: [
    {
      id: CHARGE_ID,
      status: PostTripChargeStatus.DISPUTED,
      amount: 220_000,
      createdAt: new Date('2026-05-23T03:40:00.000Z'),
    },
  ],
  incidentReports: [
    {
      id: 'incident-critical',
      severity: IncidentSeverity.CRITICAL,
      status: IncidentStatus.OPEN,
      createdAt: new Date('2026-05-23T03:30:00.000Z'),
    },
    {
      id: 'incident-low',
      severity: IncidentSeverity.LOW,
      status: IncidentStatus.OPEN,
      createdAt: new Date('2026-05-23T03:35:00.000Z'),
    },
  ],
  ...overrides,
});

const makeProtectedClaimCaseBooking = (
  overrides: Record<string, unknown> = {},
) => ({
  ...makeClaimCaseBookingForRisk(),
  protectionPlan: ProtectionPlanType.PREMIUM,
  protectionDeductible: 500_000,
  protectionCoverageLimit: 3_000_000,
  postTripCharges: [
    {
      id: 'approved-damage',
      type: PostTripChargeType.DAMAGE,
      status: PostTripChargeStatus.APPROVED,
      amount: 4_000_000,
      createdAt: new Date('2026-05-23T03:40:00.000Z'),
    },
    {
      id: 'captured-damage',
      type: PostTripChargeType.DAMAGE,
      status: PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
      amount: 2_000_000,
      createdAt: new Date('2026-05-23T03:42:00.000Z'),
    },
    {
      id: 'approved-low-battery',
      type: PostTripChargeType.LOW_BATTERY,
      status: PostTripChargeStatus.APPROVED,
      amount: 100_000,
      createdAt: new Date('2026-05-23T03:45:00.000Z'),
    },
    {
      id: 'waived-damage',
      type: PostTripChargeType.DAMAGE,
      status: PostTripChargeStatus.WAIVED,
      amount: 9_000_000,
      createdAt: new Date('2026-05-23T03:46:00.000Z'),
    },
  ],
  ...overrides,
});

const makeEvidenceAnnotation = (overrides: Record<string, unknown> = {}) => ({
  id: 'annotation-uuid',
  bookingId: BOOKING_ID,
  claimCaseId: 'claim-case-uuid',
  targetType: EvidenceAnnotationTargetType.INCIDENT_REPORT,
  targetId: 'incident-uuid',
  authorId: ADMIN_ID,
  note: 'Rear panel scratch is visible in checkout evidence.',
  tags: ['damage', 'checkout'],
  highlight: { x: 0.24, y: 0.36, width: 0.22, height: 0.18 },
  createdAt: new Date('2026-05-24T02:30:00.000Z'),
  updatedAt: new Date('2026-05-24T02:30:00.000Z'),
  author: {
    id: ADMIN_ID,
    fullName: 'Admin One',
    email: 'admin@example.com',
  },
  ...overrides,
});

const mockPrisma = () => ({
  booking: {
    findUnique: jest.fn(),
  },
  incidentReport: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  claimCase: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  evidenceAnnotation: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  notification: {
    findFirst: jest.fn(),
  },
  postTripCharge: {
    findFirst: jest.fn(),
  },
  vehicleHandover: {
    findFirst: jest.fn(),
  },
  handoverPhoto: {
    findFirst: jest.fn(),
  },
  depositLedger: {
    updateMany: jest.fn(),
  },
});

describe('IncidentsService', () => {
  let service: IncidentsService;
  let prisma: ReturnType<typeof mockPrisma>;
  let receiptService: jest.Mocked<IncidentEvidenceReceiptService>;

  beforeEach(() => {
    prisma = mockPrisma();
    receiptService = {
      verify: jest.fn().mockReturnValue({
        url: 'https://cdn.example.com/incidents/rear-panel.jpg',
        uploadedAt: '2026-05-25T03:00:00.000Z',
      }),
    } as unknown as jest.Mocked<IncidentEvidenceReceiptService>;
    service = new IncidentsService(
      prisma as unknown as PrismaService,
      undefined,
      undefined,
      receiptService,
    );
  });

  it('creates a participant incident with required handover evidence and marks deposit disputed', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());
    prisma.incidentReport.create.mockResolvedValue(makeIncident());
    prisma.depositLedger.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.createReport(RENTER_ID, [], {
      bookingId: BOOKING_ID,
      category: IncidentCategory.DAMAGE,
      severity: IncidentSeverity.HIGH,
      description: 'Rear panel scratch',
      handoverPhotoIds: ['photo-uuid'],
    });

    expect(prisma.incidentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingId: BOOKING_ID,
          tripId: TRIP_ID,
          reporterId: RENTER_ID,
          category: IncidentCategory.DAMAGE,
          status: IncidentStatus.OPEN,
          evidence: expect.objectContaining({
            handoverPhotos: [
              expect.objectContaining({
                id: 'photo-uuid',
                photoUrl: 'https://cdn.example.com/scratch.jpg',
                confirmedByOwner: true,
                confirmedByRenter: true,
                jointlyConfirmed: true,
              }),
            ],
            handoverEvidenceProvenance: {
              jointlyConfirmedPhotoCount: 1,
              pendingConfirmationPhotoCount: 0,
            },
          }),
          requiredEvidence: expect.objectContaining({
            photoRequired: true,
            satisfied: true,
          }),
        }),
        include: expect.any(Object),
      }),
    );
    expect(prisma.depositLedger.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ bookingId: BOOKING_ID }),
        data: expect.objectContaining({ status: DepositLedgerStatus.DISPUTED }),
      }),
    );
    expect(result.id).toBe('incident-uuid');
  });

  it('preserves pending handover sign-off provenance without blocking a report', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({
        handovers: [
          {
            id: 'handover-uuid',
            type: 'CHECK_OUT',
            confirmedByOwner: true,
            confirmedByRenter: false,
            photos: [
              {
                id: 'photo-uuid',
                photoUrl: 'https://cdn.example.com/scratch.jpg',
                photoType: 'rear_panel',
                capturedAt: new Date('2026-05-23T03:00:00.000Z'),
              },
            ],
          },
        ],
      }),
    );
    prisma.incidentReport.create.mockResolvedValue(makeIncident());
    prisma.depositLedger.updateMany.mockResolvedValue({ count: 1 });

    await service.createReport(RENTER_ID, [], {
      bookingId: BOOKING_ID,
      category: IncidentCategory.DAMAGE,
      description: 'Damage reported while checkout confirmation is disputed',
      handoverPhotoIds: ['photo-uuid'],
    });

    expect(prisma.incidentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            handoverPhotos: [
              expect.objectContaining({
                id: 'photo-uuid',
                jointlyConfirmed: false,
              }),
            ],
            handoverEvidenceProvenance: {
              jointlyConfirmedPhotoCount: 0,
              pendingConfirmationPhotoCount: 1,
            },
          }),
        }),
      }),
    );
  });

  it('verifies uploaded evidence receipts and snapshots server provenance', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());
    prisma.incidentReport.create.mockResolvedValue(makeIncident());
    prisma.depositLedger.updateMany.mockResolvedValue({ count: 1 });

    await service.createReport(RENTER_ID, [], {
      bookingId: BOOKING_ID,
      category: IncidentCategory.DAMAGE,
      description: 'Rear panel scratch documented after return',
      evidenceUploads: [
        {
          url: 'https://cdn.example.com/incidents/rear-panel.jpg',
          receipt: 'signed-upload-receipt',
        },
      ],
    });

    expect(receiptService.verify).toHaveBeenCalledWith(
      'signed-upload-receipt',
      RENTER_ID,
      'https://cdn.example.com/incidents/rear-panel.jpg',
    );
    expect(prisma.incidentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            evidenceUrls: ['https://cdn.example.com/incidents/rear-panel.jpg'],
            uploadedEvidence: [
              {
                url: 'https://cdn.example.com/incidents/rear-panel.jpg',
                uploadedAt: '2026-05-25T03:00:00.000Z',
                serverVerified: true,
              },
            ],
            uploadedEvidenceProvenance: {
              verifiedUploadCount: 1,
              legacyUrlCount: 0,
            },
          }),
        }),
      }),
    );
  });

  it('rejects an invalid uploaded evidence receipt', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());
    receiptService.verify.mockImplementationOnce(() => {
      throw new BadRequestException('Incident evidence receipt is invalid');
    });

    await expect(
      service.createReport(RENTER_ID, [], {
        bookingId: BOOKING_ID,
        category: IncidentCategory.DAMAGE,
        description: 'Submitted with a modified receipt',
        evidenceUploads: [
          {
            url: 'https://cdn.example.com/incidents/rear-panel.jpg',
            receipt: 'modified-receipt',
          },
        ],
      }),
    ).rejects.toThrow('Incident evidence receipt is invalid');

    expect(prisma.incidentReport.create).not.toHaveBeenCalled();
  });

  it('keeps verified and legacy uploaded evidence within one image limit', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      service.createReport(RENTER_ID, [], {
        bookingId: BOOKING_ID,
        category: IncidentCategory.DAMAGE,
        description: 'Too many uploaded evidence images',
        evidenceUrls: Array.from(
          { length: 10 },
          (_, index) => `https://cdn.example.com/incidents/legacy-${index}.jpg`,
        ),
        evidenceUploads: [
          {
            url: 'https://cdn.example.com/incidents/rear-panel.jpg',
            receipt: 'signed-upload-receipt',
          },
        ],
      }),
    ).rejects.toThrow('Incident evidence uploads cannot exceed 10 images');

    expect(prisma.incidentReport.create).not.toHaveBeenCalled();
  });

  it('requires evidence for damage, accident, theft, mismatch, and critical incidents', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      service.createReport(RENTER_ID, [], {
        bookingId: BOOKING_ID,
        category: IncidentCategory.DAMAGE,
        description: 'Damage without photo',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.incidentReport.create).not.toHaveBeenCalled();
  });

  it('hides booking incidents from non-participants', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      service.createReport('stranger-uuid', [], {
        bookingId: BOOKING_ID,
        category: IncidentCategory.OTHER,
        description: 'Trying to report on someone else booking',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects evidence photos that do not belong to the booking', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      service.createReport(RENTER_ID, [], {
        bookingId: BOOKING_ID,
        category: IncidentCategory.DAMAGE,
        description: 'Photo is from another booking',
        handoverPhotoIds: ['other-photo'],
      }),
    ).rejects.toThrow('Handover evidence must belong to the booking');
  });

  it('lists open admin queue and updates admin status', async () => {
    prisma.incidentReport.findMany.mockResolvedValue([makeIncident()]);
    prisma.incidentReport.findUnique.mockResolvedValue(makeIncident());
    prisma.incidentReport.update.mockResolvedValue(
      makeIncident({
        status: IncidentStatus.RESOLVED,
        reviewedBy: ADMIN_ID,
        adminNotes: 'Owner claim accepted',
        resolvedAt: new Date(),
      }),
    );

    const queue = await service.getAdminQueue(100);
    const updated = await service.updateStatus('incident-uuid', ADMIN_ID, {
      status: IncidentStatus.RESOLVED,
      adminNotes: 'Owner claim accepted',
    });

    expect(prisma.incidentReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: [IncidentStatus.OPEN, IncidentStatus.UNDER_REVIEW] },
        },
        take: 100,
      }),
    );
    expect(prisma.incidentReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'incident-uuid' },
        data: expect.objectContaining({
          status: IncidentStatus.RESOLVED,
          reviewedBy: ADMIN_ID,
          adminNotes: 'Owner claim accepted',
          resolvedAt: expect.any(Date),
        }),
      }),
    );
    expect(queue).toHaveLength(1);
    expect(updated.status).toBe(IncidentStatus.RESOLVED);
  });

  it('allows admins to view booking incidents', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());
    prisma.incidentReport.findMany.mockResolvedValue([makeIncident()]);

    await expect(
      service.listForBooking(BOOKING_ID, ADMIN_ID, [UserRole.ADMIN]),
    ).resolves.toHaveLength(1);
  });

  it('builds a unified claim summary for booking participants', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeClaimBooking());

    const summary = await service.getClaimSummaryForBooking(
      BOOKING_ID,
      RENTER_ID,
      [UserRole.RENTER],
    );

    expect(summary.status).toBe('UNDER_REVIEW');
    expect(summary.totals).toMatchObject({
      incidentCount: 1,
      unresolvedIncidentCount: 1,
      pendingChargeAmount: 120_000,
      heldDepositAmount: 500_000,
      ownerPayoutAmount: 170_000,
    });
    expect(summary.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining([
        'UNRESOLVED_INCIDENTS',
        'UNRESOLVED_POST_TRIP_CHARGES',
        'DEPOSIT_DECISION_PENDING',
        'OWNER_PAYOUT_ON_HOLD',
      ]),
    );
    expect(summary.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor: 'ADMIN',
          action: 'Resolve or reject incident reports',
        }),
        expect.objectContaining({
          actor: 'ADMIN',
          action: 'Review disputed or pending post-trip charges',
        }),
      ]),
    );
    expect(summary.timeline.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'BOOKING_CREATED',
        'INCIDENT_CREATED',
        'POST_TRIP_CHARGE_CREATED',
        'OWNER_PAYOUT_CREATED',
      ]),
    );
  });

  it('includes evidence annotations in admin claim summaries only', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeClaimBooking({
        evidenceAnnotations: [makeEvidenceAnnotation()],
      }),
    );

    const adminSummary = await service.getClaimSummaryForBooking(
      BOOKING_ID,
      ADMIN_ID,
      [UserRole.ADMIN],
    );

    expect(adminSummary.evidenceAnnotations).toHaveLength(1);
    expect(adminSummary.evidenceAnnotations[0]).toMatchObject({
      id: 'annotation-uuid',
      note: 'Rear panel scratch is visible in checkout evidence.',
      tags: ['damage', 'checkout'],
    });
    expect(adminSummary.timeline.map((event) => event.type)).toContain(
      'EVIDENCE_ANNOTATED',
    );

    prisma.booking.findUnique.mockResolvedValueOnce(
      makeClaimBooking({
        evidenceAnnotations: [makeEvidenceAnnotation()],
      }),
    );

    const renterSummary = await service.getClaimSummaryForBooking(
      BOOKING_ID,
      RENTER_ID,
      [UserRole.RENTER],
    );

    expect(renterSummary.evidenceAnnotations).toEqual([]);
    expect(renterSummary.timeline.map((event) => event.type)).not.toContain(
      'EVIDENCE_ANNOTATED',
    );
  });

  it('exposes finalized protection settlement to booking participants', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeClaimBooking({
        claimCase: makeClaimCase({
          status: ClaimCaseStatus.APPROVED,
          outcome: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
          booking: makeProtectedClaimCaseBooking(),
        }),
      }),
    );

    const summary = await service.getClaimSummaryForBooking(
      BOOKING_ID,
      RENTER_ID,
      [UserRole.RENTER],
    );

    expect(summary.claimCase?.protectionSettlement).toMatchObject({
      status: 'CALCULATED',
      eligibleDamageAmount: 6_000_000,
      platformCoverageAmount: 3_000_000,
      renterLiabilityAmount: 3_000_000,
    });
  });

  it('creates a booking-scoped evidence annotation for valid claim evidence', async () => {
    prisma.booking.findUnique.mockResolvedValue({ id: BOOKING_ID });
    prisma.incidentReport.findFirst.mockResolvedValue({ id: 'incident-uuid' });
    prisma.claimCase.findFirst.mockResolvedValue({ id: 'claim-case-uuid' });
    prisma.evidenceAnnotation.create.mockResolvedValue(
      makeEvidenceAnnotation({
        tags: ['damage', 'checkout'],
      }),
    );

    const result = await service.createEvidenceAnnotation(
      BOOKING_ID,
      ADMIN_ID,
      {
        targetType: EvidenceAnnotationTargetType.INCIDENT_REPORT,
        targetId: 'incident-uuid',
        claimCaseId: 'claim-case-uuid',
        note: '  Rear panel scratch visible in checkout photo.  ',
        tags: ['Damage', 'damage', 'Checkout'],
        highlight: { x: 0.24, y: 0.36 },
      },
    );

    expect(prisma.incidentReport.findFirst).toHaveBeenCalledWith({
      where: { id: 'incident-uuid', bookingId: BOOKING_ID },
      select: { id: true },
    });
    expect(prisma.claimCase.findFirst).toHaveBeenCalledWith({
      where: { id: 'claim-case-uuid', bookingId: BOOKING_ID },
      select: { id: true },
    });
    expect(prisma.evidenceAnnotation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingId: BOOKING_ID,
          claimCaseId: 'claim-case-uuid',
          targetType: EvidenceAnnotationTargetType.INCIDENT_REPORT,
          targetId: 'incident-uuid',
          authorId: ADMIN_ID,
          note: 'Rear panel scratch visible in checkout photo.',
          tags: ['damage', 'checkout'],
          highlight: { x: 0.24, y: 0.36 },
        }),
      }),
    );
    expect(result.id).toBe('annotation-uuid');
  });

  it('rejects evidence annotations for targets outside the booking', async () => {
    prisma.booking.findUnique.mockResolvedValue({ id: BOOKING_ID });
    prisma.handoverPhoto.findFirst.mockResolvedValue(null);

    await expect(
      service.createEvidenceAnnotation(BOOKING_ID, ADMIN_ID, {
        targetType: EvidenceAnnotationTargetType.HANDOVER_PHOTO,
        targetId: 'other-photo',
        note: 'Photo does not belong to this booking',
      }),
    ).rejects.toThrow('Evidence annotation target must belong to the booking');

    expect(prisma.evidenceAnnotation.create).not.toHaveBeenCalled();
  });

  it('lists evidence annotations for an admin booking dossier', async () => {
    prisma.booking.findUnique.mockResolvedValue({ id: BOOKING_ID });
    prisma.evidenceAnnotation.findMany.mockResolvedValue([
      makeEvidenceAnnotation(),
    ]);

    const result = await service.listEvidenceAnnotationsForBooking(BOOKING_ID);

    expect(prisma.evidenceAnnotation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: BOOKING_ID },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('creates a durable claim case from active claim activity', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeClaimBooking());
    prisma.claimCase.upsert.mockResolvedValue(makeClaimCase());

    const claimCase = await service.createOrRefreshClaimCase(
      BOOKING_ID,
      ADMIN_ID,
    );

    expect(prisma.claimCase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: BOOKING_ID },
        create: expect.objectContaining({
          bookingId: BOOKING_ID,
          openedBy: ADMIN_ID,
          status: ClaimCaseStatus.OPEN,
          summary: expect.stringContaining('1 incident(s)'),
        }),
        update: expect.objectContaining({
          status: ClaimCaseStatus.UNDER_REVIEW,
          summary: expect.stringContaining('deposit DISPUTED'),
        }),
      }),
    );
    expect(claimCase.id).toBe('claim-case-uuid');
  });

  it('derives claim-case SLA status and filters the admin case queue', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T02:30:00.000Z'));
    try {
      prisma.claimCase.findMany.mockResolvedValue([
        makeClaimCase({
          id: 'on-track-case',
          status: ClaimCaseStatus.OPEN,
          createdAt: new Date('2026-05-24T01:00:00.000Z'),
          updatedAt: new Date('2026-05-24T01:00:00.000Z'),
        }),
        makeClaimCase({
          id: 'overdue-case',
          status: ClaimCaseStatus.OPEN,
          createdAt: new Date('2026-05-22T01:00:00.000Z'),
          updatedAt: new Date('2026-05-22T01:00:00.000Z'),
        }),
        makeClaimCase({
          id: 'at-risk-case',
          status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
          firstDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
          firstReviewedBy: 'admin-one',
          firstReviewedAt: new Date('2026-05-23T16:00:00.000Z'),
          createdAt: new Date('2026-05-23T12:00:00.000Z'),
          updatedAt: new Date('2026-05-23T16:00:00.000Z'),
        }),
      ]);

      const cases = await service.getAdminClaimCases({ limit: 100 });

      expect(cases.map((claimCase) => claimCase.id)).toEqual([
        'overdue-case',
        'at-risk-case',
        'on-track-case',
      ]);
      expect(cases[0].sla).toMatchObject({
        status: ClaimCaseSlaStatus.OVERDUE,
        stage: 'FIRST_REVIEW',
        escalationLevel: 3,
      });
      expect(cases[1].sla).toMatchObject({
        status: ClaimCaseSlaStatus.AT_RISK,
        stage: 'SECOND_REVIEW',
        remainingMinutes: 90,
      });

      const overdueCases = await service.getAdminClaimCases({
        slaStatus: ClaimCaseSlaStatus.OVERDUE,
        limit: 100,
      });

      expect(overdueCases).toHaveLength(1);
      expect(overdueCases[0].id).toBe('overdue-case');

      const secondReviewCases = await service.getAdminClaimCases({
        slaStage: ClaimCaseSlaStage.SECOND_REVIEW,
        limit: 100,
      });

      expect(secondReviewCases).toHaveLength(1);
      expect(secondReviewCases[0].id).toBe('at-risk-case');
    } finally {
      jest.useRealTimers();
    }
  });

  it('derives deterministic risk indicators for admin claim cases', async () => {
    prisma.claimCase.findMany.mockResolvedValue([
      makeClaimCase({
        id: 'high-risk-case',
        booking: makeClaimCaseBookingForRisk(),
      }),
      makeClaimCase({
        id: 'low-risk-case',
        booking: makeClaimCaseBookingForRisk({
          renter: {
            id: RENTER_ID,
            fullName: 'Renter One',
            email: 'renter@example.com',
            trustScore: 100,
          },
          depositLedger: {
            id: 'deposit-uuid',
            status: DepositLedgerStatus.HELD,
            heldAmount: 500_000,
          },
          postTripCharges: [],
          incidentReports: [],
        }),
      }),
    ]);

    const cases = await service.getAdminClaimCases({ limit: 100 });

    expect(cases[0].risk).toMatchObject({
      level: ClaimCaseRiskLevel.HIGH,
      score: 140,
      indicators: expect.arrayContaining([
        expect.objectContaining({ code: 'CRITICAL_INCIDENT' }),
        expect.objectContaining({ code: 'MULTIPLE_INCIDENTS' }),
        expect.objectContaining({ code: 'CLAIM_AMOUNT_EXCEEDS_DEPOSIT' }),
        expect.objectContaining({ code: 'UNRESOLVED_DISPUTE' }),
        expect.objectContaining({ code: 'RAPID_POST_TRIP_CLAIM' }),
        expect.objectContaining({ code: 'LOW_TRUST_PARTY' }),
      ]),
    });
    expect(cases[0].booking?.renter).toEqual({
      id: RENTER_ID,
      fullName: 'Renter One',
      email: 'renter@example.com',
    });
    expect(cases[1].risk).toMatchObject({
      level: ClaimCaseRiskLevel.LOW,
      score: 0,
      indicators: [],
    });
  });

  it('applies protection deductible and limit to finalized approved damage charges', async () => {
    prisma.claimCase.findMany.mockResolvedValue([
      makeClaimCase({
        status: ClaimCaseStatus.APPROVED,
        outcome: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        booking: makeProtectedClaimCaseBooking(),
      }),
    ]);

    const cases = await service.getAdminClaimCases({ limit: 100 });

    expect(cases[0].protectionSettlement).toMatchObject({
      status: 'CALCULATED',
      protectionPlan: ProtectionPlanType.PREMIUM,
      eligibleDamageAmount: 6_000_000,
      nonCoveredChargeAmount: 100_000,
      deductibleAmount: 500_000,
      deductibleAppliedAmount: 500_000,
      coverageLimit: 3_000_000,
      platformCoverageAmount: 3_000_000,
      renterLiabilityAmount: 3_000_000,
      excessAboveCoverageAmount: 2_500_000,
    });
  });

  it('waits for an approved damage amount before calculating finalized owner claim settlement', async () => {
    prisma.claimCase.findMany.mockResolvedValue([
      makeClaimCase({
        status: ClaimCaseStatus.APPROVED,
        outcome: ClaimCaseOutcome.OWNER_CLAIM_PARTIALLY_APPROVED,
        booking: makeProtectedClaimCaseBooking({
          postTripCharges: [
            {
              id: 'pending-damage',
              type: PostTripChargeType.DAMAGE,
              status: PostTripChargeStatus.PENDING_REVIEW,
              amount: 1_000_000,
              createdAt: new Date('2026-05-23T03:40:00.000Z'),
            },
          ],
        }),
      }),
    ]);

    const cases = await service.getAdminClaimCases({ limit: 100 });

    expect(cases[0].protectionSettlement).toMatchObject({
      status: 'AWAITING_APPROVED_DAMAGE_CHARGE',
      eligibleDamageAmount: 0,
      platformCoverageAmount: 0,
      renterLiabilityAmount: 0,
    });
  });

  it('uses configured claim-case SLA policy for derivation and summary metadata', async () => {
    const previousEnv = {
      firstReview: process.env.CLAIM_CASE_FIRST_REVIEW_SLA_HOURS,
      secondReview: process.env.CLAIM_CASE_SECOND_REVIEW_SLA_HOURS,
      atRisk: process.env.CLAIM_CASE_AT_RISK_WINDOW_HOURS,
      highEscalation: process.env.CLAIM_CASE_HIGH_ESCALATION_OVERDUE_HOURS,
    };

    process.env.CLAIM_CASE_FIRST_REVIEW_SLA_HOURS = '6';
    process.env.CLAIM_CASE_SECOND_REVIEW_SLA_HOURS = '3';
    process.env.CLAIM_CASE_AT_RISK_WINDOW_HOURS = '1';
    process.env.CLAIM_CASE_HIGH_ESCALATION_OVERDUE_HOURS = '1';
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T08:30:00.000Z'));

    try {
      prisma.claimCase.findMany.mockResolvedValue([
        makeClaimCase({
          id: 'configured-overdue-case',
          status: ClaimCaseStatus.OPEN,
          createdAt: new Date('2026-05-24T01:00:00.000Z'),
          updatedAt: new Date('2026-05-24T01:00:00.000Z'),
        }),
      ]);

      const cases = await service.getAdminClaimCases({ limit: 10 });
      const summary = await service.getAdminClaimCaseQueueSummary(ADMIN_ID);

      expect(cases[0].sla.dueAt?.toISOString()).toBe(
        '2026-05-24T07:00:00.000Z',
      );
      expect(cases[0].sla).toMatchObject({
        status: ClaimCaseSlaStatus.OVERDUE,
        overdueMinutes: 90,
        escalationLevel: 3,
      });
      expect(summary.policy).toMatchObject({
        firstReviewHours: 6,
        secondReviewHours: 3,
        atRiskWindowHours: 1,
        highEscalationOverdueHours: 1,
      });
    } finally {
      const restoreEnv = (key: string, value: string | undefined) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      };
      restoreEnv('CLAIM_CASE_FIRST_REVIEW_SLA_HOURS', previousEnv.firstReview);
      restoreEnv(
        'CLAIM_CASE_SECOND_REVIEW_SLA_HOURS',
        previousEnv.secondReview,
      );
      restoreEnv('CLAIM_CASE_AT_RISK_WINDOW_HOURS', previousEnv.atRisk);
      restoreEnv(
        'CLAIM_CASE_HIGH_ESCALATION_OVERDUE_HOURS',
        previousEnv.highEscalation,
      );
      jest.useRealTimers();
    }
  });

  it('sends automated claim-case SLA escalation alerts to assigned admins and admin pool', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-25T00:15:00.000Z'));
    const notificationService = {
      createNotification: jest
        .fn()
        .mockImplementation((payload) =>
          Promise.resolve({ id: `notification-${payload.receiverId}` }),
        ),
    };
    const notificationGateway = {
      isUserOnline: jest.fn().mockReturnValue(true),
      sendToUser: jest.fn(),
      broadcastToAdmins: jest.fn(),
    };
    service = new IncidentsService(
      prisma as unknown as PrismaService,
      notificationService as any,
      notificationGateway as any,
    );
    prisma.claimCase.findMany.mockResolvedValue([
      makeClaimCase({
        id: 'assigned-at-risk-case',
        caseNumber: 'CLM-AT-RISK',
        assignedAdminId: ADMIN_ID,
        status: ClaimCaseStatus.OPEN,
        createdAt: new Date('2026-05-24T01:00:00.000Z'),
        updatedAt: new Date('2026-05-24T01:00:00.000Z'),
      }),
      makeClaimCase({
        id: 'unassigned-overdue-case',
        caseNumber: 'CLM-OVERDUE',
        assignedAdminId: null,
        status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
        firstDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        firstReviewedAt: new Date('2026-05-24T10:00:00.000Z'),
        createdAt: new Date('2026-05-24T08:00:00.000Z'),
        updatedAt: new Date('2026-05-24T10:00:00.000Z'),
      }),
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: ADMIN_ID },
      { id: 'admin-two' },
    ]);
    prisma.notification.findFirst.mockResolvedValue(null);

    try {
      await service.sendClaimCaseSlaEscalationAlerts();
    } finally {
      jest.useRealTimers();
    }

    expect(prisma.claimCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: {
            notIn: [
              ClaimCaseStatus.APPROVED,
              ClaimCaseStatus.REJECTED,
              ClaimCaseStatus.RESOLVED,
              ClaimCaseStatus.CANCELLED,
            ],
          },
        },
      }),
    );
    expect(notificationService.createNotification).toHaveBeenCalledTimes(3);
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: ADMIN_ID,
        type: NotificationType.SYSTEM_ALERT,
        title: expect.stringContaining('AT_RISK'),
        bookingId: BOOKING_ID,
      }),
    );
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'admin-two',
        type: NotificationType.SYSTEM_ALERT,
        title: expect.stringContaining('OVERDUE'),
        message: expect.stringContaining('quá hạn'),
      }),
    );
    expect(notificationGateway.sendToUser).toHaveBeenCalledTimes(3);
    expect(notificationGateway.broadcastToAdmins).toHaveBeenCalledTimes(1);
    expect(notificationGateway.broadcastToAdmins).toHaveBeenCalledWith(
      'admin_alert',
      expect.objectContaining({
        type: 'CLAIM_SLA_ESCALATION',
        claimCaseId: 'unassigned-overdue-case',
        slaStatus: ClaimCaseSlaStatus.OVERDUE,
      }),
    );
  });

  it('dedupes automated claim-case SLA escalation alerts', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-25T00:15:00.000Z'));
    const notificationService = {
      createNotification: jest.fn(),
    };
    const notificationGateway = {
      isUserOnline: jest.fn(),
      sendToUser: jest.fn(),
      broadcastToAdmins: jest.fn(),
    };
    service = new IncidentsService(
      prisma as unknown as PrismaService,
      notificationService as any,
      notificationGateway as any,
    );
    prisma.claimCase.findMany.mockResolvedValue([
      makeClaimCase({
        id: 'deduped-overdue-case',
        caseNumber: 'CLM-DEDUPED',
        assignedAdminId: null,
        status: ClaimCaseStatus.OPEN,
        createdAt: new Date('2026-05-23T00:00:00.000Z'),
        updatedAt: new Date('2026-05-23T00:00:00.000Z'),
      }),
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: ADMIN_ID }]);
    prisma.notification.findFirst.mockResolvedValue({ id: 'existing-alert' });

    try {
      await service.sendClaimCaseSlaEscalationAlerts();
    } finally {
      jest.useRealTimers();
    }

    expect(notificationService.createNotification).not.toHaveBeenCalled();
    expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
    expect(notificationGateway.broadcastToAdmins).not.toHaveBeenCalled();
  });

  it('filters admin claim cases by assignment ownership', async () => {
    prisma.claimCase.findMany.mockResolvedValue([
      makeClaimCase({
        id: 'assigned-case',
        assignedAdminId: ADMIN_ID,
        assignedAt: new Date('2026-05-24T01:30:00.000Z'),
        assignee: {
          id: ADMIN_ID,
          fullName: 'Admin One',
          email: 'admin@example.com',
        },
      }),
    ]);

    const cases = await service.getAdminClaimCases({
      assignment: ClaimCaseAssignmentFilter.MINE,
      adminId: ADMIN_ID,
      limit: 100,
    });

    expect(prisma.claimCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assignedAdminId: ADMIN_ID },
      }),
    );
    expect(cases[0].assignee?.fullName).toBe('Admin One');

    await service.getAdminClaimCases({
      assignment: ClaimCaseAssignmentFilter.UNASSIGNED,
      limit: 100,
    });

    expect(prisma.claimCase.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { assignedAdminId: null },
      }),
    );
  });

  it('builds a global admin claim-case queue summary', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T02:30:00.000Z'));
    try {
      prisma.claimCase.findMany.mockResolvedValue([
        makeClaimCase({
          id: 'mine-case',
          status: ClaimCaseStatus.OPEN,
          assignedAdminId: ADMIN_ID,
          createdAt: new Date('2026-05-24T01:00:00.000Z'),
          updatedAt: new Date('2026-05-24T01:00:00.000Z'),
        }),
        makeClaimCase({
          id: 'unassigned-overdue-case',
          status: ClaimCaseStatus.OPEN,
          assignedAdminId: null,
          createdAt: new Date('2026-05-22T01:00:00.000Z'),
          updatedAt: new Date('2026-05-22T01:00:00.000Z'),
        }),
        makeClaimCase({
          id: 'second-review-case',
          status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
          assignedAdminId: 'other-admin',
          firstReviewedAt: new Date('2026-05-23T16:00:00.000Z'),
          createdAt: new Date('2026-05-23T12:00:00.000Z'),
          updatedAt: new Date('2026-05-23T16:00:00.000Z'),
        }),
        makeClaimCase({
          id: 'finalized-case',
          status: ClaimCaseStatus.APPROVED,
          assignedAdminId: ADMIN_ID,
        }),
      ]);

      const summary = await service.getAdminClaimCaseQueueSummary(ADMIN_ID);

      expect(summary).toMatchObject({
        total: 4,
        active: 3,
        finalized: 1,
        assignedToMe: 1,
        unassigned: 1,
        firstReview: 2,
        secondReview: 1,
        closed: 1,
        overdue: 1,
        atRisk: 1,
        onTrack: 1,
        completed: 1,
        highRisk: 0,
        mediumRisk: 0,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('assigns an open claim case to the current admin and moves it under review', async () => {
    prisma.claimCase.findUnique.mockResolvedValue(makeClaimCase());
    prisma.claimCase.update.mockResolvedValue(
      makeClaimCase({
        status: ClaimCaseStatus.UNDER_REVIEW,
        assignedAdminId: ADMIN_ID,
        assignedAt: new Date('2026-05-24T02:00:00.000Z'),
        assignee: {
          id: ADMIN_ID,
          fullName: 'Admin One',
          email: 'admin@example.com',
        },
      }),
    );

    const result = await service.updateClaimCaseAssignment(
      'claim-case-uuid',
      ADMIN_ID,
      { action: ClaimCaseAssignmentAction.ASSIGN_SELF },
    );

    expect(prisma.claimCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'claim-case-uuid' },
        data: expect.objectContaining({
          assignedAdminId: ADMIN_ID,
          assignedAt: expect.any(Date),
          status: ClaimCaseStatus.UNDER_REVIEW,
        }),
      }),
    );
    expect(result.assignee?.fullName).toBe('Admin One');
  });

  it('releases an active claim case assignment', async () => {
    prisma.claimCase.findUnique.mockResolvedValue(
      makeClaimCase({
        status: ClaimCaseStatus.UNDER_REVIEW,
        assignedAdminId: ADMIN_ID,
        assignedAt: new Date('2026-05-24T02:00:00.000Z'),
      }),
    );
    prisma.claimCase.update.mockResolvedValue(
      makeClaimCase({
        status: ClaimCaseStatus.UNDER_REVIEW,
        assignedAdminId: null,
        assignedAt: null,
      }),
    );

    await service.updateClaimCaseAssignment('claim-case-uuid', ADMIN_ID, {
      action: ClaimCaseAssignmentAction.RELEASE,
    });

    expect(prisma.claimCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          assignedAdminId: null,
          assignedAt: null,
        },
      }),
    );
  });

  it('requires a different second admin with the same claim decision', async () => {
    prisma.claimCase.findUnique.mockResolvedValueOnce(makeClaimCase());
    prisma.claimCase.update.mockResolvedValueOnce(
      makeClaimCase({
        status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
        outcome: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        firstDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        firstReviewedBy: ADMIN_ID,
        firstReviewedAt: new Date('2026-05-24T02:00:00.000Z'),
      }),
    );

    const firstReview = await service.reviewClaimCase(
      'claim-case-uuid',
      ADMIN_ID,
      {
        decision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        notes: 'Evidence supports owner claim',
      },
    );

    expect(firstReview.status).toBe(ClaimCaseStatus.PENDING_SECOND_REVIEW);
    expect(prisma.claimCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
          firstReviewedBy: ADMIN_ID,
          status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
        }),
      }),
    );

    prisma.claimCase.findUnique.mockResolvedValueOnce(
      makeClaimCase({
        status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
        firstDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        firstReviewedBy: ADMIN_ID,
      }),
    );

    await expect(
      service.reviewClaimCase('claim-case-uuid', ADMIN_ID, {
        decision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
      }),
    ).rejects.toThrow('different admin');

    prisma.claimCase.findUnique.mockResolvedValueOnce(
      makeClaimCase({
        status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
        firstDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        firstReviewedBy: ADMIN_ID,
      }),
    );
    prisma.claimCase.update.mockResolvedValueOnce(
      makeClaimCase({
        status: ClaimCaseStatus.APPROVED,
        outcome: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        firstDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        firstReviewedBy: ADMIN_ID,
        secondDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        secondReviewedBy: 'admin-2',
        resolvedAt: new Date('2026-05-24T03:00:00.000Z'),
      }),
    );

    const finalReview = await service.reviewClaimCase(
      'claim-case-uuid',
      'admin-2',
      {
        decision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        notes: 'Second review agrees',
      },
    );

    expect(finalReview.status).toBe(ClaimCaseStatus.APPROVED);
    expect(prisma.claimCase.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          secondDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
          secondReviewedBy: 'admin-2',
          status: ClaimCaseStatus.APPROVED,
          resolvedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('notifies booking participants when a claim case is finalized', async () => {
    const notificationService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };
    const notificationGateway = {
      isUserOnline: jest.fn().mockReturnValue(true),
      sendToUser: jest.fn(),
    };
    service = new IncidentsService(
      prisma as unknown as PrismaService,
      notificationService as any,
      notificationGateway as any,
    );
    prisma.claimCase.findUnique.mockResolvedValueOnce(
      makeClaimCase({
        status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
        firstDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        firstReviewedBy: 'admin-one',
      }),
    );
    prisma.claimCase.update.mockResolvedValueOnce(
      makeClaimCase({
        status: ClaimCaseStatus.APPROVED,
        outcome: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        firstDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        firstReviewedBy: 'admin-one',
        secondDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        secondReviewedBy: ADMIN_ID,
        booking: {
          id: BOOKING_ID,
          renterId: RENTER_ID,
          ownerId: OWNER_ID,
        },
      }),
    );

    await service.reviewClaimCase('claim-case-uuid', ADMIN_ID, {
      decision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
      notes: 'Second review approved',
    });

    expect(notificationService.createNotification).toHaveBeenCalledTimes(2);
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: RENTER_ID,
        type: NotificationType.CLAIM_UPDATED,
        bookingId: BOOKING_ID,
      }),
    );
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: OWNER_ID,
        type: NotificationType.CLAIM_UPDATED,
        bookingId: BOOKING_ID,
      }),
    );
    expect(notificationGateway.sendToUser).toHaveBeenCalledWith(
      RENTER_ID,
      'claim_updated',
      expect.objectContaining({
        transition: 'FINALIZED',
        outcome: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
      }),
    );
  });

  // =========================================================================
  // Guard paths and additional branch coverage
  // =========================================================================

  it('creates a trip-issue incident with mechanical defaults', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());
    prisma.incidentReport.create.mockResolvedValue(
      makeIncident({ category: IncidentCategory.MECHANICAL_ISSUE }),
    );

    await service.createFromTripIssue({
      tripId: TRIP_ID,
      bookingId: BOOKING_ID,
      reporterId: RENTER_ID,
      description: 'Motor cut out mid-ride',
    });

    expect(prisma.incidentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: IncidentCategory.MECHANICAL_ISSUE,
          severity: IncidentSeverity.MEDIUM,
        }),
      }),
    );
  });

  it('throws when verified evidence uploads are submitted without the receipt service', async () => {
    const serviceWithoutReceipts = new IncidentsService(
      prisma as unknown as PrismaService,
    );
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      serviceWithoutReceipts.createReport(RENTER_ID, [], {
        bookingId: BOOKING_ID,
        category: IncidentCategory.DAMAGE,
        description: 'Upload without verification support',
        evidenceUploads: [
          { url: 'https://cdn.example.com/x.jpg', receipt: 'r' },
        ],
      }),
    ).rejects.toThrow('Verified incident evidence uploads are unavailable');
  });

  it('rejects a report with a blank description', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      service.createReport(RENTER_ID, [], {
        bookingId: BOOKING_ID,
        category: IncidentCategory.OTHER,
        description: '   ',
      }),
    ).rejects.toThrow('Incident description is required');
  });

  it('rejects a report whose tripId does not match the booking', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      service.createReport(RENTER_ID, [], {
        bookingId: BOOKING_ID,
        tripId: 'other-trip',
        category: IncidentCategory.OTHER,
        description: 'Trip mismatch',
      }),
    ).rejects.toThrow('Incident trip must belong to the booking');
  });

  it('rejects a report whose post-trip charge does not belong to the booking', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      service.createReport(RENTER_ID, [], {
        bookingId: BOOKING_ID,
        category: IncidentCategory.OTHER,
        description: 'Charge mismatch',
        postTripChargeId: 'charge-not-mine',
      }),
    ).rejects.toThrow('Post-trip charge must belong to the booking');
  });

  it('hides booking incidents from non-participants in listForBooking', async () => {
    prisma.booking.findUnique.mockResolvedValue({
      id: BOOKING_ID,
      renterId: RENTER_ID,
      ownerId: OWNER_ID,
    });

    await expect(
      service.listForBooking(BOOKING_ID, 'stranger', [UserRole.RENTER]),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when claim summary booking is missing', async () => {
    prisma.booking.findUnique.mockResolvedValue(null);

    await expect(
      service.getClaimSummaryForBooking(BOOKING_ID, RENTER_ID, [
        UserRole.RENTER,
      ]),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when listing annotations for a missing booking', async () => {
    prisma.booking.findUnique.mockResolvedValue(null);

    await expect(
      service.listEvidenceAnnotationsForBooking(BOOKING_ID),
    ).rejects.toThrow(NotFoundException);
  });

  describe('createEvidenceAnnotation guards', () => {
    it('throws NotFoundException when the booking is missing', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(
        service.createEvidenceAnnotation(BOOKING_ID, ADMIN_ID, {
          targetType: EvidenceAnnotationTargetType.INCIDENT_REPORT,
          targetId: 'incident-uuid',
          note: 'note',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('requires a non-empty note', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: BOOKING_ID });

      await expect(
        service.createEvidenceAnnotation(BOOKING_ID, ADMIN_ID, {
          targetType: EvidenceAnnotationTargetType.INCIDENT_REPORT,
          targetId: 'incident-uuid',
          note: '   ',
        }),
      ).rejects.toThrow('Evidence annotation note is required');
    });

    it('rejects a claim case that does not belong to the booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: BOOKING_ID });
      prisma.incidentReport.findFirst.mockResolvedValue({ id: 'incident-uuid' });
      prisma.claimCase.findFirst.mockResolvedValue(null);

      await expect(
        service.createEvidenceAnnotation(BOOKING_ID, ADMIN_ID, {
          targetType: EvidenceAnnotationTargetType.INCIDENT_REPORT,
          targetId: 'incident-uuid',
          claimCaseId: 'foreign-claim',
          note: 'note',
        }),
      ).rejects.toThrow('Claim case must belong to the booking');
    });

    it('annotates a post-trip charge target that belongs to the booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: BOOKING_ID });
      prisma.postTripCharge.findFirst.mockResolvedValue({ id: CHARGE_ID });
      prisma.evidenceAnnotation.create.mockResolvedValue(
        makeEvidenceAnnotation({
          targetType: EvidenceAnnotationTargetType.POST_TRIP_CHARGE,
          targetId: CHARGE_ID,
        }),
      );

      await service.createEvidenceAnnotation(BOOKING_ID, ADMIN_ID, {
        targetType: EvidenceAnnotationTargetType.POST_TRIP_CHARGE,
        targetId: CHARGE_ID,
        note: 'Charge evidence',
      });

      expect(prisma.postTripCharge.findFirst).toHaveBeenCalledWith({
        where: { id: CHARGE_ID, bookingId: BOOKING_ID },
        select: { id: true },
      });
      expect(prisma.evidenceAnnotation.create).toHaveBeenCalled();
    });

    it('annotates a vehicle-handover target that belongs to the booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: BOOKING_ID });
      prisma.vehicleHandover.findFirst.mockResolvedValue({ id: 'handover-uuid' });
      prisma.evidenceAnnotation.create.mockResolvedValue(
        makeEvidenceAnnotation({
          targetType: EvidenceAnnotationTargetType.VEHICLE_HANDOVER,
          targetId: 'handover-uuid',
        }),
      );

      await service.createEvidenceAnnotation(BOOKING_ID, ADMIN_ID, {
        targetType: EvidenceAnnotationTargetType.VEHICLE_HANDOVER,
        targetId: 'handover-uuid',
        note: 'Handover evidence',
      });

      expect(prisma.vehicleHandover.findFirst).toHaveBeenCalledWith({
        where: { id: 'handover-uuid', bookingId: BOOKING_ID },
        select: { id: true },
      });
    });

    it('resolves a handover-photo target through its parent handover', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: BOOKING_ID });
      prisma.handoverPhoto.findFirst.mockResolvedValue({ id: 'photo-uuid' });
      prisma.evidenceAnnotation.create.mockResolvedValue(
        makeEvidenceAnnotation({
          targetType: EvidenceAnnotationTargetType.HANDOVER_PHOTO,
          targetId: 'photo-uuid',
        }),
      );

      await service.createEvidenceAnnotation(BOOKING_ID, ADMIN_ID, {
        targetType: EvidenceAnnotationTargetType.HANDOVER_PHOTO,
        targetId: 'photo-uuid',
        note: 'Photo evidence',
      });

      expect(prisma.handoverPhoto.findFirst).toHaveBeenCalledWith({
        where: { id: 'photo-uuid', handover: { bookingId: BOOKING_ID } },
        select: { id: true },
      });
    });
  });

  describe('createOrRefreshClaimCase guards', () => {
    it('throws NotFoundException when the booking is missing', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrRefreshClaimCase(BOOKING_ID, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses to open a claim case without any claim activity', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeClaimBooking({
          incidentReports: [],
          postTripCharges: [],
          depositLedger: { id: 'd', status: DepositLedgerStatus.HELD },
          ownerPayout: null,
          claimCase: null,
        }),
      );

      await expect(
        service.createOrRefreshClaimCase(BOOKING_ID, ADMIN_ID),
      ).rejects.toThrow('without incidents, charges, deposit blockers');
    });

    it('refuses to refresh a finalized claim case', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeClaimBooking({
          claimCase: makeClaimCase({ status: ClaimCaseStatus.RESOLVED }),
        }),
      );

      await expect(
        service.createOrRefreshClaimCase(BOOKING_ID, ADMIN_ID),
      ).rejects.toThrow('Finalized claim cases cannot be refreshed');
    });
  });

  it('filters the admin claim queue by claim status', async () => {
    prisma.claimCase.findMany.mockResolvedValue([makeClaimCase()]);

    await service.getAdminClaimCases({
      status: ClaimCaseStatus.OPEN,
      limit: 25,
    });

    expect(prisma.claimCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: ClaimCaseStatus.OPEN },
        take: 25,
      }),
    );
  });

  it('counts high and medium risk cases in the queue summary', async () => {
    prisma.claimCase.findMany.mockResolvedValue([
      makeClaimCase({
        id: 'high-risk',
        booking: makeClaimCaseBookingForRisk(),
      }),
      makeClaimCase({
        id: 'medium-risk',
        booking: makeClaimCaseBookingForRisk({
          renter: {
            id: RENTER_ID,
            fullName: 'Renter One',
            email: 'renter@example.com',
            trustScore: 100,
          },
          depositLedger: {
            id: 'deposit-uuid',
            status: DepositLedgerStatus.HELD,
            heldAmount: 500_000,
          },
          postTripCharges: [],
          incidentReports: [
            {
              id: 'incident-high',
              severity: IncidentSeverity.HIGH,
              status: IncidentStatus.OPEN,
              createdAt: new Date('2026-05-23T03:30:00.000Z'),
            },
          ],
        }),
      }),
    ]);

    const summary = await service.getAdminClaimCaseQueueSummary(ADMIN_ID);

    expect(summary.highRisk).toBe(1);
    expect(summary.mediumRisk).toBe(1);
  });

  describe('updateClaimCaseAssignment guards', () => {
    it('throws NotFoundException for a missing claim case', async () => {
      prisma.claimCase.findUnique.mockResolvedValue(null);

      await expect(
        service.updateClaimCaseAssignment('missing', ADMIN_ID, {
          action: ClaimCaseAssignmentAction.ASSIGN_SELF,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses to reassign a finalized claim case', async () => {
      prisma.claimCase.findUnique.mockResolvedValue(
        makeClaimCase({ status: ClaimCaseStatus.APPROVED }),
      );

      await expect(
        service.updateClaimCaseAssignment('claim-case-uuid', ADMIN_ID, {
          action: ClaimCaseAssignmentAction.ASSIGN_SELF,
        }),
      ).rejects.toThrow('Finalized claim cases cannot be reassigned');
    });

    it('keeps a non-open claim case status when self-assigning', async () => {
      prisma.claimCase.findUnique.mockResolvedValue(
        makeClaimCase({ status: ClaimCaseStatus.UNDER_REVIEW }),
      );
      prisma.claimCase.update.mockResolvedValue(
        makeClaimCase({
          status: ClaimCaseStatus.UNDER_REVIEW,
          assignedAdminId: ADMIN_ID,
        }),
      );

      await service.updateClaimCaseAssignment('claim-case-uuid', ADMIN_ID, {
        action: ClaimCaseAssignmentAction.ASSIGN_SELF,
      });

      expect(prisma.claimCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedAdminId: ADMIN_ID,
            status: ClaimCaseStatus.UNDER_REVIEW,
          }),
        }),
      );
    });
  });

  describe('reviewClaimCase guards', () => {
    it('throws NotFoundException for a missing claim case', async () => {
      prisma.claimCase.findUnique.mockResolvedValue(null);

      await expect(
        service.reviewClaimCase('missing', ADMIN_ID, {
          decision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses to review a finalized claim case', async () => {
      prisma.claimCase.findUnique.mockResolvedValue(
        makeClaimCase({ status: ClaimCaseStatus.REJECTED }),
      );

      await expect(
        service.reviewClaimCase('claim-case-uuid', ADMIN_ID, {
          decision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        }),
      ).rejects.toThrow('Finalized claim cases cannot be reviewed');
    });

    it('rejects a second review whose decision differs from the first', async () => {
      prisma.claimCase.findUnique.mockResolvedValue(
        makeClaimCase({
          status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
          firstDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
          firstReviewedBy: 'admin-one',
        }),
      );

      await expect(
        service.reviewClaimCase('claim-case-uuid', ADMIN_ID, {
          decision: ClaimCaseOutcome.OWNER_CLAIM_REJECTED,
        }),
      ).rejects.toThrow('Second claim review must match the first decision');
    });

    it('resolves to REJECTED when both reviews reject the owner claim', async () => {
      prisma.claimCase.findUnique.mockResolvedValue(
        makeClaimCase({
          status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
          firstDecision: ClaimCaseOutcome.OWNER_CLAIM_REJECTED,
          firstReviewedBy: 'admin-one',
        }),
      );
      prisma.claimCase.update.mockResolvedValue(
        makeClaimCase({
          status: ClaimCaseStatus.REJECTED,
          outcome: ClaimCaseOutcome.OWNER_CLAIM_REJECTED,
        }),
      );

      const result = await service.reviewClaimCase(
        'claim-case-uuid',
        ADMIN_ID,
        { decision: ClaimCaseOutcome.OWNER_CLAIM_REJECTED },
      );

      expect(result.status).toBe(ClaimCaseStatus.REJECTED);
      expect(prisma.claimCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ClaimCaseStatus.REJECTED,
          }),
        }),
      );
    });

    it('resolves to RESOLVED when both reviews require no action', async () => {
      prisma.claimCase.findUnique.mockResolvedValue(
        makeClaimCase({
          status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
          firstDecision: ClaimCaseOutcome.NO_ACTION_REQUIRED,
          firstReviewedBy: 'admin-one',
          firstReviewNotes: 'No further action',
        }),
      );
      prisma.claimCase.update.mockResolvedValue(
        makeClaimCase({
          status: ClaimCaseStatus.RESOLVED,
          outcome: ClaimCaseOutcome.NO_ACTION_REQUIRED,
        }),
      );

      // Pass no notes so the resolutionNotes falls back to firstReviewNotes.
      const result = await service.reviewClaimCase(
        'claim-case-uuid',
        ADMIN_ID,
        { decision: ClaimCaseOutcome.NO_ACTION_REQUIRED },
      );

      expect(result.status).toBe(ClaimCaseStatus.RESOLVED);
      expect(prisma.claimCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ClaimCaseStatus.RESOLVED,
            resolutionNotes: 'No further action',
          }),
        }),
      );
    });
  });

  describe('updateStatus guards', () => {
    it('rejects an unsupported review status', async () => {
      await expect(
        service.updateStatus('incident-uuid', ADMIN_ID, {
          status: IncidentStatus.OPEN,
        }),
      ).rejects.toThrow('Unsupported incident review status');
    });

    it('throws NotFoundException for a missing incident', async () => {
      prisma.incidentReport.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('missing', ADMIN_ID, {
          status: IncidentStatus.UNDER_REVIEW,
        }),
      ).rejects.toThrow('Incident report not found');
    });

    it('refuses to change a finalized incident', async () => {
      prisma.incidentReport.findUnique.mockResolvedValue(
        makeIncident({ status: IncidentStatus.RESOLVED }),
      );

      await expect(
        service.updateStatus('incident-uuid', ADMIN_ID, {
          status: IncidentStatus.UNDER_REVIEW,
        }),
      ).rejects.toThrow('Finalized incidents cannot be changed');
    });

    it('moves an incident under review without resolving it', async () => {
      prisma.incidentReport.findUnique.mockResolvedValue(makeIncident());
      prisma.incidentReport.update.mockResolvedValue(
        makeIncident({ status: IncidentStatus.UNDER_REVIEW }),
      );

      await service.updateStatus('incident-uuid', ADMIN_ID, {
        status: IncidentStatus.UNDER_REVIEW,
        adminNotes: '  ',
      });

      expect(prisma.incidentReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: IncidentStatus.UNDER_REVIEW,
            adminNotes: null,
            resolvedAt: null,
          }),
        }),
      );
    });
  });

  it('exposes the open incident statuses', () => {
    expect(IncidentsService.openStatuses()).toEqual([
      IncidentStatus.OPEN,
      IncidentStatus.UNDER_REVIEW,
    ]);
  });

  it('creates a report on a booking that has no trip', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking({ trip: null }));
    prisma.incidentReport.create.mockResolvedValue(
      makeIncident({ tripId: null }),
    );

    await service.createReport(RENTER_ID, [], {
      bookingId: BOOKING_ID,
      category: IncidentCategory.OTHER,
      description: 'General issue, no trip linked',
    });

    expect(prisma.incidentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tripId: null }),
      }),
    );
  });

  it('refreshes a pending-second-review claim case while keeping its status', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeClaimBooking({
        depositLedger: null,
        ownerPayout: null,
        postTripCharges: [],
        incidentReports: [makeIncident({ status: IncidentStatus.OPEN })],
        claimCase: makeClaimCase({
          status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
        }),
      }),
    );
    prisma.claimCase.upsert.mockResolvedValue(
      makeClaimCase({ status: ClaimCaseStatus.PENDING_SECOND_REVIEW }),
    );

    await service.createOrRefreshClaimCase(BOOKING_ID, ADMIN_ID);

    expect(prisma.claimCase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
          // No deposit ledger or payout → snapshot uses NO_DEPOSIT_LEDGER/NO_PAYOUT.
          summary: expect.stringContaining('deposit NO_DEPOSIT_LEDGER'),
        }),
      }),
    );
  });

  it('notifies participants even when the realtime gateway reports them offline', async () => {
    const notificationService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };
    const notificationGateway = {
      isUserOnline: jest.fn().mockReturnValue(false),
      sendToUser: jest.fn(),
    };
    const offlineService = new IncidentsService(
      prisma as unknown as PrismaService,
      notificationService as any,
      notificationGateway as any,
    );
    prisma.claimCase.findUnique.mockResolvedValue(makeClaimCase());
    prisma.claimCase.update.mockResolvedValue(
      makeClaimCase({
        status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
        firstDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        firstReviewedBy: ADMIN_ID,
        booking: { id: BOOKING_ID, renterId: RENTER_ID, ownerId: RENTER_ID },
      }),
    );

    await offlineService.reviewClaimCase('claim-case-uuid', ADMIN_ID, {
      decision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
    });

    // Renter and owner are the same id here → a single deduped recipient.
    expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
    expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
  });

  it('orders equal-status equal-due claim cases by recency', async () => {
    prisma.claimCase.findMany.mockResolvedValue([
      makeClaimCase({
        id: 'older-finalized',
        status: ClaimCaseStatus.APPROVED,
        outcome: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        createdAt: new Date('2026-05-24T01:00:00.000Z'),
        updatedAt: new Date('2026-05-24T01:00:00.000Z'),
      }),
      makeClaimCase({
        id: 'newer-finalized',
        status: ClaimCaseStatus.APPROVED,
        outcome: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        createdAt: new Date('2026-05-24T01:30:00.000Z'),
        updatedAt: new Date('2026-05-24T01:30:00.000Z'),
      }),
    ]);

    const cases = await service.getAdminClaimCases({ limit: 100 });

    // Both finalized → COMPLETED status, null dueAt → fall back to createdAt desc.
    expect(cases.map((claimCase) => claimCase.id)).toEqual([
      'newer-finalized',
      'older-finalized',
    ]);
  });

  it('builds an admin claim summary when evidence annotations are absent', async () => {
    const { evidenceAnnotations, ...bookingWithoutAnnotations } =
      makeClaimBooking();
    void evidenceAnnotations;
    prisma.booking.findUnique.mockResolvedValue(bookingWithoutAnnotations);

    const summary = await service.getClaimSummaryForBooking(
      BOOKING_ID,
      ADMIN_ID,
      [UserRole.ADMIN],
    );

    expect(summary.evidenceAnnotations).toEqual([]);
    expect(summary.timeline.map((event) => event.type)).not.toContain(
      'EVIDENCE_ANNOTATED',
    );
  });

  it('coerces string timeline timestamps into dates', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeClaimBooking({
        payment: {
          id: 'payment-uuid',
          status: 'COMPLETED',
          amount: 700_000,
          // A string paidAt must be coerced into a Date for the timeline.
          paidAt: '2026-05-22T12:05:00.000Z',
        },
      }),
    );

    const summary = await service.getClaimSummaryForBooking(
      BOOKING_ID,
      RENTER_ID,
      [UserRole.RENTER],
    );

    const paymentEvent = summary.timeline.find(
      (event) => event.type === 'PAYMENT_COMPLETED',
    );
    expect(paymentEvent?.occurredAt).toBeInstanceOf(Date);
    expect(paymentEvent?.occurredAt.toISOString()).toBe(
      '2026-05-22T12:05:00.000Z',
    );
  });

  it('defaults the admin queue limit and MINE filter when inputs are omitted', async () => {
    prisma.claimCase.findMany.mockResolvedValue([]);

    // No limit → defaults to 50; MINE without adminId → empty-string match.
    await service.getAdminClaimCases({
      assignment: ClaimCaseAssignmentFilter.MINE,
    });

    expect(prisma.claimCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assignedAdminId: '' },
        take: 50,
      }),
    );
  });

  it('clamps a zero limit up to the default for the admin queue', async () => {
    prisma.claimCase.findMany.mockResolvedValue([]);

    await service.getAdminClaimCases({ limit: 0 });

    expect(prisma.claimCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('clamps the admin incident queue limit between 1 and 100', async () => {
    prisma.incidentReport.findMany.mockResolvedValue([]);

    await service.getAdminQueue(0);
    expect(prisma.incidentReport.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 50 }),
    );

    await service.getAdminQueue(5000);
    expect(prisma.incidentReport.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  describe('claim summary blockers and next actions', () => {
    it('surfaces release and payout actions when no blockers remain', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeClaimBooking({
          incidentReports: [],
          postTripCharges: [],
          depositLedger: {
            id: 'deposit-uuid',
            status: DepositLedgerStatus.HELD,
            heldAmount: 500_000,
            releasedAmount: 0,
          },
          ownerPayout: {
            id: 'payout-uuid',
            bookingId: BOOKING_ID,
            ownerId: OWNER_ID,
            status: PayoutStatus.PENDING,
            payoutAmount: 170_000,
            holdReason: null,
            createdBy: ADMIN_ID,
            createdAt: new Date('2026-05-23T05:00:00.000Z'),
          },
          claimCase: null,
        }),
      );

      const summary = await service.getClaimSummaryForBooking(
        BOOKING_ID,
        RENTER_ID,
        [UserRole.RENTER],
      );

      expect(summary.canReleaseDeposit).toBe(true);
      expect(summary.canProcessPayout).toBe(true);
      expect(summary.nextActions.map((action) => action.action)).toEqual(
        expect.arrayContaining([
          'Release remaining deposit',
          'Process owner payout',
        ]),
      );
    });

    it('flags approved-but-uncaptured charges as a blocker', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeClaimBooking({
          incidentReports: [],
          postTripCharges: [
            {
              id: CHARGE_ID,
              bookingId: BOOKING_ID,
              tripId: TRIP_ID,
              type: PostTripChargeType.DAMAGE,
              status: PostTripChargeStatus.APPROVED,
              amount: 120_000,
              createdAt: new Date('2026-05-23T03:30:00.000Z'),
              updatedAt: new Date('2026-05-23T03:30:00.000Z'),
            },
          ],
          depositLedger: {
            id: 'deposit-uuid',
            status: DepositLedgerStatus.HELD,
            heldAmount: 500_000,
          },
          ownerPayout: null,
          claimCase: null,
        }),
      );

      const summary = await service.getClaimSummaryForBooking(
        BOOKING_ID,
        RENTER_ID,
        [UserRole.RENTER],
      );

      expect(summary.blockers.map((blocker) => blocker.code)).toContain(
        'APPROVED_CHARGES_NOT_CAPTURED',
      );
      expect(summary.nextActions.map((action) => action.action)).toContain(
        'Capture approved charges or waive them',
      );
    });

    it('asks for a first review while a claim case is open', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeClaimBooking({
          claimCase: makeClaimCase({ status: ClaimCaseStatus.OPEN }),
        }),
      );

      const summary = await service.getClaimSummaryForBooking(
        BOOKING_ID,
        RENTER_ID,
        [UserRole.RENTER],
      );

      expect(summary.nextActions.map((action) => action.action)).toContain(
        'Submit first claim review decision',
      );
    });

    it('asks for a second review while a claim case is pending second review', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeClaimBooking({
          claimCase: makeClaimCase({
            status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
          }),
        }),
      );

      const summary = await service.getClaimSummaryForBooking(
        BOOKING_ID,
        RENTER_ID,
        [UserRole.RENTER],
      );

      expect(summary.nextActions.map((action) => action.action)).toContain(
        'Complete second-admin claim review',
      );
    });

    it('reports a NO_CLAIM summary for a booking without any claim activity', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeClaimBooking({
          incidentReports: [],
          postTripCharges: [],
          depositLedger: null,
          ownerPayout: null,
          claimCase: null,
        }),
      );

      const summary = await service.getClaimSummaryForBooking(
        BOOKING_ID,
        RENTER_ID,
        [UserRole.RENTER],
      );

      expect(summary.status).toBe('NO_CLAIM');
      expect(summary.statusLabel).toBe('No claim activity');
      expect(summary.nextActions).toEqual([]);
    });

    it('reports an OPEN summary and prompts opening a claim case', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeClaimBooking({
          incidentReports: [makeIncident({ status: IncidentStatus.OPEN })],
          postTripCharges: [],
          depositLedger: null,
          ownerPayout: null,
          claimCase: null,
        }),
      );

      const summary = await service.getClaimSummaryForBooking(
        BOOKING_ID,
        RENTER_ID,
        [UserRole.RENTER],
      );

      expect(summary.status).toBe('OPEN');
      expect(summary.statusLabel).toBe('Claim opened');
      expect(summary.nextActions.map((action) => action.action)).toEqual(
        expect.arrayContaining([
          'Open durable claim case',
          'Move incident reports under review',
        ]),
      );
    });

    it('reports an AWAITING_CHARGE_REVIEW summary when only charges need review', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeClaimBooking({
          incidentReports: [],
          postTripCharges: [
            {
              id: CHARGE_ID,
              bookingId: BOOKING_ID,
              tripId: TRIP_ID,
              type: PostTripChargeType.DAMAGE,
              status: PostTripChargeStatus.PENDING_REVIEW,
              amount: 120_000,
              createdAt: new Date('2026-05-23T03:30:00.000Z'),
              updatedAt: new Date('2026-05-23T03:30:00.000Z'),
            },
          ],
          depositLedger: null,
          ownerPayout: null,
          claimCase: makeClaimCase({ status: ClaimCaseStatus.UNDER_REVIEW }),
        }),
      );

      const summary = await service.getClaimSummaryForBooking(
        BOOKING_ID,
        RENTER_ID,
        [UserRole.RENTER],
      );

      expect(summary.status).toBe('AWAITING_CHARGE_REVIEW');
      expect(summary.statusLabel).toBe('Awaiting post-trip charge review');
    });

    it('suggests preparing an owner payout once a claim resolves with none on file', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeClaimBooking({
          incidentReports: [
            makeIncident({ status: IncidentStatus.RESOLVED }),
          ],
          postTripCharges: [],
          depositLedger: null,
          ownerPayout: null,
          claimCase: makeClaimCase({ status: ClaimCaseStatus.RESOLVED }),
        }),
      );

      const summary = await service.getClaimSummaryForBooking(
        BOOKING_ID,
        RENTER_ID,
        [UserRole.RENTER],
      );

      expect(summary.status).toBe('RESOLVED');
      expect(summary.nextActions.map((action) => action.action)).toContain(
        'Create or refresh owner payout',
      );
    });
  });

  describe('notification failure handling', () => {
    it('logs and swallows participant notification errors during review', async () => {
      const notificationService = {
        createNotification: jest
          .fn()
          .mockRejectedValue(new Error('notification down')),
      };
      const loggingService = new IncidentsService(
        prisma as unknown as PrismaService,
        notificationService as any,
      );
      prisma.claimCase.findUnique.mockResolvedValue(makeClaimCase());
      prisma.claimCase.update.mockResolvedValue(
        makeClaimCase({
          status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
          firstDecision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
          firstReviewedBy: ADMIN_ID,
          booking: { id: BOOKING_ID, renterId: RENTER_ID, ownerId: OWNER_ID },
        }),
      );

      const result = await loggingService.reviewClaimCase(
        'claim-case-uuid',
        ADMIN_ID,
        { decision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED },
      );

      expect(result.status).toBe(ClaimCaseStatus.PENDING_SECOND_REVIEW);
      expect(notificationService.createNotification).toHaveBeenCalled();
    });

    it('logs and swallows SLA escalation notification errors', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-25T00:15:00.000Z'));
      const notificationService = {
        createNotification: jest
          .fn()
          .mockRejectedValue(new Error('escalation down')),
      };
      const loggingService = new IncidentsService(
        prisma as unknown as PrismaService,
        notificationService as any,
      );
      prisma.claimCase.findMany.mockResolvedValue([
        makeClaimCase({
          id: 'overdue-error-case',
          caseNumber: 'CLM-ERR',
          assignedAdminId: ADMIN_ID,
          status: ClaimCaseStatus.OPEN,
          createdAt: new Date('2026-05-23T00:00:00.000Z'),
          updatedAt: new Date('2026-05-23T00:00:00.000Z'),
        }),
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: ADMIN_ID }]);
      prisma.notification.findFirst.mockResolvedValue(null);

      try {
        await expect(
          loggingService.sendClaimCaseSlaEscalationAlerts(),
        ).resolves.toBeUndefined();
      } finally {
        jest.useRealTimers();
      }

      expect(notificationService.createNotification).toHaveBeenCalled();
    });

    it('skips SLA escalation entirely when no notification service is configured', async () => {
      const bareService = new IncidentsService(
        prisma as unknown as PrismaService,
      );

      await expect(
        bareService.sendClaimCaseSlaEscalationAlerts(),
      ).resolves.toBeUndefined();
      expect(prisma.claimCase.findMany).not.toHaveBeenCalled();
    });

    it('creates SLA escalation notifications without realtime push when admins are offline', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-25T00:15:00.000Z'));
      const notificationService = {
        createNotification: jest
          .fn()
          .mockResolvedValue({ id: 'notification-1' }),
      };
      const notificationGateway = {
        isUserOnline: jest.fn().mockReturnValue(false),
        sendToUser: jest.fn(),
        broadcastToAdmins: jest.fn(),
      };
      const offlineService = new IncidentsService(
        prisma as unknown as PrismaService,
        notificationService as any,
        notificationGateway as any,
      );
      prisma.claimCase.findMany.mockResolvedValue([
        makeClaimCase({
          id: 'overdue-offline-case',
          caseNumber: 'CLM-OFFLINE',
          assignedAdminId: ADMIN_ID,
          status: ClaimCaseStatus.OPEN,
          createdAt: new Date('2026-05-23T00:00:00.000Z'),
          updatedAt: new Date('2026-05-23T00:00:00.000Z'),
        }),
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: ADMIN_ID }]);
      prisma.notification.findFirst.mockResolvedValue(null);

      try {
        await offlineService.sendClaimCaseSlaEscalationAlerts();
      } finally {
        jest.useRealTimers();
      }

      expect(notificationService.createNotification).toHaveBeenCalled();
      expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
      // Overdue case still triggers the admin broadcast even when offline.
      expect(notificationGateway.broadcastToAdmins).toHaveBeenCalledTimes(1);
    });

    it('skips on-track claim cases when sending SLA escalations', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-24T01:30:00.000Z'));
      const notificationService = { createNotification: jest.fn() };
      const onTrackService = new IncidentsService(
        prisma as unknown as PrismaService,
        notificationService as any,
      );
      prisma.claimCase.findMany.mockResolvedValue([
        makeClaimCase({
          id: 'on-track-case',
          status: ClaimCaseStatus.OPEN,
          createdAt: new Date('2026-05-24T01:00:00.000Z'),
          updatedAt: new Date('2026-05-24T01:00:00.000Z'),
        }),
      ]);

      try {
        await onTrackService.sendClaimCaseSlaEscalationAlerts();
      } finally {
        jest.useRealTimers();
      }

      expect(notificationService.createNotification).not.toHaveBeenCalled();
    });
  });
});
