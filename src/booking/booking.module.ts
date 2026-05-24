import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { OwnerBookingsController } from './owner-bookings.controller';
import { OwnerBookingsService } from './owner-bookings.service';
import { BookingSchedulerService } from './booking-scheduler.service';
import { BookingLockService } from './booking-lock.service';
import { NotificationModule } from 'src/notification/notification.module';
import { TrustScoreModule } from '../trust-score/trust-score.module';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    NotificationModule,
    TrustScoreModule,
    KycModule,
  ],
  controllers: [BookingsController, OwnerBookingsController],
  providers: [
    BookingsService,
    OwnerBookingsService,
    BookingSchedulerService,
    BookingLockService,
  ],
  exports: [BookingsService, OwnerBookingsService, BookingLockService],
})
export class BookingsModule {}
