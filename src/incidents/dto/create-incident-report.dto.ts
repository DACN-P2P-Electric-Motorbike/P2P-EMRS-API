import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentCategory, IncidentSeverity } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class IncidentEvidenceUploadDto {
  @ApiProperty({
    description: 'Uploaded incident evidence URL returned by the upload API',
  })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiProperty({
    description: 'Signed upload receipt returned with the incident image URL',
  })
  @IsString()
  @IsNotEmpty()
  receipt: string;
}

export class CreateIncidentReportDto {
  @ApiProperty({
    description: 'Booking UUID associated with the incident',
  })
  @IsString()
  @IsNotEmpty()
  bookingId: string;

  @ApiPropertyOptional({
    description: 'Trip UUID when the incident happened during a trip',
  })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({
    description: 'Optional post-trip charge UUID when disputing a specific fee',
  })
  @IsOptional()
  @IsString()
  postTripChargeId?: string;

  @ApiProperty({
    enum: IncidentCategory,
    description: 'Structured incident category used for evidence policy',
  })
  @IsEnum(IncidentCategory)
  category: IncidentCategory;

  @ApiPropertyOptional({
    enum: IncidentSeverity,
    default: IncidentSeverity.MEDIUM,
  })
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @ApiProperty({
    description: 'Participant report shown to admins and both booking parties',
    example: 'The rear panel was scratched before checkout sign-off.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;

  @ApiPropertyOptional({
    description: 'Uploaded claim/incident evidence URLs',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  evidenceUrls?: string[];

  @ApiPropertyOptional({
    description: 'Incident images with API-issued signed upload receipts',
    type: [IncidentEvidenceUploadDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => IncidentEvidenceUploadDto)
  evidenceUploads?: IncidentEvidenceUploadDto[];

  @ApiPropertyOptional({
    description: 'Existing handover photo IDs to attach as evidence',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  handoverPhotoIds?: string[];
}
