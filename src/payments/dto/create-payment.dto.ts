import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, IsEnum } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty({
    description: 'Booking ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  bookingId: string;

  @ApiProperty({
    description: 'Payment method',
    enum: PaymentMethod,
    example: PaymentMethod.VNPAY,
  })
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  method: PaymentMethod;
}
