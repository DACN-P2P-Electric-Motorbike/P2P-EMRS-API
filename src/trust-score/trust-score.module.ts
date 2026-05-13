import { Module } from '@nestjs/common';
import { TrustScoreService } from './trust-score.service';

@Module({
  providers: [TrustScoreService],
  exports: [TrustScoreService],
})
export class TrustScoreModule {}
