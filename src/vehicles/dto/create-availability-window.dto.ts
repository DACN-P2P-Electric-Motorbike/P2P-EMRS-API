import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  AvailabilityWindowRecurrence,
  AvailabilityWindowType,
} from '@prisma/client';

export class CreateAvailabilityWindowDto {
  @ApiProperty({
    description:
      'Window type. AVAILABLE defines bookable time; BLOCKED excludes time.',
    enum: AvailabilityWindowType,
    example: AvailabilityWindowType.AVAILABLE,
  })
  @IsEnum(AvailabilityWindowType)
  type: AvailabilityWindowType;

  @ApiPropertyOptional({
    description: 'Whether this is a single window or a weekly rule.',
    enum: AvailabilityWindowRecurrence,
    default: AvailabilityWindowRecurrence.ONCE,
  })
  @IsOptional()
  @IsEnum(AvailabilityWindowRecurrence)
  recurrence?: AvailabilityWindowRecurrence;

  @ApiPropertyOptional({
    description: 'ISO weekdays for a WEEKLY rule, where Monday=1 and Sunday=7.',
    type: [Number],
    example: [1, 3, 5],
  })
  @ValidateIf((dto) => dto.recurrence === AvailabilityWindowRecurrence.WEEKLY)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  recurringWeekdays?: number[];

  @ApiPropertyOptional({
    description:
      'Fallback UTC offset in minutes used for legacy weekly rule local schedules.',
    example: 420,
  })
  @IsOptional()
  @IsInt()
  @Min(-720)
  @Max(840)
  timezoneOffsetMinutes?: number;

  @ApiPropertyOptional({
    description:
      'IANA timezone used to interpret weekly local schedule times across offset changes.',
    example: 'Asia/Ho_Chi_Minh',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezoneName?: string;

  @ApiPropertyOptional({
    description: 'Optional final date for a weekly rule (ISO 8601).',
    example: '2026-12-31T16:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  recurrenceEndsAt?: string;

  @ApiProperty({
    description: 'Window start time (ISO 8601)',
    example: '2026-05-25T08:00:00.000Z',
  })
  @IsDateString()
  startTime: string;

  @ApiProperty({
    description: 'Window end time (ISO 8601)',
    example: '2026-05-25T18:00:00.000Z',
  })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({
    description: 'Owner note for this availability window',
    example: 'Available for day rentals',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
