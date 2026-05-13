import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  TripStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { TripsService } from './trips.service';
import { TrustScoreService } from '../trust-score/trust-score.service';

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
    trip: { create: jest.fn() },
    booking: { update: jest.fn() },
    vehicle: { update: jest.fn() },
  };

  return {
    booking: { findUnique: jest.fn() },
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

  beforeEach(async () => {
    prisma = mockPrisma();
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: TrustScoreService, useValue: trustScoreService },
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
});
