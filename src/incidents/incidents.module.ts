import { Module } from '@nestjs/common';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { NotificationModule } from '../notification/notification.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [NotificationModule, UploadModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
