import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Vehicle, VehicleStatus, VehicleType } from '@prisma/client';
import { Expose } from 'class-transformer';
export class VehicleEntity implements Vehicle {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty({ enum: VehicleType })
  @Expose()
  type: VehicleType;

  @ApiProperty()
  @Expose()
  brand: string;

  @ApiProperty()
  @Expose()
  model: string;

  @ApiProperty()
  @Expose()
  year: number;

  @ApiProperty()
  @Expose()
  licensePlate: string;

  @ApiPropertyOptional()
  @Expose()
  description: string | null;

  @ApiProperty({ type: [String] })
  @Expose()
  imageUrls: string[];

  @ApiProperty()
  @Expose()
  batteryCapacity: number;

  @ApiProperty()
  @Expose()
  maxSpeed: number;

  @ApiProperty()
  @Expose()
  range: number;

  @ApiProperty()
  @Expose()
  pricePerHour: number;

  @ApiProperty()
  @Expose()
  pricePerDay: number;

  @ApiProperty()
  @Expose()
  deposit: number;

  @ApiProperty({ enum: VehicleStatus })
  @Expose()
  status: VehicleStatus;

  @ApiProperty()
  @Expose()
  isAvailable: boolean;

  @ApiProperty()
  @Expose()
  latitude: number;

  @ApiProperty()
  @Expose()
  longitude: number;

  @ApiProperty()
  @Expose()
  address: string;

  @ApiProperty()
  @Expose()
  ownerId: string;

  @ApiProperty()
  @Expose()
  totalTrips: number;

  @ApiProperty()
  @Expose()
  rating: number;

  @ApiProperty()
  @Expose()
  reviewCount: number;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
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
