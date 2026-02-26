import { ApiProperty } from '@nestjs/swagger';
import { VehicleStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateVehicleStatusDto {
  @ApiProperty({
    enum: VehicleStatus,
    description: 'New vehicle status',
    example: 'AVAILABLE',
  })
  @IsNotEmpty()
  @IsEnum(VehicleStatus, {
    message: `status must be one of: ${Object.values(VehicleStatus).join(', ')}`,
  })
  status: VehicleStatus;
}
