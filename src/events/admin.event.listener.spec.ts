/**
 * Unit tests for AdminEventListener.
 * NotificationGateway is fully mocked — each handler broadcasts an admin alert
 * with the correct payload shape for its event type.
 */
import { AdminEventListener } from './admin.event.listener';
import { NotificationGateway } from '../notification/notification.gateway';
import {
  VehicleSubmittedForApprovalEvent,
  TripIssueReportedEvent,
  NewUserRegisteredEvent,
} from './admin.events';

describe('AdminEventListener', () => {
  let listener: AdminEventListener;
  let gateway: jest.Mocked<NotificationGateway>;

  beforeEach(() => {
    gateway = {
      broadcastToAdmins: jest.fn(),
    } as unknown as jest.Mocked<NotificationGateway>;

    listener = new AdminEventListener(gateway);
  });

  it('broadcasts a VEHICLE_APPROVAL alert when a vehicle is submitted', () => {
    const event = new VehicleSubmittedForApprovalEvent(
      'vehicle-1',
      'owner-1',
      'Honda Wave',
      '59A-12345',
    );

    listener.handleVehicleSubmitted(event);

    expect(gateway.broadcastToAdmins).toHaveBeenCalledWith(
      'admin_alert',
      expect.objectContaining({
        type: 'VEHICLE_APPROVAL',
        title: 'Xe mới chờ phê duyệt',
        message: 'Honda Wave - 59A-12345',
        link: '/approve-vehicles',
        vehicleId: 'vehicle-1',
        timestamp: expect.any(String),
      }),
    );
  });

  it('broadcasts a TRIP_ISSUE alert when a trip issue is reported', () => {
    const event = new TripIssueReportedEvent(
      'trip-1',
      'renter-1',
      'vehicle-1',
      'Flat tire',
      'incident-1',
    );

    listener.handleIssueReported(event);

    expect(gateway.broadcastToAdmins).toHaveBeenCalledWith(
      'admin_alert',
      expect.objectContaining({
        type: 'TRIP_ISSUE',
        title: 'Sự cố chuyến đi',
        message: 'Flat tire',
        link: '/incident-reports',
        tripId: 'trip-1',
        incidentReportId: 'incident-1',
        timestamp: expect.any(String),
      }),
    );
  });

  it('broadcasts a NEW_USER alert when a user registers', () => {
    const event = new NewUserRegisteredEvent(
      'user-1',
      'Nguyen Van A',
      'a@test.com',
    );

    listener.handleUserRegistered(event);

    expect(gateway.broadcastToAdmins).toHaveBeenCalledWith(
      'admin_alert',
      expect.objectContaining({
        type: 'NEW_USER',
        title: 'Người dùng mới đăng ký',
        message: 'Nguyen Van A (a@test.com)',
        link: '/approve-users',
        userId: 'user-1',
        timestamp: expect.any(String),
      }),
    );
  });
});
