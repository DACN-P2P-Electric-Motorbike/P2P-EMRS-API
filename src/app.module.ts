import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { UploadModule } from './upload/upload.module';
import { BookingsModule } from './booking/booking.module';
import { TripsModule } from './trips/trips.module';
import { PaymentsModule } from './payments/payments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { NotificationModule } from './notification/notification.module';
import { EventListenerModule } from './events/events.modules';
import { AdminModule } from './admin/admin.module';
import { SecurityModule } from './security/security.module';
import { PrivacyModule } from './privacy/privacy.module';
import { TrustScoreModule } from './trust-score/trust-score.module';
import { KycModule } from './kyc/kyc.module';
import { HandoverModule } from './handover/handover.module';
import { FinancialModule } from './financial/financial.module';

@Module({
  imports: [
    // Configuration - Load environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Task scheduling (cron jobs)
    ScheduleModule.forRoot(),

    // Database - Prisma ORM
    DatabaseModule,

    // Shared security utilities
    SecurityModule,

    // Shared trust score policy and audit log
    TrustScoreModule,

    // Mail Service
    MailModule,

    // File Upload Service
    UploadModule,

    // Feature Modules
    AuthModule,

    // Vehicles Module
    VehiclesModule,

    // Bookings Module
    BookingsModule,

    // Notification Module
    NotificationModule,

    // Trips Module,
    TripsModule,

    // Payments Module
    PaymentsModule,

    // Reviews Module
    ReviewsModule,

    // Privacy rights / data export requests
    PrivacyModule,

    // Identity verification / KYC
    KycModule,

    // Vehicle handover / check-in / check-out
    HandoverModule,

    // Deposit ledger / post-trip charges
    FinancialModule,

    EventListenerModule,

    // Admin Module
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
