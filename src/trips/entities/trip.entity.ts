import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Trip, TripStatus } from '@prisma/client';
import { Expose } from 'class-transformer';

export class TripEntity implements Trip {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiProperty()
  @Expose()
  renterId: string;

  @ApiProperty()
  @Expose()
  vehicleId: string;

  @ApiProperty({ enum: TripStatus })
  @Expose()
  status: TripStatus;

  @ApiPropertyOptional()
  @Expose()
  startLatitude: number | null;

  @ApiPropertyOptional()
  @Expose()
  startLongitude: number | null;

  @ApiPropertyOptional()
  @Expose()
  startAddress: string | null;

  @ApiPropertyOptional()
  @Expose()
  endLatitude: number | null;

  @ApiPropertyOptional()
  @Expose()
  endLongitude: number | null;

  @ApiPropertyOptional()
  @Expose()
  endAddress: string | null;

  @ApiPropertyOptional()
  @Expose()
  distanceTraveled: number | null;

  @ApiPropertyOptional()
  @Expose()
  duration: number | null;

  @ApiPropertyOptional()
  @Expose()
  startBattery: number | null;

  @ApiPropertyOptional()
  @Expose()
  endBattery: number | null;

  @ApiProperty()
  @Expose()
  hasIssues: boolean;

  @ApiPropertyOptional()
  @Expose()
  issueDescription: string | null;

  @ApiPropertyOptional()
  @Expose()
  startedAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  completedAt: Date | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  constructor(partial: Partial<TripEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(
    trip: Trip,
    options: { includeExactLocation?: boolean } = {},
  ): TripEntity {
    const entity = new TripEntity(trip);

    if (!options.includeExactLocation) {
      entity.startLatitude = null;
      entity.startLongitude = null;
      entity.startAddress = null;
      entity.endLatitude = null;
      entity.endLongitude = null;
      entity.endAddress = null;
    }

    return entity;
  }
}
