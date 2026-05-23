import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  BookingStatus,
  DepositLedgerStatus,
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  TripStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
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

const mockPrisma = () => ({
  booking: {
    findUnique: jest.fn(),
  },
  incidentReport: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  depositLedger: {
    updateMany: jest.fn(),
  },
});

describe('IncidentsService', () => {
  let service: IncidentsService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new IncidentsService(prisma as unknown as PrismaService);
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
              }),
            ],
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
});
