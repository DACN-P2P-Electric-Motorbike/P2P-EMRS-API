import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PayOS } from '@payos/node';
import { PrismaService } from '../database/prisma.service';
import { PaymentEntity } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentStatus, BookingStatus } from '@prisma/client';

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly PLATFORM_FEE_RATE = 0.15; // 15% platform fee
  private payos: PayOS;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.payos = new PayOS({
      clientId: process.env.PAYOS_CLIENT_ID ?? '',
      apiKey: process.env.PAYOS_API_KEY ?? '',
      checksumKey: process.env.PAYOS_CHECKSUM_KEY ?? '',
    });
    this.logger.log('PayOS SDK initialized');
  }

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

    return PaymentEntity.fromPrisma(updatedPayment);
  }

  /**
   * Initiate PayOS payment — creates a payment link via PayOS SDK
   */
  async initiatePayOSPayment(
    paymentId: string,
    userId: string,
  ): Promise<{ checkoutUrl: string; qrCode: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.payerId !== userId)
      throw new BadRequestException('Access denied');
    if (payment.status !== PaymentStatus.PENDING)
      throw new BadRequestException('Payment already processed');

    const returnUrl =
      process.env.PAYOS_RETURN_URL ||
      'http://localhost:3000/payments/payos-return';
    const cancelUrl =
      process.env.PAYOS_CANCEL_URL ||
      'http://localhost:3000/payments/payos-cancel';

    // PayOS orderCode must be a positive integer; derive from timestamp
    const orderCode = Number(`${Date.now()}`.slice(-8));
    const amount = Math.round(payment.amount);
    const description = `DreamRide #${payment.bookingId.slice(0, 8)}`;

    try {
      const paymentLink = await this.payos.paymentRequests.create({
        orderCode,
        amount,
        description,
        cancelUrl,
        returnUrl,
        items: [
          {
            name: `Booking ${payment.bookingId.slice(0, 8)}`,
            quantity: 1,
            price: amount,
          },
        ],
      });

      // Store the orderCode so we can match it in the webhook
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          transactionId: String(orderCode),
          status: PaymentStatus.PROCESSING,
        },
      });

      const result = paymentLink as Record<string, unknown>;
      const checkoutUrl = (result.checkoutUrl as string) ?? '';
      const qrCode = (result.qrCode as string) ?? '';

      this.logger.log(
        `PayOS checkout URL generated for payment ${paymentId}: ${checkoutUrl}`,
      );

      return { checkoutUrl, qrCode };
    } catch (err) {
      this.logger.error(`PayOS API call failed: ${(err as Error).message}`);
      throw new BadRequestException(
        `Failed to create PayOS payment link: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Initiate MoMo sandbox payment — calls MoMo API and returns payUrl + deeplink
   */
  async initiateMoMoPayment(
    paymentId: string,
    userId: string,
  ): Promise<{ paymentUrl: string; deeplink: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.payerId !== userId)
      throw new BadRequestException('Access denied');
    if (payment.status !== PaymentStatus.PENDING)
      throw new BadRequestException('Payment already processed');

    const accessKey = process.env.MOMO_ACCESS_KEY || 'F8BBA842ECF85';
    const secretKey =
      process.env.MOMO_SECRET_KEY || 'K951B6PE1waDMi640xX08PD3vg6EkVlz';
    const partnerCode = process.env.MOMO_PARTNER_CODE || 'MOMO';
    const redirectUrl =
      process.env.MOMO_REDIRECT_URL ||
      'https://webhook.site/b3088a6a-2d17-4f8d-a383-71389a6c600b';
    const ipnUrl =
      process.env.MOMO_IPN_URL ||
      'https://webhook.site/b3088a6a-2d17-4f8d-a383-71389a6c600b';

    const orderId = `${partnerCode}${Date.now()}`;
    const requestId = orderId;
    const amount = String(Math.round(payment.amount));
    const orderInfo = `Thanh toan booking #${payment.bookingId.slice(0, 8)}`;
    const requestType = 'payWithMethod';
    const extraData = '';
    const orderGroupId = '';
    const autoCapture = true;
    const lang = 'vi';

    const rawSignature =
      `accessKey=${accessKey}` +
      `&amount=${amount}` +
      `&extraData=${extraData}` +
      `&ipnUrl=${ipnUrl}` +
      `&orderId=${orderId}` +
      `&orderInfo=${orderInfo}` +
      `&partnerCode=${partnerCode}` +
      `&redirectUrl=${redirectUrl}` +
      `&requestId=${requestId}` +
      `&requestType=${requestType}`;

    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(rawSignature)
      .digest('hex');

    const requestBody = JSON.stringify({
      partnerCode,
      partnerName: 'P2P EMRS',
      storeId: partnerCode,
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl,
      ipnUrl,
      lang,
      requestType,
      autoCapture,
      extraData,
      orderGroupId,
      signature,
    });

    try {
      const response = await fetch(
        'https://test-payment.momo.vn/v2/gateway/api/create',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        },
      );

      const data = (await response.json()) as {
        resultCode: number;
        message: string;
        payUrl?: string;
        deeplink?: string;
      };

      if (data.resultCode !== 0) {
        throw new BadRequestException(
          `MoMo error (${data.resultCode}): ${data.message}`,
        );
      }

      this.logger.log(`MoMo payment URL generated for payment ${paymentId}`);
      return {
        paymentUrl: data.payUrl ?? '',
        deeplink: data.deeplink ?? '',
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`MoMo API call failed: ${(err as Error).message}`);
      throw new BadRequestException(
        `Failed to connect to MoMo: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Handle PayOS webhook callback — verifies signature and updates payment status
   */
  async handlePayOSWebhook(body: Record<string, unknown>): Promise<void> {
    try {
      const webhookData = await this.payos.webhooks.verify(
        body as Parameters<typeof this.payos.webhooks.verify>[0],
      );

      const { orderCode, code } = webhookData;

      this.logger.log(
        `PayOS webhook received: orderCode=${orderCode}, code=${code}`,
      );

      if (String(code) === '00') {
        const payment = await this.prisma.payment.findFirst({
          where: {
            transactionId: String(orderCode),
            status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
          },
        });

        if (payment) {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.COMPLETED,
              paidAt: new Date(),
              gatewayResponse: structuredClone(body) as any,
            },
          });
          this.logger.log(`PayOS payment ${payment.id} completed via webhook`);
        }
      }
    } catch (err) {
      this.logger.error(
        `PayOS webhook verification failed: ${(err as Error).message}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  /**
   * Handle PayOS return URL — check payment status via the return query params
   */
  async handlePayOSReturn(query: Record<string, string>): Promise<string> {
    const orderCode = query.orderCode;
    const status = query.status;

    if (!orderCode) return 'missing_order_code';

    if (status === 'PAID') {
      const payment = await this.prisma.payment.findFirst({
        where: {
          transactionId: orderCode,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
      });

      if (payment) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            paidAt: new Date(),
          },
        });
        this.logger.log(`PayOS payment ${payment.id} completed via return URL`);
        return 'success';
      }
    } else if (status === 'CANCELLED') {
      const payment = await this.prisma.payment.findFirst({
        where: {
          transactionId: orderCode,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
      });

      if (payment) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.PENDING },
        });
        this.logger.log(
          `PayOS payment ${payment.id} cancelled, reset to pending`,
        );
        return 'cancelled';
      }
    }

    return status ?? 'unknown';
  }

  /**
   * Refund a completed payment
   */
  async refundPayment(
    paymentId: string,
    userId: string,
  ): Promise<PaymentEntity> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: true },
    });

    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.payerId !== userId && payment.receiverId !== userId) {
      throw new BadRequestException('Access denied');
    }

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Only completed payments can be refunded');
    }

    const updatedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.REFUNDED,
        gatewayResponse: {
          refundedAt: new Date().toISOString(),
          refundedBy: userId,
        },
      },
    });

    this.logger.log(`Payment ${paymentId} refunded`);
    return PaymentEntity.fromPrisma(updatedPayment);
  }
}
