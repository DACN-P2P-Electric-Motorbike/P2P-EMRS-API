import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AvailabilityWindowRecurrence,
  AvailabilityWindowType,
  VehicleAvailabilityWindow,
} from '@prisma/client';

export class PublicVehicleAvailabilityRuleEntity {
  @ApiProperty({ enum: AvailabilityWindowType })
  type: AvailabilityWindowType;

  @ApiProperty({ enum: AvailabilityWindowRecurrence })
  recurrence: AvailabilityWindowRecurrence;

  @ApiProperty({ type: [Number] })
  recurringWeekdays: number[];

  @ApiPropertyOptional()
  timezoneOffsetMinutes: number | null;

  @ApiPropertyOptional()
  recurrenceEndsAt: Date | null;

  @ApiProperty()
  startTime: Date;

  @ApiProperty()
  endTime: Date;

  constructor(partial: Partial<PublicVehicleAvailabilityRuleEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(
    window: VehicleAvailabilityWindow,
  ): PublicVehicleAvailabilityRuleEntity {
    return new PublicVehicleAvailabilityRuleEntity({
      type: window.type,
      recurrence: window.recurrence,
      recurringWeekdays: window.recurringWeekdays,
      timezoneOffsetMinutes: window.timezoneOffsetMinutes,
      recurrenceEndsAt: window.recurrenceEndsAt,
      startTime: window.startTime,
      endTime: window.endTime,
    });
  }
}

export class PublicVehicleAvailabilitySummaryEntity {
  @ApiProperty({
    description:
      'Whether the owner defined AVAILABLE periods that booking dates must match',
  })
  hasAvailableCalendar: boolean;

  @ApiProperty({ type: [PublicVehicleAvailabilityRuleEntity] })
  rules: PublicVehicleAvailabilityRuleEntity[];

  constructor(partial: Partial<PublicVehicleAvailabilitySummaryEntity>) {
    Object.assign(this, partial);
  }
}
