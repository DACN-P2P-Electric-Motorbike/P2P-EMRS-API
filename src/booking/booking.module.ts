import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { OwnerBookingsController } from './owner-bookings.controller';
import { OwnerBookingsService } from './owner-bookings.service';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [EventEmitterModule.forRoot(), NotificationModule],
  controllers: [BookingsController, OwnerBookingsController],
  providers: [BookingsService, OwnerBookingsService],
  exports: [BookingsService, OwnerBookingsService],
})
export class BookingsModule {}
