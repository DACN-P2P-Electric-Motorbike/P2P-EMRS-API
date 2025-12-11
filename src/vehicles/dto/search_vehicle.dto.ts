import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Min,
  Max,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { VehicleType } from '@prisma/client';
import { VehicleEntity } from '../entites/vehicles.entity';

export class SearchVehiclesDto {
  @ApiProperty({
    description: 'User latitude',
    example: 10.762622,
  })
  @IsLatitude()
  @Type(() => Number)
  latitude: number;

  @ApiProperty({
    description: 'User longitude',
    example: 106.660172,
  })
  @IsLongitude()
  @Type(() => Number)
  longitude: number;

  @ApiPropertyOptional({
    description: 'Search radius in kilometers',
    default: 5,
    minimum: 0.1,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(50)
  @Type(() => Number)
  radius?: number = 5;

  @ApiPropertyOptional({
    description: 'Vehicle type filter',
    enum: VehicleType,
  })
  @IsOptional()
  @IsEnum(VehicleType)
  type?: VehicleType;

  @ApiPropertyOptional({
    description: 'Minimum rating (0-5)',
    minimum: 0,
    maximum: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  @Type(() => Number)
  minRating?: number;

  @ApiPropertyOptional({
    description: 'Maximum price per hour',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxPricePerHour?: number;

  @ApiPropertyOptional({
    description: 'Only show available vehicles',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  availableOnly?: boolean = true;

  @ApiPropertyOptional({
    description: 'Page number',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

export class SearchVehiclesResponseDto {
  @ApiProperty({ type: [VehicleEntity] })
  vehicles: VehicleEntity[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
