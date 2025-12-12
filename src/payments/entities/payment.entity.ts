// ==========================================
// src/payments/entities/payment.entity.ts
// ==========================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Payment, PaymentStatus, PaymentMethod } from '@prisma/client';
import { Expose } from 'class-transformer';

export class PaymentEntity implements Payment {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiProperty()
  @Expose()
  payerId: string;

  @ApiProperty()
  @Expose()
  receiverId: string;

  @ApiProperty()
  @Expose()
  amount: number;

  @ApiProperty()
  @Expose()
  platformFee: number;

  @ApiProperty()
  @Expose()
  ownerAmount: number;

  @ApiProperty({ enum: PaymentMethod })
  @Expose()
  method: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  @Expose()
  status: PaymentStatus;

  @ApiPropertyOptional()
  @Expose()
  transactionId: string | null;

  @ApiPropertyOptional()
  @Expose()
  gatewayResponse: any;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  @ApiPropertyOptional()
  @Expose()
  paidAt: Date | null;

  constructor(partial: Partial<PaymentEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(payment: Payment): PaymentEntity {
    return new PaymentEntity(payment);
  }
}
