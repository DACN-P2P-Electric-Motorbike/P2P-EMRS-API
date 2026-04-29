import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TripStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TripLocationRetentionService {
  private readonly logger = new Logger(TripLocationRetentionService.name);
  private readonly retentionDays = 90;

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async anonymizeExpiredTripLocations(): Promise<number> {
    const cutoff = new Date(
      Date.now() - this.retentionDays * 24 * 60 * 60 * 1000,
    );

    const result = await this.prisma.trip.updateMany({
      where: {
        status: TripStatus.COMPLETED,
        completedAt: { lt: cutoff },
        OR: [
          { startLatitude: { not: null } },
          { startLongitude: { not: null } },
          { startAddress: { not: null } },
          { endLatitude: { not: null } },
          { endLongitude: { not: null } },
          { endAddress: { not: null } },
        ],
      },
      data: {
        startLatitude: null,
        startLongitude: null,
        startAddress: null,
        endLatitude: null,
        endLongitude: null,
        endAddress: null,
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Anonymized GPS/address data for ${result.count} completed trips older than ${this.retentionDays} days`,
      );
    }

    return result.count;
  }
}
