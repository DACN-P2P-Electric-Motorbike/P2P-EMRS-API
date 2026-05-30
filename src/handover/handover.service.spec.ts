import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BookingStatus, HandoverType, TripStatus, UserRole } from '@prisma/client';
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
    findMany: jest.fn(),
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
    expect(result).not.toHaveProperty('fuelLevel');
    expect(
      prisma.vehicleHandover.create.mock.calls[0][0].data,
    ).not.toHaveProperty('fuelLevel');
  });

  it('normalizes blank notes and missing photo timestamps on check-in', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());
    prisma.vehicleHandover.create.mockResolvedValue(makeHandover());

    await service.createCheckIn(RENTER_ID, {
      ...createDto,
      notes: '   ',
      photos: [{ ...photo, capturedAt: undefined }],
    });

    const data = prisma.vehicleHandover.create.mock.calls[0][0].data;
    expect(data.notes).toBeNull();
    expect(data.photos.create[0].capturedAt).toBeInstanceOf(Date);
  });

  it('rejects check-in from a user outside the booking', async () => {
    prisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      service.createCheckIn(THIRD_PARTY_ID, createDto),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.vehicleHandover.create).not.toHaveBeenCalled();
  });

  it('rejects check-in when the booking is not in CONFIRMED status', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: BookingStatus.PENDING }),
    );

    await expect(service.createCheckIn(RENTER_ID, createDto)).rejects.toThrow(
      'Check-in is only available for confirmed bookings before trip start',
    );
    expect(prisma.vehicleHandover.create).not.toHaveBeenCalled();
  });

  it('rejects check-in once the trip has already started', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ trip: { id: TRIP_ID, status: TripStatus.ONGOING } }),
    );

    await expect(service.createCheckIn(RENTER_ID, createDto)).rejects.toThrow(
      'Check-in must be completed before the trip starts',
    );
    expect(prisma.vehicleHandover.create).not.toHaveBeenCalled();
  });

  it('rejects check-out when the booking is not ongoing or has no trip', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: BookingStatus.CONFIRMED, trip: null }),
    );

    await expect(service.createCheckOut(RENTER_ID, createDto)).rejects.toThrow(
      'Check-out is only available for an ongoing trip',
    );
    expect(prisma.vehicleHandover.create).not.toHaveBeenCalled();
  });

  it('rejects check-out when the trip status is not ONGOING', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({
        status: BookingStatus.ONGOING,
        trip: { id: TRIP_ID, status: TripStatus.COMPLETED },
      }),
    );

    await expect(service.createCheckOut(RENTER_ID, createDto)).rejects.toThrow(
      'Check-out is only available for an ongoing trip',
    );
    expect(prisma.vehicleHandover.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate check-out handover records', async () => {
    const checkIn = makeHandover({
      confirmedByOwner: true,
      confirmedByRenter: true,
    });
    const checkOut = makeHandover({
      id: 'checkout-uuid',
      type: HandoverType.CHECK_OUT,
    });
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({
        status: BookingStatus.ONGOING,
        trip: { id: TRIP_ID, status: TripStatus.ONGOING },
        handovers: [checkIn, checkOut],
      }),
    );

    await expect(service.createCheckOut(OWNER_ID, createDto)).rejects.toThrow(
      'Check-out handover already exists',
    );
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
            fuelLevel: 80,
          }),
          makeHandover({
            id: 'checkout-uuid',
            type: HandoverType.CHECK_OUT,
            odometerReading: 1260,
            batteryLevel: 52,
            fuelLevel: 35,
          }),
        ],
      }),
    );

    const result = await service.getByBooking(BOOKING_ID, OWNER_ID);

    expect(result.differences).toEqual({
      kmDriven: 60,
      batteryDelta: -38,
    });
    expect(result.checkIn).not.toHaveProperty('fuelLevel');
    expect(result.checkOut).not.toHaveProperty('fuelLevel');
  });

  it('lists handover evidence for the admin review queue', async () => {
    const checkIn = makeHandover({
      type: HandoverType.CHECK_IN,
      confirmedByOwner: true,
      confirmedByRenter: true,
      odometerReading: 1200,
      batteryLevel: 90,
    });
    const checkOut = makeHandover({
      id: 'checkout-uuid',
      type: HandoverType.CHECK_OUT,
      confirmedByOwner: true,
      confirmedByRenter: false,
      odometerReading: 1260,
      batteryLevel: 50,
    });
    prisma.booking.findMany.mockResolvedValue([
      {
        ...makeBooking({
          status: BookingStatus.COMPLETED,
          handovers: [checkIn, checkOut],
        }),
        startTime: new Date('2026-05-22T08:00:00.000Z'),
        endTime: new Date('2026-05-22T10:00:00.000Z'),
        renter: {
          id: RENTER_ID,
          fullName: 'Renter One',
          email: 'renter@example.com',
          phone: '0909000001',
          trustScore: 100,
        },
        owner: {
          id: OWNER_ID,
          fullName: 'Owner One',
          email: 'owner@example.com',
          phone: '0909000002',
          trustScore: 110,
        },
        vehicle: {
          id: 'vehicle-uuid',
          brand: 'VINFAST',
          model: 'Klara S',
          licensePlate: '51A-12345',
          images: ['https://cdn.example.com/vehicle.jpg'],
        },
        trip: {
          id: TRIP_ID,
          status: TripStatus.COMPLETED,
          startedAt: new Date('2026-05-22T08:00:00.000Z'),
          completedAt: new Date('2026-05-22T10:00:00.000Z'),
        },
      },
    ]);

    const result = await service.getAdminReviewQueue(20);

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { handovers: { some: {} } },
        take: 20,
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].booking.vehicle.licensePlate).toBe('51A-12345');
    expect(result[0].handover.differences).toEqual({
      kmDriven: 60,
      batteryDelta: -40,
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

  it('confirms handover on behalf of the renter participant', async () => {
    prisma.vehicleHandover.findUnique.mockResolvedValue({
      ...makeHandover(),
      booking: { renterId: RENTER_ID, ownerId: OWNER_ID },
    });
    prisma.vehicleHandover.update.mockResolvedValue(
      makeHandover({ confirmedByRenter: true }),
    );

    await service.confirm(HANDOVER_ID, RENTER_ID);

    expect(prisma.vehicleHandover.update).toHaveBeenCalledWith({
      where: { id: HANDOVER_ID },
      data: { confirmedByRenter: true },
      include: expect.any(Object),
    });
  });

  it('throws when confirming a handover that does not exist', async () => {
    prisma.vehicleHandover.findUnique.mockResolvedValue(null);

    await expect(service.confirm(HANDOVER_ID, OWNER_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.vehicleHandover.update).not.toHaveBeenCalled();
  });

  it('hides the handover from users who are not booking participants', async () => {
    prisma.vehicleHandover.findUnique.mockResolvedValue({
      ...makeHandover(),
      booking: { renterId: RENTER_ID, ownerId: OWNER_ID },
    });

    await expect(
      service.confirm(HANDOVER_ID, THIRD_PARTY_ID),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.vehicleHandover.update).not.toHaveBeenCalled();
  });

  it('hides the booking from non-participants without admin role', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ handovers: [] }),
    );

    await expect(
      service.getByBooking(BOOKING_ID, THIRD_PARTY_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws when the booking does not exist for summary lookup', async () => {
    prisma.booking.findUnique.mockResolvedValue(null);

    await expect(
      service.getByBooking(BOOKING_ID, OWNER_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows admins to view handovers for any booking', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      makeBooking({ handovers: [] }),
    );

    const result = await service.getByBooking(BOOKING_ID, THIRD_PARTY_ID, [
      UserRole.ADMIN,
    ]);

    expect(result.checkIn).toBeNull();
    expect(result.checkOut).toBeNull();
    expect(result.differences).toEqual({});
  });

  it('clamps the admin review queue limit to a sane range', async () => {
    prisma.booking.findMany.mockResolvedValue([]);

    await service.getAdminReviewQueue(0);
    expect(prisma.booking.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 50 }),
    );

    await service.getAdminReviewQueue(500);
    expect(prisma.booking.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 100 }),
    );

    await service.getAdminReviewQueue();
    expect(prisma.booking.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });
});
