export class TripStartedEvent {
  constructor(
    public readonly tripId: string,
    public readonly bookingId: string,
    public readonly renterId: string,
    public readonly ownerId: string,
    public readonly vehicleId: string,
  ) {}
}

export class TripCompletedEvent {
  constructor(
    public readonly tripId: string,
    public readonly bookingId: string,
    public readonly renterId: string,
    public readonly ownerId: string,
    public readonly vehicleId: string,
    public readonly distanceTraveled: number,
    public readonly durationMinutes: number,
  ) {}
}
