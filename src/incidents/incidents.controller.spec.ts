import { IncidentCategory, IncidentStatus, UserRole } from '@prisma/client';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

describe('IncidentsController', () => {
  let controller: IncidentsController;
  let service: jest.Mocked<IncidentsService>;
  const incident = { id: 'incident-uuid' } as any;

  beforeEach(() => {
    service = {
      createReport: jest.fn().mockResolvedValue(incident),
      listForBooking: jest.fn().mockResolvedValue([incident]),
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

    await expect(
      controller.createReport('user-uuid', [UserRole.RENTER], createDto),
    ).resolves.toBe(incident);
    await expect(
      controller.listForBooking('booking-uuid', 'user-uuid', [
        UserRole.RENTER,
      ]),
    ).resolves.toEqual([incident]);
    await expect(controller.getAdminQueue('25')).resolves.toEqual({
      status: 'success',
      data: [incident],
    });
    await expect(
      controller.updateStatus('incident-uuid', 'admin-uuid', statusDto),
    ).resolves.toBe(incident);

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
    expect(service.getAdminQueue).toHaveBeenCalledWith(25);
    expect(service.updateStatus).toHaveBeenCalledWith(
      'incident-uuid',
      'admin-uuid',
      statusDto,
    );
  });
});
