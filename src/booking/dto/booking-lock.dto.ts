import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, IsDateString } from 'class-validator';

export class CreateBookingLockDto {
  @ApiProperty({
    description: 'Vehicle ID to lock',
    example: 'uuid-string',
  })
  @IsUUID()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({
    description: 'Desired start time (ISO 8601)',
    example: '2026-06-01T09:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    description: 'Desired end time (ISO 8601)',
    example: '2026-06-01T17:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  endTime: string;
}
