import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PaymentEntity } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentStatus, BookingStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly PLATFORM_FEE_RATE = 0.15; // 15% platform fee

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create payment for booking
   */
  async createPayment(
    userId: string,
    dto: CreatePaymentDto,
  ): Promise<PaymentEntity> {
    this.logger.log(
      `User ${userId} creating payment for booking ${dto.bookingId}`,
    );

    // Get booking details
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: {
        payment: true,
        vehicle: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Verify user is the renter
    if (booking.renterId !== userId) {
      throw new BadRequestException('You can only pay for your own bookings');
    }

    // Check if payment already exists
    if (booking.payment) {
      throw new BadRequestException('Payment already exists for this booking');
    }

    // Check booking status
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Can only pay for confirmed bookings');
    }

    // Calculate fees
    const totalAmount = booking.totalPrice + booking.deposit;
    const platformFee = totalAmount * this.PLATFORM_FEE_RATE;
    const ownerAmount = totalAmount - platformFee;

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        bookingId: dto.bookingId,
        payerId: userId,
        receiverId: booking.ownerId,
        amount: totalAmount,
        platformFee,
        ownerAmount,
        method: dto.method,
        status: PaymentStatus.PENDING,
      },
    });

    this.logger.log(
      `Payment ${payment.id} created. Amount: ${totalAmount} VND`,
    );

    // TODO: Initiate payment with gateway (VNPay/MoMo)
    // For now, we'll simulate success
    // In production, this would redirect to payment gateway

    return PaymentEntity.fromPrisma(payment);
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(
    paymentId: string,
    userId: string,
  ): Promise<PaymentEntity> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: {
          include: {
            vehicle: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Verify access
    if (payment.payerId !== userId && payment.receiverId !== userId) {
      throw new NotFoundException('Payment not found');
    }

    return PaymentEntity.fromPrisma(payment);
  }

  /**
   * Get payment by booking ID
   */
  async getPaymentByBookingId(
    bookingId: string,
    userId: string,
  ): Promise<PaymentEntity | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Verify access
    if (booking.renterId !== userId && booking.ownerId !== userId) {
      throw new NotFoundException('Booking not found');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { bookingId },
    });

    return payment ? PaymentEntity.fromPrisma(payment) : null;
  }

  /**
   * Simulate payment success (for development)
   */
  async simulatePaymentSuccess(paymentId: string): Promise<PaymentEntity> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const updatedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.COMPLETED,
        paidAt: new Date(),
        transactionId: `SIM_${Date.now()}`,
      },
    });

    this.logger.log(`Payment ${paymentId} completed (simulated)`);

    // TODO: Send notification about successful payment

    return PaymentEntity.fromPrisma(updatedPayment);
  }
}
