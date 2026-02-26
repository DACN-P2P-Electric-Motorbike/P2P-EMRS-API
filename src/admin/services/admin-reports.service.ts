import { Injectable, Logger } from '@nestjs/common';
import { AdminReportsRepository } from '../repositories/admin-reports.repository';

@Injectable()
export class AdminReportsService {
  private readonly logger = new Logger(AdminReportsService.name);

  constructor(
    private readonly reportsRepository: AdminReportsRepository,
  ) {}

  /**
   * Top vehicles by completed booking count
   */
  async getTopVehicles(limit: number = 10) {
    this.logger.log(`Fetching top ${limit} vehicles by booking count`);
    return this.reportsRepository.getTopVehicles(limit);
  }

  /**
   * Top owners by total revenue earned
   */
  async getTopOwners(limit: number = 10) {
    this.logger.log(`Fetching top ${limit} owners by revenue`);
    return this.reportsRepository.getTopOwners(limit);
  }
}
