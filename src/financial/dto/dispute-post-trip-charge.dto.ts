import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class DisputePostTripChargeDto {
  @ApiProperty({
    description: 'Renter explanation for disputing the post-trip charge',
    example: 'The scratch was already visible in check-in photos',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    description: 'Evidence URLs from handover photos or uploaded claim images',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  evidenceUrls?: string[];
}
