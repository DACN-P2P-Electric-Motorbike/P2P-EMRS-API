import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  Min,
  Max,
  IsLatitude,
  IsLongitude,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleType, VehicleStatus } from '@prisma/client';

export class UpdateVehicleDto {
  @ApiPropertyOptional({
    description: 'Vehicle model name',
    example: 'VinFast Klara S',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description: 'Vehicle type',
    enum: VehicleType,
  })
  @IsOptional()
  @IsEnum(VehicleType)
  type?: VehicleType;

  @ApiPropertyOptional({
    description: 'Vehicle status (Owner can only set AVAILABLE or MAINTENANCE)',
    enum: VehicleStatus,
  })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @ApiPropertyOptional({
    description: 'Battery level (0-100)',
    example: 85,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  batteryLevel?: number;

  @ApiPropertyOptional({
    description: 'Price per hour in VND',
    example: 30000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Type(() => Number)
  pricePerHour?: number;

  @ApiPropertyOptional({
    description: 'Price per day in VND',
    example: 150000,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pricePerDay?: number | null;

  @ApiPropertyOptional({
    description: 'Vehicle location address',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'Latitude coordinate',
  })
  @IsOptional()
  @IsLatitude()
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude coordinate',
  })
  @IsOptional()
  @IsLongitude()
  @Type(() => Number)
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Vehicle description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Array of image URLs',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({
    description: 'Whether the vehicle is available for rent (toggle on/off)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Enable instant booking (auto-approve)' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  instantBook?: boolean;

  @ApiPropertyOptional({ description: 'Maximum km allowed per day' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  dailyKmLimit?: number | null;

  @ApiPropertyOptional({ description: 'Price per excess km (VND)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  excessKmPrice?: number | null;

  @ApiPropertyOptional({ description: 'Weekly discount percentage (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  weeklyDiscount?: number | null;

  @ApiPropertyOptional({ description: 'Monthly discount percentage (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  monthlyDiscount?: number | null;

  @ApiPropertyOptional({ description: 'Allow smoking in/near the vehicle' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allowSmoke?: boolean;

  @ApiPropertyOptional({ description: 'Allow pets in the vehicle' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allowPets?: boolean;

  @ApiPropertyOptional({ description: 'Geographic restriction' })
  @IsOptional()
  @IsString()
  geoRestriction?: string | null;

  @ApiPropertyOptional({ description: 'Minimum battery return level (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  batteryReturnMin?: number | null;
}
