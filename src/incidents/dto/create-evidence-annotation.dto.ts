import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceAnnotationTargetType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEvidenceAnnotationDto {
  @ApiProperty({
    enum: EvidenceAnnotationTargetType,
    description: 'Evidence object being annotated for the claim review.',
  })
  @IsEnum(EvidenceAnnotationTargetType)
  targetType: EvidenceAnnotationTargetType;

  @ApiProperty({
    description:
      'UUID of the incident report, post-trip charge, handover, or handover photo.',
  })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @ApiPropertyOptional({
    description: 'Optional durable claim case UUID this annotation belongs to.',
  })
  @IsOptional()
  @IsString()
  claimCaseId?: string;

  @ApiProperty({
    description: 'Admin review note tied to the selected evidence target.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note: string;

  @ApiPropertyOptional({
    description: 'Short tags such as mismatch, damage, unclear-photo.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description:
      'Optional structured highlight data, for example image region coordinates.',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  highlight?: Record<string, unknown>;
}
