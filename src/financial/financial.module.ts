import { Module } from '@nestjs/common';
import { FinancialController } from './financial.controller';
import { FinancialEventListener } from './financial.events';
import { FinancialService } from './financial.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [FinancialController],
  providers: [FinancialService, FinancialEventListener],
  exports: [FinancialService],
})
export class FinancialModule {}
