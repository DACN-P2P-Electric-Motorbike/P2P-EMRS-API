import { NotFoundException } from '@nestjs/common';
import { PrivacyRequestStatus, PrivacyRequestType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PrivacyService } from './privacy.service';

const USER_ID = 'user-1';

const mockPrisma = () => ({
  user: {
    findUnique: jest.fn(),
  },
  privacyRequest: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
});

describe('PrivacyService', () => {
  let service: PrivacyService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new PrivacyService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exports user data without exact trip coordinates or addresses', async () => {
    const user = {
      id: USER_ID,
      email: 'renter@example.com',
      trips: [{ id: 'trip-1', distanceTraveled: 12 }],
    };
    prisma.user.findUnique.mockResolvedValue(user);

    const result = await service.exportPersonalData(USER_ID);
    const call = prisma.user.findUnique.mock.calls[0][0];
    const tripSelect = call.select.trips.select;

    expect(result.user).toBe(user);
    expect(result.generatedAt).toEqual(expect.any(String));
    expect(call.where).toEqual({ id: USER_ID });
    expect(tripSelect).toMatchObject({
      id: true,
      bookingId: true,
      vehicleId: true,
      status: true,
      distanceTraveled: true,
      duration: true,
    });
    expect(tripSelect).not.toHaveProperty('startLatitude');
    expect(tripSelect).not.toHaveProperty('startLongitude');
    expect(tripSelect).not.toHaveProperty('startAddress');
    expect(tripSelect).not.toHaveProperty('endLatitude');
    expect(tripSelect).not.toHaveProperty('endLongitude');
    expect(tripSelect).not.toHaveProperty('endAddress');
  });

  it('throws NotFoundException when exporting for a missing user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.exportPersonalData(USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates account deletion requests with a 72-hour SLA', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-29T00:00:00.000Z'));
    const created = { id: 'request-1', userId: USER_ID };
    prisma.privacyRequest.create.mockResolvedValue(created);

    const result = await service.requestAccountDeletion(USER_ID);

    expect(result).toBe(created);
    expect(prisma.privacyRequest.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        type: PrivacyRequestType.DELETE_ACCOUNT,
        status: PrivacyRequestStatus.PENDING,
        dueAt: new Date('2026-05-02T00:00:00.000Z'),
      },
    });
  });

  it('lists the current user privacy requests newest first', async () => {
    const requests = [{ id: 'request-2' }, { id: 'request-1' }];
    prisma.privacyRequest.findMany.mockResolvedValue(requests);

    const result = await service.getMyRequests(USER_ID);

    expect(result).toBe(requests);
    expect(prisma.privacyRequest.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: { createdAt: 'desc' },
    });
  });
});
