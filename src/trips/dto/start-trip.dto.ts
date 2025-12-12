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

  @ApiProperty({
    description: 'Start location latitude',
    example: 10.762622,
  })
  @IsLatitude()
  @IsNotEmpty()
  startLatitude: number;

  @ApiProperty({
    description: 'Start location longitude',
    example: 106.660172,
  })
  @IsLongitude()
  @IsNotEmpty()
  startLongitude: number;

  @ApiPropertyOptional({
    description: 'Start location address',
    example: '123 Nguyen Hue, District 1, Ho Chi Minh City',
  })
  @IsOptional()
  @IsString()
  startAddress?: string;

  @ApiProperty({
    description: 'Vehicle battery level at start (0-100%)',
    example: 95,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsNotEmpty()
  startBattery: number;
}
