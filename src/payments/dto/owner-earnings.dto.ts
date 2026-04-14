import { ApiProperty } from '@nestjs/swagger';

export class EarningsBookingItemDto {
  @ApiProperty()
  bookingId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  platformFee: number;

  @ApiProperty()
  ownerAmount: number;

  @ApiProperty()
  method: string;

  @ApiProperty()
  paidAt: Date;

  @ApiProperty({ required: false })
  vehicleName?: string;
}

export class OwnerEarningsDto {
  @ApiProperty({ description: 'Total gross amount received' })
  totalEarned: number;

  @ApiProperty({ description: 'Total platform fees deducted' })
  totalPlatformFee: number;

  @ApiProperty({ description: 'Net earnings (after platform fee)' })
  netEarnings: number;

  @ApiProperty({ description: 'Number of completed paid bookings' })
  completedBookings: number;

  @ApiProperty({ type: [EarningsBookingItemDto] })
  bookings: EarningsBookingItemDto[];
}
