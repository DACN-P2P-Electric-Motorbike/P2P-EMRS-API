import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripLocationRetentionService } from './trip-location-retention.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [TripsController],
  providers: [TripsService, TripLocationRetentionService],
  exports: [TripsService],
})
export class TripsModule {}
