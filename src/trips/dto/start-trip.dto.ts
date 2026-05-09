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
import { Type } from 'class-transformer';

export class StartTripDto {
  @ApiProperty({
    description: 'Booking ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  bookingId: string;

  @ApiProperty({
    description: 'Start location latitude',
    example: 10.762622,
  })
  @Type(() => Number)
  @IsLatitude()
  startLatitude: number;

  @ApiProperty({
    description: 'Start location longitude',
    example: 106.660172,
  })
  @Type(() => Number)
  @IsLongitude()
  startLongitude: number;

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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  startBattery?: number;
}
