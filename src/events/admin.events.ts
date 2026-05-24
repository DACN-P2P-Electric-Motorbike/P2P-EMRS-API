export class VehicleSubmittedForApprovalEvent {
  constructor(
    public readonly vehicleId: string,
    public readonly ownerId: string,
    public readonly vehicleName: string,
    public readonly plateNumber: string,
  ) {}
}

export class TripIssueReportedEvent {
  constructor(
    public readonly tripId: string,
    public readonly renterId: string,
    public readonly vehicleId: string,
    public readonly issueDescription: string,
    public readonly incidentReportId?: string,
  ) {}
}

export class NewUserRegisteredEvent {
  constructor(
    public readonly userId: string,
    public readonly fullName: string,
    public readonly email: string,
  ) {}
}
