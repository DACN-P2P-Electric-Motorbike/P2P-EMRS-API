import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsDateString,
  IsOptional,
  IsString,
  IsNotEmpty,
} from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({
    description: 'Vehicle ID to book',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({
    description: 'Booking start time (ISO 8601)',
    example: '2024-12-15T10:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    description: 'Booking end time (ISO 8601)',
    example: '2024-12-15T18:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  endTime: string;

  @ApiPropertyOptional({
    description: 'Additional notes for the owner',
    example: 'I need the bike for city tour',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
