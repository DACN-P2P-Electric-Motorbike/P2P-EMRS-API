import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AvailabilityWindowRecurrence,
  AvailabilityWindowType,
  VehicleAvailabilityWindow,
} from '@prisma/client';
import { Expose } from 'class-transformer';

export class VehicleAvailabilityWindowEntity implements VehicleAvailabilityWindow {
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

  @ApiProperty({
    description: 'Window recurrence mode',
    enum: AvailabilityWindowRecurrence,
  })
  @Expose()
  recurrence: AvailabilityWindowRecurrence;

  @ApiProperty({
    description: 'ISO weekdays for a weekly recurring rule',
    type: [Number],
  })
  @Expose()
  recurringWeekdays: number[];

  @ApiPropertyOptional({
    description: 'Stored UTC offset in minutes for a weekly rule',
  })
  @Expose()
  timezoneOffsetMinutes: number | null;

  @ApiPropertyOptional({ description: 'Final date for a weekly rule' })
  @Expose()
  recurrenceEndsAt: Date | null;

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
