import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ApproveBookingDto {
  @ApiPropertyOptional({
    description: 'Optional message for the renter',
    example: 'Looking forward to renting to you!',
  })
  @IsOptional()
  @IsString()
  message?: string;
}

export class RejectBookingDto {
  @ApiProperty({
    description: 'Reason for rejection',
    example: 'Vehicle not available at that time',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}