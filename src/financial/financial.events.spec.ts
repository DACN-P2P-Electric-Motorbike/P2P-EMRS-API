import { PaymentCompletedEvent } from '../events/payment.events';
import { TripCompletedEvent } from '../events/trip.events';
import { FinancialEventListener } from './financial.events';
import { FinancialService } from './financial.service';

describe('FinancialEventListener', () => {
  const financialService = {
    recordPaymentCompleted: jest.fn(),
    recalculatePostTripChargesForBooking: jest.fn(),
  };
  let listener: FinancialEventListener;

  beforeEach(() => {
    jest.clearAllMocks();
    listener = new FinancialEventListener(
      financialService as unknown as FinancialService,
    );
  });

  it('records deposit hold after payment completion', async () => {
    await listener.handlePaymentCompleted(
      new PaymentCompletedEvent(
        'payment-1',
        'booking-1',
        'renter-1',
        'owner-1',
        120000,
      ),
    );

    expect(financialService.recordPaymentCompleted).toHaveBeenCalledWith(
      'booking-1',
      'payment-1',
    );
  });

  it('calculates post-trip charges after trip completion', async () => {
    await listener.handleTripCompleted(
      new TripCompletedEvent(
        'trip-1',
        'booking-1',
        'renter-1',
        'owner-1',
        'vehicle-1',
        10,
        60,
      ),
    );

    expect(
      financialService.recalculatePostTripChargesForBooking,
    ).toHaveBeenCalledWith('booking-1');
  });

  it('does not rethrow listener errors', async () => {
    financialService.recordPaymentCompleted.mockRejectedValueOnce(
      new Error('db unavailable'),
    );

    await expect(
      listener.handlePaymentCompleted(
        new PaymentCompletedEvent(
          'payment-1',
          'booking-1',
          'renter-1',
          'owner-1',
          120000,
        ),
      ),
    ).resolves.toBeUndefined();
  });
});
