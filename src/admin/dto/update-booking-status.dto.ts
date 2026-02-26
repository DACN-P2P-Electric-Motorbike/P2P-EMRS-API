import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateBookingStatusDto {
  @ApiProperty({
    enum: BookingStatus,
    description: 'New booking status (admin override)',
    example: 'CANCELLED',
  })
  @IsNotEmpty()
  @IsEnum(BookingStatus, {
    message: `status must be one of: ${Object.values(BookingStatus).join(', ')}`,
  })
  status: BookingStatus;
}
