import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PayOS } from '@payos/node';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { PaymentEntity } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  OtpType,
  Payment,
  PaymentStatus,
  BookingStatus,
  Prisma,
} from '@prisma/client';
import {
  PaymentCompletedEvent,
  PaymentFailedEvent,
} from '../events/payment.events';
import { AuthService } from '../auth/auth.service';
import { CryptoService } from '../security/crypto.service';

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly PLATFORM_FEE_RATE = 0.15; // 15% platform fee
  private payos: PayOS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly authService: AuthService,
    private readonly cryptoService: CryptoService,
  ) {}

  private toPaymentEntity(payment: Payment): PaymentEntity {
    return PaymentEntity.fromPrisma({
      ...payment,
      gatewayResponse: this.cryptoService.tryDecryptJson(
        payment.gatewayResponse,
      ) as any,
    });
  }

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

    // If a completed/refunded payment already exists, reject
    if (booking.payment) {
      const finalStatuses: PaymentStatus[] = [
        PaymentStatus.COMPLETED,
        PaymentStatus.REFUNDED,
      ];
      if (finalStatuses.includes(booking.payment.status)) {
        throw new BadRequestException(
          'Payment already completed for this booking',
        );
      }
      // PENDING or FAILED — delete stale payment so a fresh one can be created
      await this.prisma.payment.delete({ where: { id: booking.payment.id } });
      this.logger.log(
        `Deleted stale ${booking.payment.status} payment ${booking.payment.id} for booking ${dto.bookingId}`,
      );
    }

    // Check booking status
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Can only pay for confirmed bookings');
    }

    // Renter pays rental plus deposit. Platform commission applies only to
    // rental revenue; deposit is a held/refundable amount.
    const totalAmount = booking.totalPrice + booking.deposit;
    const platformFee = booking.totalPrice * this.PLATFORM_FEE_RATE;
    const ownerAmount = booking.totalPrice - platformFee;

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

    return this.toPaymentEntity(payment);
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

    return this.toPaymentEntity(payment);
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

    return payment ? this.toPaymentEntity(payment) : null;
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

    this.eventEmitter.emit(
      'payment.completed',
      new PaymentCompletedEvent(
        updatedPayment.id,
        updatedPayment.bookingId,
        updatedPayment.payerId,
        updatedPayment.receiverId,
        updatedPayment.amount,
      ),
    );

    return this.toPaymentEntity(updatedPayment);
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
          const completed = await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.COMPLETED,
              paidAt: new Date(),
              gatewayResponse: this.cryptoService.encryptJson(
                structuredClone(body),
              ) as Prisma.InputJsonValue,
            },
          });
          this.logger.log(`PayOS payment ${payment.id} completed via webhook`);
          this.eventEmitter.emit(
            'payment.completed',
            new PaymentCompletedEvent(
              completed.id,
              completed.bookingId,
              completed.payerId,
              completed.receiverId,
              completed.amount,
            ),
          );
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
  async handlePayOSReturn(
    query: Record<string, string>,
  ): Promise<{ status: string; bookingId?: string }> {
    const orderCode = query.orderCode;
    const status = query.status;

    if (!orderCode) return { status: 'missing_order_code' };

    if (status === 'PAID') {
      const payment = await this.prisma.payment.findFirst({
        where: {
          transactionId: orderCode,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
      });

      if (payment) {
        const completed = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            paidAt: new Date(),
          },
        });
        this.logger.log(`PayOS payment ${payment.id} completed via return URL`);
        this.eventEmitter.emit(
          'payment.completed',
          new PaymentCompletedEvent(
            completed.id,
            completed.bookingId,
            completed.payerId,
            completed.receiverId,
            completed.amount,
          ),
        );
        return { status: 'success', bookingId: payment.bookingId };
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
        return { status: 'cancelled', bookingId: payment.bookingId };
      }
    }

    return { status: status ?? 'unknown' };
  }

  /**
   * Refund a completed payment
   */
  async refundPayment(
    paymentId: string,
    userId: string,
    otp: string,
  ): Promise<PaymentEntity> {
    if (!otp) {
      throw new BadRequestException('OTP is required to refund a payment');
    }

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

    await this.authService.verifySensitiveActionOtp(
      userId,
      otp,
      OtpType.FINANCIAL_TRANSACTION,
    );

    const updatedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.REFUNDED,
        gatewayResponse: this.cryptoService.encryptJson({
          refundedAt: new Date().toISOString(),
          refundedBy: userId,
        }) as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Payment ${paymentId} refunded`);
    return this.toPaymentEntity(updatedPayment);
  }

  /**
   * Get owner earnings summary — aggregates all COMPLETED payments
   * where receiverId matches the owner.
   */
  async getOwnerEarnings(ownerId: string): Promise<{
    totalEarned: number;
    totalPlatformFee: number;
    netEarnings: number;
    completedBookings: number;
    bookings: Array<{
      bookingId: string;
      amount: number;
      platformFee: number;
      ownerAmount: number;
      method: string;
      paidAt: Date;
      vehicleName?: string;
    }>;
  }> {
    const payments = await this.prisma.payment.findMany({
      where: {
        receiverId: ownerId,
        status: PaymentStatus.COMPLETED,
      },
      include: {
        booking: {
          include: {
            vehicle: {
              select: { brand: true, model: true },
            },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
    });

    const totalEarned = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalPlatformFee = payments.reduce(
      (sum, p) => sum + p.platformFee,
      0,
    );
    const netEarnings = payments.reduce((sum, p) => sum + p.ownerAmount, 0);

    return {
      totalEarned,
      totalPlatformFee,
      netEarnings,
      completedBookings: payments.length,
      bookings: payments.map((p) => ({
        bookingId: p.bookingId,
        amount: p.amount,
        platformFee: p.platformFee,
        ownerAmount: p.ownerAmount,
        method: p.method,
        paidAt: p.paidAt ?? p.updatedAt,
        vehicleName: p.booking?.vehicle
          ? `${p.booking.vehicle.brand} ${p.booking.vehicle.model}`
          : undefined,
      })),
    };
  }
}
