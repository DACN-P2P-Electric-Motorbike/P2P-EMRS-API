import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CancelBookingDto {
  @ApiProperty({
    description: 'Reason for cancellation',
    example: 'Change of plans',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
