import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HandoverType } from '@prisma/client';

type PhotoLike = {
  id: string;
  handoverId: string;
  photoUrl: string;
  photoType: string;
  latitude: number | null;
  longitude: number | null;
  capturedAt: Date;
  createdAt: Date;
};

type HandoverLike = {
  id: string;
  bookingId: string;
  tripId: string | null;
  type: HandoverType;
  performedBy: string;
  odometerReading: number | null;
  batteryLevel: number | null;
  fuelLevel: number | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  confirmedByOwner: boolean;
  confirmedByRenter: boolean;
  createdAt: Date;
  updatedAt: Date;
  photos?: PhotoLike[];
};

export class HandoverPhotoEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  handoverId: string;

  @ApiProperty()
  photoUrl: string;

  @ApiProperty()
  photoType: string;

  @ApiPropertyOptional()
  latitude: number | null;

  @ApiPropertyOptional()
  longitude: number | null;

  @ApiProperty()
  capturedAt: Date;

  @ApiProperty()
  createdAt: Date;

  constructor(partial: Partial<HandoverPhotoEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(photo: PhotoLike): HandoverPhotoEntity {
    return new HandoverPhotoEntity(photo);
  }
}

export class VehicleHandoverEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bookingId: string;

  @ApiPropertyOptional()
  tripId: string | null;

  @ApiProperty({ enum: HandoverType })
  type: HandoverType;

  @ApiProperty()
  performedBy: string;

  @ApiPropertyOptional()
  odometerReading: number | null;

  @ApiPropertyOptional()
  batteryLevel: number | null;

  @ApiPropertyOptional()
  latitude: number | null;

  @ApiPropertyOptional()
  longitude: number | null;

  @ApiPropertyOptional()
  notes: string | null;

  @ApiProperty()
  confirmedByOwner: boolean;

  @ApiProperty()
  confirmedByRenter: boolean;

  @ApiProperty()
  isComplete: boolean;

  @ApiProperty({ type: [HandoverPhotoEntity] })
  photos: HandoverPhotoEntity[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(partial: Partial<VehicleHandoverEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(handover: HandoverLike): VehicleHandoverEntity {
    const { fuelLevel: legacyFuelLevel, ...evHandover } = handover;
    // Keep historical storage readable without exposing gasoline data in the EV API.
    void legacyFuelLevel;
    return new VehicleHandoverEntity({
      ...evHandover,
      isComplete: handover.confirmedByOwner && handover.confirmedByRenter,
      photos: (handover.photos ?? []).map(HandoverPhotoEntity.fromPrisma),
    });
  }
}

export class HandoverDifferencesEntity {
  @ApiPropertyOptional({
    description: 'Check-out odometer minus check-in odometer',
  })
  kmDriven?: number;

  @ApiPropertyOptional({
    description: 'Check-out battery minus check-in battery',
  })
  batteryDelta?: number;
}

export class HandoverSummaryEntity {
  @ApiProperty()
  bookingId: string;

  @ApiPropertyOptional({ type: VehicleHandoverEntity })
  checkIn: VehicleHandoverEntity | null;

  @ApiPropertyOptional({ type: VehicleHandoverEntity })
  checkOut: VehicleHandoverEntity | null;

  @ApiProperty({ type: HandoverDifferencesEntity })
  differences: HandoverDifferencesEntity;
}
