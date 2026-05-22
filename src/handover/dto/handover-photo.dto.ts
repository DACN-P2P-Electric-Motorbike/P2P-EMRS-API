import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

export class HandoverPhotoDto {
  @ApiProperty({
    description: 'Uploaded handover photo URL',
    example: 'https://cdn.example.com/handovers/front.jpg',
  })
  @IsUrl({ require_tld: false })
  photoUrl: string;

  @ApiProperty({
    description: 'Photo angle/type',
    example: 'front',
  })
  @IsString()
  photoType: string;

  @ApiPropertyOptional({ description: 'Photo GPS latitude', example: 10.7769 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Photo GPS longitude',
    example: 106.7009,
  })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Client capture timestamp',
    example: '2026-05-22T09:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  capturedAt?: string;
}
