import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

describe('TripsController', () => {
  let controller: TripsController;
  let service: jest.Mocked<TripsService>;
  const trip = { id: 'trip-1' } as any;

  beforeEach(() => {
    service = {
      startTrip: jest.fn().mockResolvedValue(trip),
      endTrip: jest.fn().mockResolvedValue(trip),
      getActiveTrip: jest.fn().mockResolvedValue(trip),
      getTripHistory: jest.fn().mockResolvedValue([trip]),
      getTripById: jest.fn().mockResolvedValue(trip),
      reportIssue: jest.fn().mockResolvedValue(trip),
    } as unknown as jest.Mocked<TripsService>;
    controller = new TripsController(service);
  });

  it('delegates all trip endpoints to TripsService', async () => {
    const startDto = {
      bookingId: 'booking-1',
      startLatitude: 10,
      startLongitude: 106,
    } as any;
    const endDto = {
      endLatitude: 10.1,
      endLongitude: 106.1,
      endBattery: 90,
    } as any;
    const issueDto = { issueDescription: 'Flat tire' } as any;

    await expect(controller.startTrip('user-1', startDto)).resolves.toBe(trip);
    await expect(controller.endTrip('trip-1', 'user-1', endDto)).resolves.toBe(
      trip,
    );
    await expect(controller.getActiveTrip('user-1')).resolves.toBe(trip);
    await expect(controller.getTripHistory('user-1')).resolves.toEqual([trip]);
    await expect(controller.getTrip('trip-1', 'user-1')).resolves.toBe(trip);
    await expect(
      controller.reportIssue('trip-1', 'user-1', issueDto),
    ).resolves.toBe(trip);

    expect(service.startTrip).toHaveBeenCalledWith('user-1', startDto);
    expect(service.endTrip).toHaveBeenCalledWith('trip-1', 'user-1', endDto);
    expect(service.getActiveTrip).toHaveBeenCalledWith('user-1');
    expect(service.getTripHistory).toHaveBeenCalledWith('user-1');
    expect(service.getTripById).toHaveBeenCalledWith('trip-1', 'user-1');
    expect(service.reportIssue).toHaveBeenCalledWith(
      'trip-1',
      'user-1',
      issueDto,
    );
  });
});
