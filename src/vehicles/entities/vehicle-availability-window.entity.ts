import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AvailabilityWindowType,
  VehicleAvailabilityWindow,
} from '@prisma/client';
import { Expose } from 'class-transformer';

export class VehicleAvailabilityWindowEntity
  implements VehicleAvailabilityWindow
{
  @ApiProperty({ description: 'Availability window unique identifier' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Vehicle ID' })
  @Expose()
  vehicleId: string;

  @ApiProperty({
    description: 'Window type',
    enum: AvailabilityWindowType,
  })
  @Expose()
  type: AvailabilityWindowType;

  @ApiProperty({ description: 'Window start time' })
  @Expose()
  startTime: Date;

  @ApiProperty({ description: 'Window end time' })
  @Expose()
  endTime: Date;

  @ApiPropertyOptional({ description: 'Owner note' })
  @Expose()
  note: string | null;

  @ApiProperty({ description: 'Creation timestamp' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date;

  constructor(partial: Partial<VehicleAvailabilityWindowEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(
    window: VehicleAvailabilityWindow,
  ): VehicleAvailabilityWindowEntity {
    return new VehicleAvailabilityWindowEntity(window);
  }
}
