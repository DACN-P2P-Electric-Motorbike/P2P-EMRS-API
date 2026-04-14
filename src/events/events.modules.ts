import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from 'src/database/prisma.module';
import { AuthModule } from 'src/auth';
import { VehiclesModule } from 'src/vehicles';
import { BookingsModule } from 'src/booking/booking.module';
import { NotificationModule } from 'src/notification/notification.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BookingEventListener } from './booking.listener';
import { AdminEventListener } from './admin.event.listener';
import { TripEventListener } from './trip.listener';
import { PaymentEventListener } from './payment.listener';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 10,
      verboseMemoryLeak: true,
    }),

    DatabaseModule,
    AuthModule,
    VehiclesModule,
    BookingsModule,
    NotificationModule,
  ],

  providers: [BookingEventListener, AdminEventListener, TripEventListener, PaymentEventListener],
})
export class EventListenerModule {}
