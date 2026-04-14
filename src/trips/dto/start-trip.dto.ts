import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsNotEmpty,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class StartTripDto {
  @ApiProperty({
    description: 'Booking ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  bookingId: string;

  @ApiPropertyOptional({
    description: 'Start location latitude',
    example: 10.762622,
  })
  @IsOptional()
  @IsLatitude()
  startLatitude?: number;

  @ApiPropertyOptional({
    description: 'Start location longitude',
    example: 106.660172,
  })
  @IsOptional()
  @IsLongitude()
  startLongitude?: number;

  @ApiPropertyOptional({
    description: 'Start location address',
    example: '123 Nguyen Hue, District 1, Ho Chi Minh City',
  })
  @IsOptional()
  @IsString()
  startAddress?: string;

  @ApiPropertyOptional({
    description: 'Vehicle battery level at start (0-100%)',
    example: 95,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  startBattery?: number;
}
