import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsBoolean,
} from 'class-validator';
import { ProtectionPlanType } from '@prisma/client';

export class CreateBookingDto {
  @ApiProperty({
    description: 'Vehicle ID to book',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({
    description: 'Booking start time (ISO 8601)',
    example: '2024-12-15T10:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    description: 'Booking end time (ISO 8601)',
    example: '2024-12-15T18:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  endTime: string;

  @ApiPropertyOptional({
    description: 'Additional notes for the owner',
    example: 'I need the bike for city tour',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    enum: ProtectionPlanType,
    description:
      'Internal protection tier selected by the renter. Defaults to STANDARD.',
    example: ProtectionPlanType.STANDARD,
  })
  @IsOptional()
  @IsEnum(ProtectionPlanType)
  protectionPlan?: ProtectionPlanType;

  @ApiPropertyOptional({
    description:
      'Purchase prepaid charging credit for battery-return shortfall handling.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  prepaidCharging?: boolean;
}
