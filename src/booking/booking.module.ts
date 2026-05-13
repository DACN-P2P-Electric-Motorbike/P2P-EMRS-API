import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { OwnerBookingsController } from './owner-bookings.controller';
import { OwnerBookingsService } from './owner-bookings.service';
import { BookingSchedulerService } from './booking-scheduler.service';
import { NotificationModule } from 'src/notification/notification.module';
import { TrustScoreModule } from '../trust-score/trust-score.module';

@Module({
  imports: [EventEmitterModule.forRoot(), NotificationModule, TrustScoreModule],
  controllers: [BookingsController, OwnerBookingsController],
  providers: [BookingsService, OwnerBookingsService, BookingSchedulerService],
  exports: [BookingsService, OwnerBookingsService],
})
export class BookingsModule {}
