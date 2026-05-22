import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  Min,
  Max,
  IsLatitude,
  IsLongitude,
  Matches,
  ArrayMinSize,
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
  @Matches(/^\d{2}[A-Z]?-?[A-Z]?\d{4,6}$/, {
    message:
      'License plate must be in Vietnamese format (e.g., 59A-12345 or 64-K28685)',
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
    example: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg',
    ],
    type: [String],
  })
  @IsArray({ message: 'Images must be an array' })
  @ArrayMinSize(1, { message: 'At least one vehicle image is required' })
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

  @ApiPropertyOptional({
    description: 'Enable instant booking (auto-approve)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  instantBook?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum km allowed per day (null = unlimited)',
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  dailyKmLimit?: number;

  @ApiPropertyOptional({
    description: 'Price per km over the daily limit (VND)',
    example: 3000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  excessKmPrice?: number;

  @ApiPropertyOptional({
    description: 'Weekly rental discount percentage (0-100)',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  weeklyDiscount?: number;

  @ApiPropertyOptional({
    description: 'Monthly rental discount percentage (0-100)',
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  monthlyDiscount?: number;

  @ApiPropertyOptional({
    description: 'Allow smoking in/near the vehicle',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allowSmoke?: boolean;

  @ApiPropertyOptional({
    description: 'Allow pets in the vehicle',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allowPets?: boolean;

  @ApiPropertyOptional({
    description: 'Geographic restriction (e.g., "province_only", "nationwide", "no_restriction")',
    example: 'no_restriction',
  })
  @IsOptional()
  @IsString()
  geoRestriction?: string;

  @ApiPropertyOptional({
    description: 'Minimum battery level required on return (0-100, EV-specific)',
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  batteryReturnMin?: number;
}
