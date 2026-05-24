import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { TrustScoreModule } from '../trust-score/trust-score.module';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [TrustScoreModule, KycModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
