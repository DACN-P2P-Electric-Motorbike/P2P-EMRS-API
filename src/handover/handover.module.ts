import { Module } from '@nestjs/common';
import { HandoverController } from './handover.controller';
import { HandoverService } from './handover.service';

@Module({
  controllers: [HandoverController],
  providers: [HandoverService],
  exports: [HandoverService],
})
export class HandoverModule {}
