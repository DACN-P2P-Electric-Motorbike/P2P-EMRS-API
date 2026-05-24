import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripLocationRetentionService } from './trip-location-retention.service';
import { TrustScoreModule } from '../trust-score/trust-score.module';
import { IncidentsModule } from '../incidents/incidents.module';

@Module({
  imports: [EventEmitterModule.forRoot(), TrustScoreModule, IncidentsModule],
  controllers: [TripsController],
  providers: [TripsService, TripLocationRetentionService],
  exports: [TripsService],
})
export class TripsModule {}
