import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    // Configuration - Load environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database - Prisma ORM
    DatabaseModule,

    // Mail Service
    MailModule,
    
    // File Upload Service
    UploadModule,
    
    // Feature Modules
    AuthModule,
    VehiclesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
