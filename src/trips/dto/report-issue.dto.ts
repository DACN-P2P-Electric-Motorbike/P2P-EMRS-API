import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentCategory, IncidentSeverity } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class ReportIssueDto {
  @ApiPropertyOptional({
    enum: IncidentCategory,
    default: IncidentCategory.MECHANICAL_ISSUE,
    description: 'Structured category for the generated incident report',
  })
  @IsOptional()
  @IsEnum(IncidentCategory)
  category?: IncidentCategory;

  @ApiPropertyOptional({
    enum: IncidentSeverity,
    default: IncidentSeverity.MEDIUM,
  })
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @ApiProperty({
    description: 'Issue description',
    example: 'Vehicle has a flat tire',
  })
  @IsString()
  @IsNotEmpty()
  issueDescription: string;

  @ApiPropertyOptional({
    description:
      'Optional uploaded evidence URLs; required by the incident policy for damage, accident, theft, vehicle mismatch, and critical reports',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  evidenceUrls?: string[];
}
