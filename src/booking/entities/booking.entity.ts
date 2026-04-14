import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Booking, BookingStatus, PaymentStatus } from '@prisma/client';
import { Expose } from 'class-transformer';

export class BookingEntity implements Booking {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  renterId: string;

  @ApiProperty()
  @Expose()
  ownerId: string;

  @ApiProperty()
  @Expose()
  vehicleId: string;

  @ApiProperty({ enum: BookingStatus })
  @Expose()
  status: BookingStatus;

  @ApiProperty()
  @Expose()
  startTime: Date;

  @ApiProperty()
  @Expose()
  endTime: Date;

  @ApiProperty()
  @Expose()
  totalPrice: number;

  @ApiProperty()
  @Expose()
  deposit: number;

  @ApiPropertyOptional()
  @Expose()
  notes: string | null;

  @ApiPropertyOptional()
  @Expose()
  cancellationReason: string | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  @ApiPropertyOptional()
  @Expose()
  confirmedAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  cancelledAt: Date | null;

  @ApiPropertyOptional({ enum: PaymentStatus, nullable: true })
  @Expose()
  paymentStatus: PaymentStatus | null;

  constructor(partial: Partial<BookingEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(
    booking: Booking & { payment?: { status: PaymentStatus } | null },
  ): BookingEntity {
    return new BookingEntity({
      ...booking,
      paymentStatus: booking.payment?.status ?? null,
    });
  }
}
