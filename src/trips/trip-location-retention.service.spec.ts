import { TripStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TripLocationRetentionService } from './trip-location-retention.service';

const mockPrisma = () => ({
  trip: {
    updateMany: jest.fn(),
  },
});

describe('TripLocationRetentionService', () => {
  let service: TripLocationRetentionService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-29T03:00:00.000Z'));
    prisma = mockPrisma();
    service = new TripLocationRetentionService(
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('anonymizes GPS and address fields for completed trips older than 90 days', async () => {
    prisma.trip.updateMany.mockResolvedValue({ count: 3 });

    const count = await service.anonymizeExpiredTripLocations();

    expect(count).toBe(3);
    expect(prisma.trip.updateMany).toHaveBeenCalledWith({
      where: {
        status: TripStatus.COMPLETED,
        completedAt: { lt: new Date('2026-01-29T03:00:00.000Z') },
        OR: [
          { startLatitude: { not: null } },
          { startLongitude: { not: null } },
          { startAddress: { not: null } },
          { endLatitude: { not: null } },
          { endLongitude: { not: null } },
          { endAddress: { not: null } },
        ],
      },
      data: {
        startLatitude: null,
        startLongitude: null,
        startAddress: null,
        endLatitude: null,
        endLongitude: null,
        endAddress: null,
      },
    });
  });

  it('returns zero when no expired trip locations are updated', async () => {
    prisma.trip.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.anonymizeExpiredTripLocations()).resolves.toBe(0);
  });
});
