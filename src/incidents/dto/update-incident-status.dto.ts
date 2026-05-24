import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

const ADMIN_INCIDENT_STATUSES = [
  IncidentStatus.UNDER_REVIEW,
  IncidentStatus.RESOLVED,
  IncidentStatus.REJECTED,
] as const;

export class UpdateIncidentStatusDto {
  @ApiProperty({
    enum: ADMIN_INCIDENT_STATUSES,
    description: 'Admin review state for the incident report',
  })
  @IsEnum(IncidentStatus)
  status: (typeof ADMIN_INCIDENT_STATUSES)[number];

  @ApiPropertyOptional({
    description: 'Admin-facing resolution or investigation note',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;
}
