import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Vehicle,
  VehicleStatus,
  VehicleType,
  VehicleBrand,
  VehicleFeature,
  VehicleCondition,
  BatteryType,
  CancellationPolicyType,
  Prisma,
  User,
} from '@prisma/client';
import { Expose } from 'class-transformer';

export class PublicVehicleOwnerEntity implements Pick<
  User,
  'id' | 'fullName' | 'avatarUrl' | 'trustScore'
> {
  @ApiProperty({ description: 'Owner user ID' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Owner display name' })
  @Expose()
  fullName: string;

  @ApiPropertyOptional({ description: 'Owner avatar URL', nullable: true })
  @Expose()
  avatarUrl: string | null;

  @ApiProperty({ description: 'Owner trust score' })
  @Expose()
  trustScore: number;

  constructor(partial: Partial<PublicVehicleOwnerEntity>) {
    Object.assign(this, partial);
  }
}

type VehicleWithPublicOwner = Vehicle & {
  owner?: Pick<User, 'id' | 'fullName' | 'avatarUrl' | 'trustScore'> | null;
};

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

  @ApiProperty({
    description: 'Vehicle features',
    enum: VehicleFeature,
    isArray: true,
  })
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

  @ApiProperty({ description: 'Instant booking enabled' })
  @Expose()
  instantBook: boolean;

  @ApiProperty({
    description: 'Renter cancellation refund tier',
    enum: CancellationPolicyType,
  })
  @Expose()
  cancellationPolicy: CancellationPolicyType;

  @ApiPropertyOptional({ description: 'Max km per day (null = unlimited)' })
  @Expose()
  dailyKmLimit: number | null;

  @ApiPropertyOptional({ description: 'Price per excess km in VND' })
  @Expose()
  excessKmPrice: number | null;

  @ApiPropertyOptional({ description: 'Weekly discount percentage' })
  @Expose()
  weeklyDiscount: number | null;

  @ApiPropertyOptional({ description: 'Monthly discount percentage' })
  @Expose()
  monthlyDiscount: number | null;

  @ApiProperty({ description: 'Smoking allowed' })
  @Expose()
  allowSmoke: boolean;

  @ApiProperty({ description: 'Pets allowed' })
  @Expose()
  allowPets: boolean;

  @ApiPropertyOptional({ description: 'Geographic restriction' })
  @Expose()
  geoRestriction: string | null;

  @ApiPropertyOptional({ description: 'Minimum battery return level' })
  @Expose()
  batteryReturnMin: number | null;

  @ApiPropertyOptional({ description: 'Vehicle first registration year' })
  @Expose()
  firstRegistrationYear: number | null;

  @ApiPropertyOptional({
    description: 'Current vehicle condition',
    enum: VehicleCondition,
  })
  @Expose()
  condition: VehicleCondition | null;

  @ApiPropertyOptional({
    description: 'EV battery pack type',
    enum: BatteryType,
  })
  @Expose()
  batteryType: BatteryType | null;

  @ApiPropertyOptional({ description: 'Battery health percentage' })
  @Expose()
  batteryHealth: number | null;

  @ApiPropertyOptional({
    description: 'Approximate battery charge cycle count',
  })
  @Expose()
  batteryCycleCount: number | null;

  @ApiPropertyOptional({ description: 'Last battery service date' })
  @Expose()
  batteryLastServicedAt: Date | null;

  @ApiProperty({ description: 'Owner user ID' })
  @Expose()
  ownerId: string;

  @ApiPropertyOptional({
    description: 'Public owner summary for renter-facing listing details',
    type: () => PublicVehicleOwnerEntity,
    nullable: true,
  })
  @Expose()
  owner?: PublicVehicleOwnerEntity | null;

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

  static fromPrisma(
    vehicle: VehicleWithPublicOwner,
    distance?: number,
  ): VehicleEntity {
    const { owner, ...vehicleFields } = vehicle;

    return new VehicleEntity({
      ...vehicleFields,
      owner:
        owner === undefined
          ? undefined
          : owner === null
            ? null
            : new PublicVehicleOwnerEntity({
                id: owner.id,
                fullName: owner.fullName,
                avatarUrl: owner.avatarUrl,
                trustScore: owner.trustScore,
              }),
      distance,
    });
  }
}
