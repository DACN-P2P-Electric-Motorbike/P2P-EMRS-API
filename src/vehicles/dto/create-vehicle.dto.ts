import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  Min,
  Max,
  IsLatitude,
  IsLongitude,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleType, VehicleBrand, VehicleFeature } from '@prisma/client';

export class CreateVehicleDto {
  @ApiProperty({
    description: 'Vehicle license plate number (Vietnamese format)',
    example: '59A-12345',
  })
  @IsString()
  @IsNotEmpty({ message: 'License plate is required' })
  @Matches(/^[0-9]{2}[A-Z]?-?[A-Z]?[0-9]{4,6}$/, {
    message: 'License plate must be in Vietnamese format (e.g., 59A-12345 or 64-K28685)',
  })
  licensePlate: string;

  @ApiProperty({
    description: 'Vehicle model name',
    example: 'VinFast Evo200',
  })
  @IsString()
  @IsNotEmpty({ message: 'Model is required' })
  model: string;

  @ApiProperty({
    description: 'Vehicle brand',
    enum: VehicleBrand,
    example: VehicleBrand.VINFAST,
  })
  @IsEnum(VehicleBrand, { message: 'Invalid vehicle brand' })
  brand: VehicleBrand;

  @ApiPropertyOptional({
    description: 'Vehicle type',
    enum: VehicleType,
    example: VehicleType.OTHER,
    default: VehicleType.OTHER,
  })
  @IsOptional()
  @IsEnum(VehicleType, { message: 'Invalid vehicle type' })
  type?: VehicleType;

  @ApiPropertyOptional({
    description: 'Vehicle features',
    enum: VehicleFeature,
    isArray: true,
    example: [VehicleFeature.FAST_CHARGING, VehicleFeature.REPLACEABLE_BATTERY],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(VehicleFeature, { each: true })
  features?: VehicleFeature[];

  @ApiProperty({
    description: 'Price per hour in VND',
    example: 25000,
    minimum: 1,
  })
  @IsNumber({}, { message: 'Price per hour must be a number' })
  @Min(1, { message: 'Price per hour must be positive' })
  @Type(() => Number)
  pricePerHour: number;

  @ApiPropertyOptional({
    description: 'Price per day in VND',
    example: 500000,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pricePerDay?: number;

  @ApiProperty({
    description: 'Vehicle location address',
    example: '123 Nguyen Trai, Quan 1, TP.HCM',
  })
  @IsString()
  @IsNotEmpty({ message: 'Address is required' })
  address: string;

  @ApiPropertyOptional({
    description: 'Latitude coordinate',
    example: 10.7769,
  })
  @IsOptional()
  @IsLatitude({ message: 'Invalid latitude' })
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude coordinate',
    example: 106.7009,
  })
  @IsOptional()
  @IsLongitude({ message: 'Invalid longitude' })
  @Type(() => Number)
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Vehicle description',
    example: 'Well-maintained electric scooter with new battery',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Array of image URLs',
    example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
    type: [String],
  })
  @IsArray({ message: 'Images must be an array' })
  @IsString({ each: true, message: 'Each image must be a URL string' })
  images: string[];

  @ApiPropertyOptional({
    description: 'Vehicle registration license number',
    example: '123456789',
  })
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional({
    description: 'License photo front URL',
    example: 'https://example.com/license-front.jpg',
  })
  @IsOptional()
  @IsString()
  licenseFront?: string;

  @ApiPropertyOptional({
    description: 'License photo back URL',
    example: 'https://example.com/license-back.jpg',
  })
  @IsOptional()
  @IsString()
  licenseBack?: string;

  @ApiPropertyOptional({
    description: 'Initial battery level (0-100)',
    example: 100,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  batteryLevel?: number;
}
