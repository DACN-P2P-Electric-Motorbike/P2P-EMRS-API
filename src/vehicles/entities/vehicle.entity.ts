import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Vehicle, VehicleStatus, VehicleType, VehicleBrand, VehicleFeature } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { Expose } from 'class-transformer';

export class VehicleEntity implements Vehicle {
  @ApiProperty({ description: 'Vehicle unique identifier' })
  @Expose()
  id: string;

  @ApiPropertyOptional({ description: 'Vehicle name' })
  @Expose()
  name: string | null;

  @ApiProperty({ description: 'License plate number' })
  @Expose()
  licensePlate: string;

  @ApiProperty({ description: 'Vehicle model name' })
  @Expose()
  model: string;

  @ApiProperty({ description: 'Vehicle brand', enum: VehicleBrand })
  @Expose()
  brand: VehicleBrand;

  @ApiProperty({ description: 'Vehicle type', enum: VehicleType })
  @Expose()
  type: VehicleType;

  @ApiPropertyOptional({ description: 'Vehicle year' })
  @Expose()
  year: number | null;

  @ApiProperty({ description: 'Vehicle status', enum: VehicleStatus })
  @Expose()
  status: VehicleStatus;

  @ApiProperty({ description: 'Vehicle features', enum: VehicleFeature, isArray: true })
  @Expose()
  features: VehicleFeature[];

  @ApiPropertyOptional({ description: 'Battery capacity in kWh' })
  @Expose()
  batteryCapacity: number | null;

  @ApiProperty({ description: 'Battery level (0-100)' })
  @Expose()
  batteryLevel: number;

  @ApiPropertyOptional({ description: 'Maximum speed in km/h' })
  @Expose()
  maxSpeed: number | null;

  @ApiPropertyOptional({ description: 'Range per charge in km' })
  @Expose()
  range: number | null;

  @ApiProperty({ description: 'Price per hour in VND' })
  @Expose()
  pricePerHour: Prisma.Decimal;

  @ApiPropertyOptional({ description: 'Price per day in VND' })
  @Expose()
  pricePerDay: Prisma.Decimal | null;

  @ApiPropertyOptional({ description: 'Deposit amount in VND' })
  @Expose()
  deposit: number | null;

  @ApiProperty({ description: 'Is vehicle available for rent' })
  @Expose()
  isAvailable: boolean;

  @ApiProperty({ description: 'Location address' })
  @Expose()
  address: string;

  @ApiPropertyOptional({ description: 'Latitude coordinate' })
  @Expose()
  latitude: number | null;

  @ApiPropertyOptional({ description: 'Longitude coordinate' })
  @Expose()
  longitude: number | null;

  @ApiPropertyOptional({ description: 'Vehicle description' })
  @Expose()
  description: string | null;

  @ApiProperty({ description: 'Array of image URLs', type: [String] })
  @Expose()
  images: string[];

  @ApiPropertyOptional({ description: 'Vehicle registration license number' })
  @Expose()
  licenseNumber: string | null;

  @ApiPropertyOptional({ description: 'License photo front URL' })
  @Expose()
  licenseFront: string | null;

  @ApiPropertyOptional({ description: 'License photo back URL' })
  @Expose()
  licenseBack: string | null;

  @ApiProperty({ description: 'Total completed trips' })
  @Expose()
  totalTrips: number;

  @ApiProperty({ description: 'Average rating' })
  @Expose()
  totalRating: number;

  @ApiProperty({ description: 'Number of reviews' })
  @Expose()
  reviewCount: number;

  @ApiProperty({ description: 'Owner user ID' })
  @Expose()
  ownerId: string;

  @ApiProperty({ description: 'Creation timestamp' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Distance from user location in km' })
  @Expose()
  distance?: number;

  constructor(partial: Partial<VehicleEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(vehicle: Vehicle, distance?: number): VehicleEntity {
    return new VehicleEntity({
      ...vehicle,
      distance,
    });
  }
}
