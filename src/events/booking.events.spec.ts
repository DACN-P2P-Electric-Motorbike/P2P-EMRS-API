import { BookingStatus } from '@prisma/client';
import {
  BookingRejectedEvent,
  BookingStatusChangedEvent,
} from './booking.events';

describe('Booking events', () => {
  it('captures rejection details on BookingRejectedEvent', () => {
    const event = new BookingRejectedEvent(
      'booking-1',
      'renter-1',
      'owner-1',
      'Vehicle no longer available',
    );

    expect(event.bookingId).toBe('booking-1');
    expect(event.renterId).toBe('renter-1');
    expect(event.ownerId).toBe('owner-1');
    expect(event.reason).toBe('Vehicle no longer available');
  });

  it('captures status transition details on BookingStatusChangedEvent', () => {
    const event = new BookingStatusChangedEvent(
      'booking-2',
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
      'renter-2',
      'owner-2',
    );

    expect(event.bookingId).toBe('booking-2');
    expect(event.oldStatus).toBe(BookingStatus.PENDING);
    expect(event.newStatus).toBe(BookingStatus.CONFIRMED);
    expect(event.renterId).toBe('renter-2');
    expect(event.ownerId).toBe('owner-2');
  });
});
