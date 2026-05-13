import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/prisma.module';
import { TrustScoreModule } from '../trust-score/trust-score.module';

// Controllers
import { AdminVehiclesController } from './controllers/admin-vehicles.controller';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminBookingsController } from './controllers/admin-bookings.controller';
import { AdminReportsController } from './controllers/admin-reports.controller';

// Services
import { AdminVehiclesService } from './services/admin-vehicles.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminBookingsService } from './services/admin-bookings.service';
import { AdminReportsService } from './services/admin-reports.service';

// Repositories
import { AdminVehiclesRepository } from './repositories/admin-vehicles.repository';
import { AdminDashboardRepository } from './repositories/admin-dashboard.repository';
import { AdminUsersRepository } from './repositories/admin-users.repository';
import { AdminBookingsRepository } from './repositories/admin-bookings.repository';
import { AdminReportsRepository } from './repositories/admin-reports.repository';

@Module({
  imports: [DatabaseModule, TrustScoreModule],
  controllers: [
    AdminVehiclesController,
    AdminDashboardController,
    AdminUsersController,
    AdminBookingsController,
    AdminReportsController,
  ],
  providers: [
    // Services
    AdminVehiclesService,
    AdminDashboardService,
    AdminUsersService,
    AdminBookingsService,
    AdminReportsService,
    // Repositories
    AdminVehiclesRepository,
    AdminDashboardRepository,
    AdminUsersRepository,
    AdminBookingsRepository,
    AdminReportsRepository,
  ],
})
export class AdminModule {}
