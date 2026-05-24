import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AvailabilityWindowType } from '@prisma/client';

export class CreateAvailabilityWindowDto {
  @ApiProperty({
    description: 'Window type. AVAILABLE defines bookable time; BLOCKED excludes time.',
    enum: AvailabilityWindowType,
    example: AvailabilityWindowType.AVAILABLE,
  })
  @IsEnum(AvailabilityWindowType)
  type: AvailabilityWindowType;

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
