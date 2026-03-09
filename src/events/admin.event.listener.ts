import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationGateway } from '../notification/notification.gateway';
import {
  VehicleSubmittedForApprovalEvent,
  TripIssueReportedEvent,
  NewUserRegisteredEvent,
} from './admin.events';

@Injectable()
export class AdminEventListener {
  private readonly logger = new Logger(AdminEventListener.name);

  constructor(private readonly notificationGateway: NotificationGateway) {}

  @OnEvent('vehicle.submitted')
  handleVehicleSubmitted(event: VehicleSubmittedForApprovalEvent) {
    this.logger.log(`Handling vehicle.submitted event: ${event.vehicleId}`);

    this.notificationGateway.broadcastToAdmins('admin_alert', {
      type: 'VEHICLE_APPROVAL',
      title: 'Xe mới chờ phê duyệt',
      message: `${event.vehicleName} - ${event.plateNumber}`,
      link: '/approve-vehicles',
      vehicleId: event.vehicleId,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent('trip.issue_reported')
  handleIssueReported(event: TripIssueReportedEvent) {
    this.logger.log(`Handling trip.issue_reported event: ${event.tripId}`);

    this.notificationGateway.broadcastToAdmins('admin_alert', {
      type: 'TRIP_ISSUE',
      title: 'Sự cố chuyến đi',
      message: event.issueDescription,
      link: '/reports',
      tripId: event.tripId,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent('user.registered')
  handleUserRegistered(event: NewUserRegisteredEvent) {
    this.logger.log(`Handling user.registered event: ${event.userId}`);

    this.notificationGateway.broadcastToAdmins('admin_alert', {
      type: 'NEW_USER',
      title: 'Người dùng mới đăng ký',
      message: `${event.fullName} (${event.email})`,
      link: '/approve-users',
      userId: event.userId,
      timestamp: new Date().toISOString(),
    });
  }
}
