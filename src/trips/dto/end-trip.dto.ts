import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';

export class EndTripDto {
  @ApiProperty({
    description: 'End location latitude',
    example: 10.772622,
  })
  @IsLatitude()
  endLatitude: number;

  @ApiProperty({
    description: 'End location longitude',
    example: 106.670172,
  })
  @IsLongitude()
  endLongitude: number;

  @ApiPropertyOptional({
    description: 'End location address',
    example: '456 Le Loi, District 1, Ho Chi Minh City',
  })
  @IsOptional()
  @IsString()
  endAddress?: string;

  @ApiProperty({
    description: 'Vehicle battery level at end (0-100%)',
    example: 65,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  endBattery: number;

  @ApiPropertyOptional({
    description: 'Whether there were any issues during the trip',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  hasIssues?: boolean;

  @ApiPropertyOptional({
    description: 'Description of any issues encountered',
  })
  @IsOptional()
  @IsString()
  issueDescription?: string;
}
