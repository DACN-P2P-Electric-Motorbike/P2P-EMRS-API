import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IncidentCategory,
  IncidentReport,
  IncidentSeverity,
  IncidentStatus,
} from '@prisma/client';

type UserSummary = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  trustScore?: number;
};

type BookingSummary = {
  id: string;
  status: string;
  renterId: string;
  ownerId: string;
  vehicleId: string;
  startTime: Date;
  endTime: Date;
  renter?: UserSummary;
  owner?: UserSummary;
  vehicle?: {
    id: string;
    brand: string;
    model: string;
    licensePlate: string;
    images?: string[];
  };
};

type IncidentReportLike = IncidentReport & {
  reporter?: UserSummary;
  reviewer?: UserSummary | null;
  booking?: BookingSummary;
  trip?: {
    id: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
  } | null;
  postTripCharge?: {
    id: string;
    type: string;
    status: string;
    amount: number;
    description: string;
  } | null;
};

export class IncidentReportEntity implements IncidentReport {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bookingId: string;

  @ApiPropertyOptional()
  tripId: string | null;

  @ApiPropertyOptional()
  postTripChargeId: string | null;

  @ApiProperty()
  reporterId: string;

  @ApiProperty({ enum: IncidentCategory })
  category: IncidentCategory;

  @ApiProperty({ enum: IncidentSeverity })
  severity: IncidentSeverity;

  @ApiProperty({ enum: IncidentStatus })
  status: IncidentStatus;

  @ApiProperty()
  description: string;

  @ApiPropertyOptional()
  evidence: any;

  @ApiPropertyOptional()
  requiredEvidence: any;

  @ApiPropertyOptional()
  adminNotes: string | null;

  @ApiPropertyOptional()
  reviewedBy: string | null;

  @ApiPropertyOptional()
  reviewedAt: Date | null;

  @ApiPropertyOptional()
  resolvedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  reporter?: UserSummary;

  @ApiPropertyOptional()
  reviewer?: UserSummary | null;

  @ApiPropertyOptional()
  booking?: BookingSummary;

  @ApiPropertyOptional()
  trip?: IncidentReportLike['trip'];

  @ApiPropertyOptional()
  postTripCharge?: IncidentReportLike['postTripCharge'];

  constructor(partial: Partial<IncidentReportEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(report: IncidentReportLike): IncidentReportEntity {
    return new IncidentReportEntity(report);
  }
}
