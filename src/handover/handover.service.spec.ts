import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BookingStatus, HandoverType, TripStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { HandoverService } from './handover.service';

const RENTER_ID = 'renter-uuid';
const OWNER_ID = 'owner-uuid';
const THIRD_PARTY_ID = 'third-party-uuid';
const BOOKING_ID = 'booking-uuid';
const TRIP_ID = 'trip-uuid';
const HANDOVER_ID = 'handover-uuid';

const photo = {
  photoUrl: 'https://cdn.example.com/handovers/front.jpg',
  photoType: 'front',
  latitude: 10.7769,
  longitude: 106.7009,
  capturedAt: '2026-05-22T09:00:00.000Z',
};

const createDto = {
  bookingId: BOOKING_ID,
  odometerReading: 1200,
  batteryLevel: 90,
  latitude: 10.7769,
  longitude: 106.7009,
  notes: 'Clean condition',
  photos: [photo],
};

const makeHandover = (overrides: Record<string, unknown> = {}) => ({
  id: HANDOVER_ID,
  bookingId: BOOKING_ID,
  tripId: null,
  type: HandoverType.CHECK_IN,
  performedBy: RENTER_ID,
  odometerReading: 1200,
  batteryLevel: 90,
  fuelLevel: null,
  latitude: 10.7769,
  longitude: 106.7009,
  notes: 'Clean condition',
  confirmedByOwner: false,
  confirmedByRenter: true,
  createdAt: new Date('2026-05-22T09:00:00.000Z'),
  updatedAt: new Date('2026-05-22T09:00:00.000Z'),
  photos: [
    {
      id: 'photo-uuid',
      handoverId: HANDOVER_ID,
      photoUrl: photo.photoUrl,
      photoType: photo.photoType,
      latitude: photo.latitude,
      longitude: photo.longitude,
      capturedAt: new Date(photo.capturedAt),
      createdAt: new Date('2026-05-22T09:00:00.000Z'),
    },
  ],
  ...overrides,
});

const makeBooking = (overrides: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  renterId: RENTER_ID,
  ownerId: OWNER_ID,
  vehicleId: 'vehicle-uuid',
  status: BookingStatus.CONFIRMED,
  trip: null,
  handovers: [],
  ...overrides,
});

const mockPrisma = () => ({
  booking: {
    findUnique: jest.fn(),
  },
  vehicleHandover: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
});

describe('HandoverService', () => {
  let service: HandoverService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new HandoverService(prisma as unknown as PrismaService);
  });

  it('creates a renter check-in handover with photos and renter sign-off', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());
    prisma.vehicleHandover.create.mockResolvedValue(makeHandover());

    const result = await service.createCheckIn(RENTER_ID, createDto);

    expect(prisma.vehicleHandover.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingId: BOOKING_ID,
          type: HandoverType.CHECK_IN,
          performedBy: RENTER_ID,
          confirmedByOwner: false,
          confirmedByRenter: true,
          photos: {
            create: [
              expect.objectContaining({
                photoUrl: photo.photoUrl,
                photoType: photo.photoType,
              }),
            ],
          },
        }),
      }),
    );
    expect(result.id).toBe(HANDOVER_ID);
    expect(result.isComplete).toBe(false);
  });

  it('rejects check-in from a user outside the booking', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      service.createCheckIn(THIRD_PARTY_ID, createDto),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.vehicleHandover.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate check-in handover records', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ handovers: [makeHandover()] }),
    );

    await expect(service.createCheckIn(RENTER_ID, createDto)).rejects.toThrow(
      'Check-in handover already exists',
    );
  });

  it('creates check-out only after an ongoing trip has completed check-in', async () => {
    const checkIn = makeHandover({
      confirmedByOwner: true,
      confirmedByRenter: true,
    });
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({
        status: BookingStatus.ONGOING,
        trip: { id: TRIP_ID, status: TripStatus.ONGOING },
        handovers: [checkIn],
      }),
    );
    prisma.vehicleHandover.create.mockResolvedValue(
      makeHandover({
        id: 'checkout-uuid',
        tripId: TRIP_ID,
        type: HandoverType.CHECK_OUT,
        odometerReading: 1260,
        batteryLevel: 52,
      }),
    );

    const result = await service.createCheckOut(OWNER_ID, {
      ...createDto,
      odometerReading: 1260,
      batteryLevel: 52,
    });

    expect(prisma.vehicleHandover.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingId: BOOKING_ID,
          tripId: TRIP_ID,
          type: HandoverType.CHECK_OUT,
          performedBy: OWNER_ID,
          confirmedByOwner: true,
          confirmedByRenter: false,
        }),
      }),
    );
    expect(result.type).toBe(HandoverType.CHECK_OUT);
  });

  it('rejects check-out before completed check-in sign-off', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({
        status: BookingStatus.ONGOING,
        trip: { id: TRIP_ID, status: TripStatus.ONGOING },
        handovers: [makeHandover({ confirmedByOwner: false })],
      }),
    );

    await expect(service.createCheckOut(RENTER_ID, createDto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.vehicleHandover.create).not.toHaveBeenCalled();
  });

  it('returns handover summary with calculated differences', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({
        handovers: [
          makeHandover({
            type: HandoverType.CHECK_IN,
            odometerReading: 1200,
            batteryLevel: 90,
          }),
          makeHandover({
            id: 'checkout-uuid',
            type: HandoverType.CHECK_OUT,
            odometerReading: 1260,
            batteryLevel: 52,
          }),
        ],
      }),
    );

    const result = await service.getByBooking(BOOKING_ID, OWNER_ID);

    expect(result.differences).toEqual({
      kmDriven: 60,
      batteryDelta: -38,
    });
  });

  it('confirms handover for booking participants', async () => {
    prisma.vehicleHandover.findUnique.mockResolvedValue({
      ...makeHandover(),
      booking: { renterId: RENTER_ID, ownerId: OWNER_ID },
    });
    prisma.vehicleHandover.update.mockResolvedValue(
      makeHandover({
        confirmedByOwner: true,
        confirmedByRenter: true,
      }),
    );

    const result = await service.confirm(HANDOVER_ID, OWNER_ID);

    expect(prisma.vehicleHandover.update).toHaveBeenCalledWith({
      where: { id: HANDOVER_ID },
      data: { confirmedByOwner: true },
      include: expect.any(Object),
    });
    expect(result.isComplete).toBe(true);
  });
});
