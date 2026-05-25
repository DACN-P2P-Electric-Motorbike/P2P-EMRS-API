import {
  ClaimCaseOutcome,
  ClaimCaseStatus,
  EvidenceAnnotationTargetType,
  IncidentCategory,
  IncidentStatus,
  UserRole,
} from '@prisma/client';
import { IncidentsController } from './incidents.controller';
import { ClaimCaseSlaStage, ClaimCaseSlaStatus } from './entities';
import { IncidentsService } from './incidents.service';
import { ClaimCaseAssignmentAction } from './dto';

describe('IncidentsController', () => {
  let controller: IncidentsController;
  let service: jest.Mocked<IncidentsService>;
  const incident = { id: 'incident-uuid' } as any;

  beforeEach(() => {
    service = {
      createReport: jest.fn().mockResolvedValue(incident),
      listForBooking: jest.fn().mockResolvedValue([incident]),
      getClaimSummaryForBooking: jest.fn().mockResolvedValue({
        bookingId: 'booking-uuid',
        status: 'UNDER_REVIEW',
      }),
      listEvidenceAnnotationsForBooking: jest.fn().mockResolvedValue([
        {
          id: 'annotation-uuid',
          targetType: EvidenceAnnotationTargetType.INCIDENT_REPORT,
        },
      ]),
      createEvidenceAnnotation: jest.fn().mockResolvedValue({
        id: 'annotation-uuid',
        targetType: EvidenceAnnotationTargetType.INCIDENT_REPORT,
      }),
      createOrRefreshClaimCase: jest.fn().mockResolvedValue({
        id: 'claim-case-uuid',
        status: ClaimCaseStatus.OPEN,
      }),
      getAdminClaimCases: jest.fn().mockResolvedValue([
        {
          id: 'claim-case-uuid',
          status: ClaimCaseStatus.OPEN,
        },
      ]),
      getAdminClaimCaseQueueSummary: jest.fn().mockResolvedValue({
        total: 3,
        active: 2,
        assignedToMe: 1,
        unassigned: 1,
      }),
      reviewClaimCase: jest.fn().mockResolvedValue({
        id: 'claim-case-uuid',
        status: ClaimCaseStatus.PENDING_SECOND_REVIEW,
      }),
      updateClaimCaseAssignment: jest.fn().mockResolvedValue({
        id: 'claim-case-uuid',
        assignedAdminId: 'admin-uuid',
      }),
      getAdminQueue: jest.fn().mockResolvedValue([incident]),
      updateStatus: jest.fn().mockResolvedValue(incident),
    } as unknown as jest.Mocked<IncidentsService>;

    controller = new IncidentsController(service);
  });

  it('delegates participant and admin incident endpoints', async () => {
    const createDto = {
      bookingId: 'booking-uuid',
      category: IncidentCategory.MECHANICAL_ISSUE,
      description: 'Throttle issue during trip',
    };
    const statusDto = {
      status: IncidentStatus.UNDER_REVIEW,
      adminNotes: 'Checking handover photos',
    };
    const annotationDto = {
      targetType: EvidenceAnnotationTargetType.INCIDENT_REPORT,
      targetId: 'incident-uuid',
      note: 'Rear panel scratch visible in checkout photo',
      tags: ['damage'],
    };

    await expect(
      controller.createReport('user-uuid', [UserRole.RENTER], createDto),
    ).resolves.toBe(incident);
    await expect(
      controller.listForBooking('booking-uuid', 'user-uuid', [UserRole.RENTER]),
    ).resolves.toEqual([incident]);
    await expect(
      controller.getClaimSummaryForBooking('booking-uuid', 'user-uuid', [
        UserRole.RENTER,
      ]),
    ).resolves.toMatchObject({ bookingId: 'booking-uuid' });
    await expect(
      controller.listEvidenceAnnotationsForBooking('booking-uuid'),
    ).resolves.toMatchObject({
      status: 'success',
      data: [{ id: 'annotation-uuid' }],
    });
    await expect(
      controller.createEvidenceAnnotation(
        'booking-uuid',
        'admin-uuid',
        annotationDto,
      ),
    ).resolves.toMatchObject({ id: 'annotation-uuid' });
    await expect(
      controller.createOrRefreshClaimCase('booking-uuid', 'admin-uuid'),
    ).resolves.toMatchObject({ id: 'claim-case-uuid' });
    await expect(
      controller.getAdminClaimCases(
        'admin-uuid',
        ClaimCaseStatus.OPEN,
        ClaimCaseSlaStatus.OVERDUE,
        ClaimCaseSlaStage.SECOND_REVIEW,
        'MINE',
        '20',
      ),
    ).resolves.toMatchObject({
      status: 'success',
      data: [{ id: 'claim-case-uuid' }],
    });
    await expect(
      controller.getAdminClaimCaseQueueSummary('admin-uuid'),
    ).resolves.toMatchObject({
      status: 'success',
      data: { total: 3, assignedToMe: 1 },
    });
    await expect(controller.getAdminQueue('25')).resolves.toEqual({
      status: 'success',
      data: [incident],
    });
    await expect(
      controller.updateStatus('incident-uuid', 'admin-uuid', statusDto),
    ).resolves.toBe(incident);
    await expect(
      controller.reviewClaimCase('claim-case-uuid', 'admin-uuid', {
        decision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        notes: 'Evidence reviewed',
      }),
    ).resolves.toMatchObject({ id: 'claim-case-uuid' });
    await expect(
      controller.updateClaimCaseAssignment('claim-case-uuid', 'admin-uuid', {
        action: ClaimCaseAssignmentAction.ASSIGN_SELF,
      }),
    ).resolves.toMatchObject({ assignedAdminId: 'admin-uuid' });

    expect(service.createReport).toHaveBeenCalledWith(
      'user-uuid',
      [UserRole.RENTER],
      createDto,
    );
    expect(service.listForBooking).toHaveBeenCalledWith(
      'booking-uuid',
      'user-uuid',
      [UserRole.RENTER],
    );
    expect(service.getClaimSummaryForBooking).toHaveBeenCalledWith(
      'booking-uuid',
      'user-uuid',
      [UserRole.RENTER],
    );
    expect(service.listEvidenceAnnotationsForBooking).toHaveBeenCalledWith(
      'booking-uuid',
    );
    expect(service.createEvidenceAnnotation).toHaveBeenCalledWith(
      'booking-uuid',
      'admin-uuid',
      annotationDto,
    );
    expect(service.createOrRefreshClaimCase).toHaveBeenCalledWith(
      'booking-uuid',
      'admin-uuid',
    );
    expect(service.getAdminClaimCases).toHaveBeenCalledWith({
      status: ClaimCaseStatus.OPEN,
      slaStatus: ClaimCaseSlaStatus.OVERDUE,
      slaStage: ClaimCaseSlaStage.SECOND_REVIEW,
      assignment: 'MINE',
      adminId: 'admin-uuid',
      limit: 20,
    });
    expect(service.getAdminClaimCaseQueueSummary).toHaveBeenCalledWith(
      'admin-uuid',
    );
    expect(service.getAdminQueue).toHaveBeenCalledWith(25);
    expect(service.updateStatus).toHaveBeenCalledWith(
      'incident-uuid',
      'admin-uuid',
      statusDto,
    );
    expect(service.reviewClaimCase).toHaveBeenCalledWith(
      'claim-case-uuid',
      'admin-uuid',
      {
        decision: ClaimCaseOutcome.OWNER_CLAIM_APPROVED,
        notes: 'Evidence reviewed',
      },
    );
    expect(service.updateClaimCaseAssignment).toHaveBeenCalledWith(
      'claim-case-uuid',
      'admin-uuid',
      {
        action: ClaimCaseAssignmentAction.ASSIGN_SELF,
      },
    );
  });
});
