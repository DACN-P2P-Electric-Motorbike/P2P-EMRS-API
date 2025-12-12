import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

    // Vehicles Module
    VehiclesModule,

    // Bookings Module
    BookingsModule,

    // Trips Module,
    TripsModule,

    // Payments Module
    PaymentsModule,

    // Reviews Module
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
