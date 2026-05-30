import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingStatus,
  HandoverType,
  PaymentMethod,
  PaymentStatus,
  TripStatus,
  TrustScoreEventType,
  VehicleStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { TripsService } from './trips.service';
import { TrustScoreService } from '../trust-score/trust-score.service';
import { IncidentsService } from '../incidents/incidents.service';

const RENTER_ID = 'renter-uuid';
const OWNER_ID = 'owner-uuid';
const BOOKING_ID = 'booking-uuid';
const VEHICLE_ID = 'vehicle-uuid';
const TRIP_ID = 'trip-uuid';

const makePayment = (overrides: Record<string, unknown> = {}) => ({
  id: 'payment-uuid',
  bookingId: BOOKING_ID,
  payerId: RENTER_ID,
  receiverId: OWNER_ID,
  amount: 120_000,
  platformFee: 15_000,
  ownerAmount: 85_000,
  method: PaymentMethod.CASH,
  status: PaymentStatus.COMPLETED,
  transactionId: null,
  gatewayResponse: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  paidAt: new Date(),
  ...overrides,
});

const makeBooking = (overrides: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  renterId: RENTER_ID,
  ownerId: OWNER_ID,
  vehicleId: VEHICLE_ID,
  status: BookingStatus.CONFIRMED,
  startTime: new Date(Date.now() - 60_000),
  endTime: new Date(Date.now() + 60 * 60_000),
  totalPrice: 100_000,
  deposit: 20_000,
  trip: null,
  payment: makePayment(),
  vehicle: { batteryLevel: 100 },
  handovers: [
    {
      id: 'handover-uuid',
      confirmedByOwner: true,
      confirmedByRenter: true,
      type: HandoverType.CHECK_IN,
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeTrip = (overrides: Record<string, unknown> = {}) => ({
  id: TRIP_ID,
  bookingId: BOOKING_ID,
  renterId: RENTER_ID,
  vehicleId: VEHICLE_ID,
  status: TripStatus.ONGOING,
  startLatitude: 10.7769,
  startLongitude: 106.7009,
  startAddress: '10.77690, 106.70090',
  endLatitude: null,
  endLongitude: null,
  endAddress: null,
  distanceTraveled: null,
  duration: null,
  startBattery: null,
  endBattery: null,
  hasIssues: false,
  issueDescription: null,
  startedAt: new Date(),
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const mockPrisma = () => {
  const tx = {
    trip: { create: jest.fn(), update: jest.fn() },
    booking: { update: jest.fn() },
    vehicle: { update: jest.fn() },
  };

  return {
    booking: { findUnique: jest.fn(), count: jest.fn() },
    trip: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
    tx,
  };
};

describe('TripsService', () => {
  let service: TripsService;
  let prisma: ReturnType<typeof mockPrisma>;
  let eventEmitter: { emit: jest.Mock };
  const trustScoreService = {
    recordPositiveEvent: jest.fn(),
    recordViolation: jest.fn(),
    recordTransactionMilestone: jest.fn(),
  };
  const incidentsService = {
    createFromTripIssue: jest.fn(),
  };

  beforeEach(async () => {
    prisma = mockPrisma();
    eventEmitter = { emit: jest.fn() };
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: TrustScoreService, useValue: trustScoreService },
        { provide: IncidentsService, useValue: incidentsService },
      ],
    }).compile();

    service = module.get(TripsService);
  });

  describe('startTrip', () => {
    const dto = {
      bookingId: BOOKING_ID,
      startLatitude: 10.7769,
      startLongitude: 106.7009,
      startAddress: '10.77690, 106.70090',
    };

    it('rejects when booking does not exist', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(service.startTrip(RENTER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects when the caller is not the booking renter', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());

      await expect(
        service.startTrip('not-the-renter', dto),
      ).rejects.toThrow('You can only start your own trips');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects starting a booking that is not confirmed', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ status: BookingStatus.PENDING }),
      );

      await expect(service.startTrip(RENTER_ID, dto)).rejects.toThrow(
        'Can only start trip for confirmed bookings',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when a trip has already been started', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ trip: { id: TRIP_ID } }),
      );

      await expect(service.startTrip(RENTER_ID, dto)).rejects.toThrow(
        'Trip has already been started',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an unpaid confirmed booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ payment: null }),
      );

      await expect(service.startTrip(RENTER_ID, dto)).rejects.toThrow(
        'Payment must be completed before starting the trip',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a booking with pending payment', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          payment: makePayment({ status: PaymentStatus.PENDING }),
        }),
      );

      await expect(service.startTrip(RENTER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects starting without start GPS coordinates', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());

      await expect(
        service.startTrip(RENTER_ID, {
          bookingId: BOOKING_ID,
        } as any),
      ).rejects.toThrow('Start location is required to start trip');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects starting before completed check-in handover sign-off', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          handovers: [
            {
              id: 'handover-uuid',
              confirmedByOwner: true,
              confirmedByRenter: false,
              type: HandoverType.CHECK_IN,
            },
          ],
        }),
      );

      await expect(service.startTrip(RENTER_ID, dto)).rejects.toThrow(
        'Completed check-in handover is required before starting the trip',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows starting up to 15 minutes before pickup time', async () => {
      const booking = makeBooking({
        startTime: new Date(Date.now() + 10 * 60_000),
      });
      const trip = makeTrip();
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.tx.trip.create.mockResolvedValue(trip);
      prisma.tx.booking.update.mockResolvedValue({
        ...booking,
        status: BookingStatus.ONGOING,
      });
      prisma.tx.vehicle.update.mockResolvedValue({ id: VEHICLE_ID });

      await expect(service.startTrip(RENTER_ID, dto)).resolves.toBeDefined();
      expect(prisma.tx.vehicle.update).toHaveBeenCalledWith({
        where: { id: VEHICLE_ID },
        data: { status: 'RENTED' },
      });
    });

    it('rejects starting too early before pickup time', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ startTime: new Date(Date.now() + 20 * 60_000) }),
      );

      await expect(service.startTrip(RENTER_ID, dto)).rejects.toThrow(
        'Cannot start trip more than 15 minutes before booking start time',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects starting more than 2 hours after pickup time', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ startTime: new Date(Date.now() - 3 * 60 * 60_000) }),
      );

      await expect(service.startTrip(RENTER_ID, dto)).rejects.toThrow(
        'Cannot start trip more than 2 hours after booking start time',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('starts a paid confirmed booking', async () => {
      const booking = makeBooking();
      const trip = makeTrip();
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.tx.trip.create.mockResolvedValue(trip);
      prisma.tx.booking.update.mockResolvedValue({
        ...booking,
        status: BookingStatus.ONGOING,
      });
      prisma.tx.vehicle.update.mockResolvedValue({ id: VEHICLE_ID });

      const result = await service.startTrip(RENTER_ID, dto);

      expect(prisma.booking.findUnique).toHaveBeenCalledWith({
        where: { id: BOOKING_ID },
        include: {
          trip: true,
          payment: true,
          vehicle: { select: { batteryLevel: true } },
          handovers: {
            where: { type: HandoverType.CHECK_IN },
            select: {
              id: true,
              confirmedByOwner: true,
              confirmedByRenter: true,
            },
          },
        },
      });
      expect(prisma.tx.trip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingId: BOOKING_ID,
            renterId: RENTER_ID,
            vehicleId: VEHICLE_ID,
            status: TripStatus.ONGOING,
            startBattery: 100,
          }),
        }),
      );
      expect(prisma.tx.booking.update).toHaveBeenCalledWith({
        where: { id: BOOKING_ID },
        data: { status: BookingStatus.ONGOING },
      });
      expect(prisma.tx.vehicle.update).toHaveBeenCalledWith({
        where: { id: VEHICLE_ID },
        data: { status: 'RENTED' },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'trip.started',
        expect.objectContaining({
          tripId: TRIP_ID,
          bookingId: BOOKING_ID,
          renterId: RENTER_ID,
          ownerId: OWNER_ID,
          vehicleId: VEHICLE_ID,
        }),
      );
      expect(result.id).toBe(TRIP_ID);
      expect(result.startLatitude).toBe(10.7769);
    });
  });

  describe('endTrip', () => {
    const endDto = {
      endLatitude: 10.78,
      endLongitude: 106.71,
      endAddress: '10.78000, 106.71000',
      endBattery: 60,
      hasIssues: false,
    };

    const ongoingTrip = (overrides: Record<string, unknown> = {}) =>
      makeTrip({
        startedAt: new Date(Date.now() - 30 * 60_000),
        booking: makeBooking({
          status: BookingStatus.ONGOING,
          // Returned on time by default (booking ends in the future).
          endTime: new Date(Date.now() + 60 * 60_000),
        }),
        ...overrides,
      });

    beforeEach(() => {
      trustScoreService.recordPositiveEvent.mockResolvedValue(undefined);
      trustScoreService.recordViolation.mockResolvedValue(undefined);
      trustScoreService.recordTransactionMilestone.mockResolvedValue(undefined);
      incidentsService.createFromTripIssue.mockResolvedValue({
        id: 'incident-uuid',
      });
      prisma.trip.count.mockResolvedValue(1);
      prisma.booking.count.mockResolvedValue(1);
    });

    it('rejects when the trip does not exist', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);

      await expect(service.endTrip(TRIP_ID, RENTER_ID, endDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects when a different user tries to end the trip', async () => {
      prisma.trip.findUnique.mockResolvedValue(ongoingTrip());

      await expect(
        service.endTrip(TRIP_ID, 'someone-else', endDto),
      ).rejects.toThrow('You can only end your own trips');
    });

    it('rejects ending a trip that is not ongoing', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        ongoingTrip({ status: TripStatus.COMPLETED }),
      );

      await expect(service.endTrip(TRIP_ID, RENTER_ID, endDto)).rejects.toThrow(
        'Can only end ongoing trips',
      );
    });

    it('rejects when trip start data is missing', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        ongoingTrip({ startLatitude: null }),
      );

      await expect(service.endTrip(TRIP_ID, RENTER_ID, endDto)).rejects.toThrow(
        'Trip start data is missing',
      );
    });

    it('rejects ending a trip less than 2 minutes after it starts', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        ongoingTrip({ startedAt: new Date(Date.now() - 30_000) }),
      );

      await expect(service.endTrip(TRIP_ID, RENTER_ID, endDto)).rejects.toThrow(
        'Trip cannot be ended less than 2 minutes after it starts',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('completes the trip, updates booking/vehicle and rewards on-time return', async () => {
      const trip = ongoingTrip();
      prisma.trip.findUnique.mockResolvedValue(trip);
      prisma.tx.trip.update.mockImplementation(({ data }: any) => ({
        ...trip,
        ...data,
      }));
      prisma.tx.booking.update.mockResolvedValue({});
      prisma.tx.vehicle.update.mockResolvedValue({});

      const result = await service.endTrip(TRIP_ID, RENTER_ID, endDto);

      expect(prisma.tx.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TRIP_ID },
          data: expect.objectContaining({
            status: TripStatus.COMPLETED,
            endBattery: 60,
          }),
        }),
      );
      expect(prisma.tx.booking.update).toHaveBeenCalledWith({
        where: { id: BOOKING_ID },
        data: { status: BookingStatus.COMPLETED },
      });
      expect(prisma.tx.vehicle.update).toHaveBeenCalledWith({
        where: { id: VEHICLE_ID },
        data: { status: VehicleStatus.AVAILABLE, totalTrips: { increment: 1 } },
      });
      expect(trustScoreService.recordPositiveEvent).toHaveBeenCalledWith(
        RENTER_ID,
        TrustScoreEventType.TRIP_COMPLETED_ON_TIME,
        2,
        expect.any(String),
        expect.any(Object),
      );
      expect(trustScoreService.recordViolation).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'trip.completed',
        expect.objectContaining({ tripId: TRIP_ID }),
      );
      expect(result.status).toBe(TripStatus.COMPLETED);
    });

    it('penalises a return more than 30 minutes late', async () => {
      const trip = ongoingTrip({
        startedAt: new Date(Date.now() - 3 * 60 * 60_000),
        booking: makeBooking({
          status: BookingStatus.ONGOING,
          endTime: new Date(Date.now() - 60 * 60_000), // ended an hour ago
        }),
      });
      prisma.trip.findUnique.mockResolvedValue(trip);
      prisma.tx.trip.update.mockImplementation(({ data }: any) => ({
        ...trip,
        ...data,
      }));

      await service.endTrip(TRIP_ID, RENTER_ID, endDto);

      expect(trustScoreService.recordViolation).toHaveBeenCalledWith(
        RENTER_ID,
        TrustScoreEventType.LATE_RETURN,
        3,
        expect.any(String),
        expect.any(Object),
      );
      expect(trustScoreService.recordPositiveEvent).not.toHaveBeenCalled();
    });

    it('creates an incident when the renter reports an issue on end', async () => {
      const trip = ongoingTrip();
      prisma.trip.findUnique.mockResolvedValue(trip);
      prisma.tx.trip.update.mockImplementation(({ data }: any) => ({
        ...trip,
        ...data,
      }));

      await service.endTrip(TRIP_ID, RENTER_ID, {
        ...endDto,
        hasIssues: true,
        issueDescription: 'Flat tyre on return',
      });

      expect(incidentsService.createFromTripIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: BOOKING_ID,
          reporterId: RENTER_ID,
          description: 'Flat tyre on return',
        }),
      );
    });

    it('does not create an incident when issue flag is set without a description', async () => {
      const trip = ongoingTrip();
      prisma.trip.findUnique.mockResolvedValue(trip);
      prisma.tx.trip.update.mockImplementation(({ data }: any) => ({
        ...trip,
        ...data,
      }));

      await service.endTrip(TRIP_ID, RENTER_ID, {
        ...endDto,
        hasIssues: true,
        issueDescription: '   ',
      });

      expect(incidentsService.createFromTripIssue).not.toHaveBeenCalled();
    });
  });

  describe('getTripById', () => {
    const tripWithBooking = (overrides: Record<string, unknown> = {}) =>
      makeTrip({
        booking: {
          ownerId: OWNER_ID,
          vehicle: { id: VEHICLE_ID },
          owner: { fullName: 'Owner', phone: '0900000000' },
        },
        ...overrides,
      });

    it('throws when the trip is missing', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);

      await expect(service.getTripById(TRIP_ID, RENTER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('hides the trip from users who are neither renter nor owner', async () => {
      prisma.trip.findUnique.mockResolvedValue(tripWithBooking());

      await expect(
        service.getTripById(TRIP_ID, 'stranger'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the trip for the renter and exposes exact location while ongoing', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        tripWithBooking({ status: TripStatus.ONGOING }),
      );

      const result = await service.getTripById(TRIP_ID, RENTER_ID);

      expect(result.id).toBe(TRIP_ID);
      expect(result.startLatitude).toBe(10.7769);
    });

    it('redacts exact location for completed trips', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        tripWithBooking({ status: TripStatus.COMPLETED }),
      );

      const result = await service.getTripById(TRIP_ID, OWNER_ID);

      expect(result.startLatitude).toBeNull();
      expect(result.startLongitude).toBeNull();
    });
  });

  describe('getActiveTrip', () => {
    it('returns null when there is no ongoing trip', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);

      await expect(service.getActiveTrip(RENTER_ID)).resolves.toBeNull();
    });

    it('returns the ongoing trip with exact location', async () => {
      prisma.trip.findFirst.mockResolvedValue(
        makeTrip({
          status: TripStatus.ONGOING,
          booking: { vehicle: { id: VEHICLE_ID } },
        }),
      );

      const result = await service.getActiveTrip(RENTER_ID);

      expect(result?.id).toBe(TRIP_ID);
      expect(result?.startLatitude).toBe(10.7769);
    });
  });

  describe('reportIssue', () => {
    const issueDto = {
      issueDescription: 'Brake feels loose',
      category: undefined,
      severity: undefined,
      evidenceUrls: undefined,
    } as any;

    it('throws when the trip does not exist', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);

      await expect(
        service.reportIssue(TRIP_ID, RENTER_ID, issueDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when a non-renter reports an issue', async () => {
      prisma.trip.findUnique.mockResolvedValue(makeTrip());

      await expect(
        service.reportIssue(TRIP_ID, 'stranger', issueDto),
      ).rejects.toThrow('You can only report issues for your own trips');
    });

    it('rejects reporting on a non-ongoing trip', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        makeTrip({ status: TripStatus.COMPLETED }),
      );

      await expect(
        service.reportIssue(TRIP_ID, RENTER_ID, issueDto),
      ).rejects.toThrow('Can only report issues for ongoing trips');
    });

    it('flags the trip, creates an incident and emits an admin alert', async () => {
      const trip = makeTrip({ status: TripStatus.ONGOING });
      prisma.trip.findUnique.mockResolvedValue(trip);
      prisma.trip.update.mockImplementation(({ data }: any) => ({
        ...trip,
        ...data,
      }));
      incidentsService.createFromTripIssue.mockResolvedValue({
        id: 'incident-uuid',
      });

      const result = await service.reportIssue(TRIP_ID, RENTER_ID, issueDto);

      expect(prisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TRIP_ID },
          data: expect.objectContaining({
            hasIssues: true,
            issueDescription: 'Brake feels loose',
          }),
        }),
      );
      expect(incidentsService.createFromTripIssue).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'trip.issue_reported',
        expect.objectContaining({ tripId: TRIP_ID }),
      );
      expect(result.hasIssues).toBe(true);
    });
  });

  describe('getTripHistory', () => {
    it('returns completed trips mapped to entities', async () => {
      prisma.trip.findMany.mockResolvedValue([
        makeTrip({
          status: TripStatus.COMPLETED,
          booking: {
            vehicle: {
              name: 'VinFast',
              brand: 'VinFast',
              model: 'Klara',
              images: [],
            },
          },
        }),
      ]);

      const result = await service.getTripHistory(RENTER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(TRIP_ID);
      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { renterId: RENTER_ID, status: TripStatus.COMPLETED },
          orderBy: { completedAt: 'desc' },
          take: 50,
        }),
      );
    });

    it('returns an empty list when there is no history', async () => {
      prisma.trip.findMany.mockResolvedValue([]);

      await expect(service.getTripHistory(RENTER_ID)).resolves.toEqual([]);
    });
  });
});
