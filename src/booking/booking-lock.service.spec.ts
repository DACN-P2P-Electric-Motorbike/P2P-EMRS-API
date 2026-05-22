import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingStatus, VehicleStatus } from '@prisma/client';
import { BookingLockService } from './booking-lock.service';

const VEHICLE_ID = 'eeeeeeee-4444-4000-8000-eeeeeeeeeeee';
const RENTER_ID = 'cccccccc-2222-4000-8000-cccccccccccc';

const mockPrisma = () => ({
  vehicle: {
    findUnique: jest.fn(),
  },
  bookingLock: {
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  booking: {
    findFirst: jest.fn(),
  },
});

function futureDate(offsetHours: number): Date {
  const date = new Date();
  date.setHours(date.getHours() + offsetHours);
  return date;
}

describe('BookingLockService', () => {
  let service: BookingLockService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new BookingLockService(prisma as any);
    jest.clearAllMocks();
    prisma.vehicle.findUnique.mockResolvedValue({
      id: VEHICLE_ID,
      ownerId: 'owner-1',
      isAvailable: true,
      status: VehicleStatus.AVAILABLE,
    });
  });

  it('creates a 15-minute booking lock when the slot is free', async () => {
    const startTime = futureDate(2);
    const endTime = futureDate(4);
    const expiresAt = futureDate(2.25);

    prisma.bookingLock.findFirst.mockResolvedValue(null);
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.bookingLock.create.mockResolvedValue({
      id: 'lock-1',
      expiresAt,
    });

    const result = await service.createLock(
      VEHICLE_ID,
      RENTER_ID,
      startTime,
      endTime,
    );

    expect(result.id).toBe('lock-1');
    expect(prisma.bookingLock.create).toHaveBeenCalledWith({
      data: {
        vehicleId: VEHICLE_ID,
        userId: RENTER_ID,
        startTime,
        endTime,
        expiresAt: expect.any(Date),
      },
    });
  });

  it('rejects invalid lock windows before querying for conflicts', async () => {
    const startTime = futureDate(4);
    const endTime = futureDate(2);

    await expect(
      service.createLock(VEHICLE_ID, RENTER_ID, startTime, endTime),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.vehicle.findUnique).not.toHaveBeenCalled();
    expect(prisma.bookingLock.findFirst).not.toHaveBeenCalled();
  });

  it('rejects locks for missing vehicles', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(null);

    await expect(
      service.createLock(VEHICLE_ID, RENTER_ID, futureDate(2), futureDate(4)),
    ).rejects.toThrow('Vehicle not found');
    expect(prisma.bookingLock.findFirst).not.toHaveBeenCalled();
  });

  it('rejects locks for unavailable vehicles', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({
      id: VEHICLE_ID,
      ownerId: 'owner-1',
      isAvailable: false,
      status: VehicleStatus.UNAVAILABLE,
    });

    await expect(
      service.createLock(VEHICLE_ID, RENTER_ID, futureDate(2), futureDate(4)),
    ).rejects.toThrow('Vehicle is not available for booking');
    expect(prisma.bookingLock.findFirst).not.toHaveBeenCalled();
  });

  it('rejects locks when the owner tries to book their own vehicle', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({
      id: VEHICLE_ID,
      ownerId: RENTER_ID,
      isAvailable: true,
      status: VehicleStatus.AVAILABLE,
    });

    await expect(
      service.createLock(VEHICLE_ID, RENTER_ID, futureDate(2), futureDate(4)),
    ).rejects.toThrow('You cannot book your own vehicle');
    expect(prisma.bookingLock.findFirst).not.toHaveBeenCalled();
  });

  it('rejects slots already held by an active lock', async () => {
    prisma.bookingLock.findFirst.mockResolvedValue({ id: 'existing-lock' });

    await expect(
      service.createLock(VEHICLE_ID, RENTER_ID, futureDate(2), futureDate(4)),
    ).rejects.toThrow(ConflictException);
    expect(prisma.booking.findFirst).not.toHaveBeenCalled();
  });

  it('rejects slots already covered by an active booking', async () => {
    prisma.bookingLock.findFirst.mockResolvedValue(null);
    prisma.booking.findFirst.mockResolvedValue({ id: 'booking-1' });

    await expect(
      service.createLock(VEHICLE_ID, RENTER_ID, futureDate(2), futureDate(4)),
    ).rejects.toThrow('Vehicle is already booked');
    expect(prisma.booking.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        vehicleId: VEHICLE_ID,
        status: {
          in: [
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
            BookingStatus.ONGOING,
          ],
        },
      }),
    });
  });

  it('silently ignores release attempts for locks not owned by the user', async () => {
    prisma.bookingLock.findFirst.mockResolvedValue(null);

    await service.releaseLock('lock-1', RENTER_ID);

    expect(prisma.bookingLock.delete).not.toHaveBeenCalled();
  });

  it('releases only locks that strictly overlap the completed booking window', async () => {
    prisma.bookingLock.deleteMany.mockResolvedValue({ count: 1 });
    const startTime = futureDate(2);
    const endTime = futureDate(4);

    await service.releaseLocksByVehicleAndTime(VEHICLE_ID, startTime, endTime);

    expect(prisma.bookingLock.deleteMany).toHaveBeenCalledWith({
      where: {
        vehicleId: VEHICLE_ID,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
  });

  it('checks conflicting locks while excluding the current user when provided', async () => {
    prisma.bookingLock.findFirst.mockResolvedValue({ id: 'other-lock' });

    const result = await service.hasConflictingLock(
      VEHICLE_ID,
      futureDate(2),
      futureDate(4),
      RENTER_ID,
    );

    expect(result).toBe(true);
    expect(prisma.bookingLock.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        vehicleId: VEHICLE_ID,
        userId: { not: RENTER_ID },
      }),
    });
  });

  it('cleans expired locks on the scheduled job', async () => {
    prisma.bookingLock.deleteMany.mockResolvedValue({ count: 2 });

    await service.cleanupExpiredLocks();

    expect(prisma.bookingLock.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });
});
