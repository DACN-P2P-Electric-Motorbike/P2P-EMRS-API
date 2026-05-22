import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { HandoverPhotoDto } from './handover-photo.dto';

export class CreateHandoverDto {
  @ApiProperty({
    description: 'Booking ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  bookingId: string;

  @ApiProperty({
    description: 'Required handover photos with angle metadata',
    type: [HandoverPhotoDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => HandoverPhotoDto)
  photos: HandoverPhotoDto[];

  @ApiPropertyOptional({ description: 'Odometer reading in km', example: 15200 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  odometerReading?: number;

  @ApiPropertyOptional({ description: 'Battery level percentage', example: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @ApiPropertyOptional({
    description: 'Fuel level percentage for non-EV vehicles',
    example: 80,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  fuelLevel?: number;

  @ApiPropertyOptional({ description: 'Handover GPS latitude', example: 10.7769 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Handover GPS longitude',
    example: 106.7009,
  })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Condition notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
