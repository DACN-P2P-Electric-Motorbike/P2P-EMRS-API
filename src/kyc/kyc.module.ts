import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/prisma.module';
import { TrustScoreModule } from '../trust-score/trust-score.module';
import { AdminKycController } from './admin-kyc.controller';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

@Module({
  imports: [DatabaseModule, TrustScoreModule],
  controllers: [KycController, AdminKycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
