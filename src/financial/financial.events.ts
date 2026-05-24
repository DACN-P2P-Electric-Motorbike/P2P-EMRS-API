import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentCompletedEvent } from '../events/payment.events';
import { TripCompletedEvent } from '../events/trip.events';
import { FinancialService } from './financial.service';

@Injectable()
export class FinancialEventListener {
  private readonly logger = new Logger(FinancialEventListener.name);

  constructor(private readonly financialService: FinancialService) {}

  @OnEvent('payment.completed')
  async handlePaymentCompleted(event: PaymentCompletedEvent): Promise<void> {
    try {
      await this.financialService.recordPaymentCompleted(
        event.bookingId,
        event.paymentId,
      );
    } catch (err) {
      this.logger.error(
        `Failed to record deposit hold for booking ${event.bookingId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent('trip.completed')
  async handleTripCompleted(event: TripCompletedEvent): Promise<void> {
    try {
      await this.financialService.recalculatePostTripChargesForBooking(
        event.bookingId,
      );
    } catch (err) {
      this.logger.error(
        `Failed to calculate post-trip charges for booking ${event.bookingId}: ${(err as Error).message}`,
      );
    }
  }
}
