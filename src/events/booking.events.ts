import { BookingStatus } from '@prisma/client';

export class BookingCreatedEvent {
  constructor(
    public readonly bookingId: string,
    public readonly renterId: string,
    public readonly ownerId: string,
    public readonly vehicleId: string,
  ) {}
}

export class BookingApprovedEvent {
  constructor(
    public readonly bookingId: string,
    public readonly renterId: string,
    public readonly ownerId: string,
    public readonly vehicleId: string,
  ) {}
}

export class BookingRejectedEvent {
  constructor(
    public readonly bookingId: string,
    public readonly renterId: string,
    public readonly ownerId: string,
    public readonly reason: string,
  ) {}
}

export class BookingCancelledEvent {
  constructor(
    public readonly bookingId: string,
    public readonly renterId: string,
    public readonly ownerId: string,
    public readonly reason: string,
    public readonly cancelledBy: 'renter' | 'owner',
  ) {}
}

export class BookingStatusChangedEvent {
  constructor(
    public readonly bookingId: string,
    public readonly oldStatus: BookingStatus,
    public readonly newStatus: BookingStatus,
    public readonly renterId: string,
    public readonly ownerId: string,
  ) {}
}