import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from 'src/database/prisma.module';
import { AuthModule } from 'src/auth';
import { VehiclesModule } from 'src/vehicles';
import { BookingsModule } from 'src/booking/booking.module';
import { NotificationModule } from 'src/notification/notification.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BookingEventListener } from './booking.listener';

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

  // ✅ ADD: Register listener
  providers: [BookingEventListener],
})
export class EventListenerModule {}
