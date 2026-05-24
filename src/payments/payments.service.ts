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
  PaymentMethod,
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
  // PayOS rejects orderCode that fits in 32-bit int with too few digits;
  // documented constraint is 1..9_007_199_254_740_991 (Number.MAX_SAFE_INTEGER).
  // We use the full ms timestamp (13 digits) plus a 6-digit random suffix to
  // keep collisions effectively zero across retries for the same booking.
  private readonly PAYOS_MIN_AMOUNT = 1000; // VND minimum per PayOS docs
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
    const missingConfig = this.getMissingPayOSConfig();
    if (missingConfig.length > 0) {
      this.logger.warn(
        `PayOS is not fully configured. Missing: ${missingConfig.join(', ')}`,
      );
    }
    this.payos = new PayOS({
      clientId: process.env.PAYOS_CLIENT_ID ?? '',
      apiKey: process.env.PAYOS_API_KEY ?? '',
      checksumKey: process.env.PAYOS_CHECKSUM_KEY ?? '',
    });
    this.logger.log('PayOS SDK initialized');
  }

  private getMissingPayOSConfig(): string[] {
    return ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY'].filter(
      (key) => !process.env[key]?.trim(),
    );
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

    // Keep payment creation idempotent for retry/resume flows, but let the
    // renter switch gateway before the payment reaches a final state.
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
      const mutableStatuses: PaymentStatus[] = [
        PaymentStatus.PENDING,
        PaymentStatus.PROCESSING,
        PaymentStatus.FAILED,
      ];
      const canChangeMethod = mutableStatuses.includes(booking.payment.status);
      const shouldResetPayment =
        booking.payment.status === PaymentStatus.FAILED ||
        (canChangeMethod && booking.payment.method !== dto.method);
      if (shouldResetPayment) {
        if (
          booking.payment.status === PaymentStatus.PROCESSING &&
          booking.payment.method === PaymentMethod.PAYOS &&
          booking.payment.transactionId
        ) {
          const reconciled = await this.tryReconcilePayOSStatus(
            booking.payment.id,
            booking.payment.transactionId,
          );
          if (reconciled === 'completed') {
            // PayOS already reports this order as PAID. Don't switch — the
            // user already paid; surface the freshly reconciled payment.
            const updated = await this.prisma.payment.findUnique({
              where: { id: booking.payment.id },
            });
            if (updated) return this.toPaymentEntity(updated);
            throw new BadRequestException(
              'Payment already completed for this booking',
            );
          }

          if (reconciled === 'pending') {
            // Link is still live on PayOS — try to cancel it to free the
            // payment for a method switch.
            try {
              await this.payos.paymentRequests.cancel(
                Number(booking.payment.transactionId),
                'User changed payment method',
              );
            } catch (err) {
              this.logger.error(
                `Failed to cancel PayOS payment link ${booking.payment.transactionId}: ${(err as Error).message}`,
              );
              throw new BadRequestException(
                'Cannot change payment method while the PayOS link is active. Please cancel the PayOS checkout or try again later.',
              );
            }
          }
          // reconciled === 'cancelled' | 'expired' | 'unknown' → safe to reset
        }

        const updatedPayment = await this.prisma.payment.update({
          where: { id: booking.payment.id },
          data: {
            method: dto.method,
            status: PaymentStatus.PENDING,
            transactionId: null,
            gatewayResponse: Prisma.JsonNull,
            paidAt: null,
          },
        });
        this.logger.log(
          `Reset payment ${booking.payment.id} with method ${dto.method} for booking ${dto.bookingId}`,
        );
        return this.toPaymentEntity(updatedPayment);
      }
      if (canChangeMethod) {
        this.logger.log(
          `Reusing ${booking.payment.status} payment ${booking.payment.id} for booking ${dto.bookingId}`,
        );
        return this.toPaymentEntity(booking.payment);
      }

      // Unknown non-final state — delete stale payment so a fresh one can be created.
      await this.prisma.payment.delete({ where: { id: booking.payment.id } });
      this.logger.log(
        `Deleted stale ${booking.payment.status} payment ${booking.payment.id} for booking ${dto.bookingId}`,
      );
    }

    // Check booking status
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Can only pay for confirmed bookings');
    }

    // Renter pays rental plus selected protection fee plus deposit.
    // Platform commission applies only to rental revenue; deposit is a
    // held/refundable amount and protection is tracked on the booking.
    const protectionFee = booking.protectionFee ?? 0;
    const totalAmount = booking.totalPrice + protectionFee + booking.deposit;
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
   * Simulate payment success (used for CASH / CREDIT_CARD sandbox flows and
   * for local dev). Verifies the caller is the renter and that the payment
   * is in a state where it can transition to COMPLETED.
   */
  async simulatePaymentSuccess(
    paymentId: string,
    userId?: string,
  ): Promise<PaymentEntity> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (userId && payment.payerId !== userId) {
      throw new BadRequestException('Access denied');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      // Idempotent — return the already-completed record so the FE flow
      // still resolves to the success screen.
      return this.toPaymentEntity(payment);
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException(
        'Refunded payments cannot be marked as completed',
      );
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

    const missingConfig = this.getMissingPayOSConfig();
    if (missingConfig.length > 0) {
      const message = `PayOS is not configured. Missing ${missingConfig.join(', ')}`;
      this.logger.error(message);
      throw new BadRequestException(message);
    }

    const returnUrl =
      process.env.PAYOS_RETURN_URL ||
      'http://localhost:3000/payments/payos-return';
    const cancelUrl =
      process.env.PAYOS_CANCEL_URL ||
      'http://localhost:3000/payments/payos-cancel';

    // PayOS will redirect users to these URLs after checkout. If the API is
    // running in production but PAYOS_RETURN_URL/PAYOS_CANCEL_URL are missing,
    // PayOS would send users to localhost which is broken. Fail loudly.
    if (process.env.NODE_ENV === 'production') {
      for (const [name, url] of [
        ['PAYOS_RETURN_URL', returnUrl],
        ['PAYOS_CANCEL_URL', cancelUrl],
      ] as const) {
        if (
          !url.startsWith('https://') ||
          url.includes('localhost') ||
          url.includes('127.0.0.1')
        ) {
          const message = `${name} must be a public HTTPS URL in production (got "${url}")`;
          this.logger.error(message);
          throw new BadRequestException(message);
        }
      }
    }

    // Validate PayOS amount constraints up-front to avoid an opaque gateway
    // error. PayOS requires a positive integer >= 1000 VND.
    const amount = Math.round(payment.amount);
    if (!Number.isFinite(amount) || amount < this.PAYOS_MIN_AMOUNT) {
      throw new BadRequestException(
        `PayOS amount must be a whole number >= ${this.PAYOS_MIN_AMOUNT} VND (got ${payment.amount})`,
      );
    }

    // PayOS orderCode must be a positive integer and unique per booking
    // attempt. `Date.now()` gives 13 digits; we add a small random suffix so
    // that retries within the same millisecond still produce a fresh code.
    // Result fits well within Number.MAX_SAFE_INTEGER.
    const orderCode = Number(
      `${Date.now()}${Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, '0')}`,
    );

    // PayOS limits description to 9 characters for non-linked bank accounts.
    // Keep it short to avoid gateway rejection.
    const description = `DRM${payment.bookingId.slice(0, 5).toUpperCase()}`;

    // Set link expiration to 30 minutes from now (Unix timestamp in seconds).
    // This prevents stale links from lingering on PayOS indefinitely.
    const expiredAt = Math.floor(Date.now() / 1000) + 30 * 60;

    try {
      const paymentLink = await this.payos.paymentRequests.create({
        orderCode,
        amount,
        description,
        cancelUrl,
        returnUrl,
        expiredAt,
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

      if (!checkoutUrl) {
        // PayOS returned 200 but no checkoutUrl — treat as failure so the
        // renter can pick another method instead of staring at a blank screen.
        const failureMetadata = this.cryptoService.encryptJson({
          gateway: 'payos',
          stage: 'initiate',
          error: 'PayOS returned empty checkoutUrl',
          response: result,
          failedAt: new Date().toISOString(),
        });
        await this.prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.FAILED,
            ...(failureMetadata ? { gatewayResponse: failureMetadata } : {}),
          },
        });
        throw new BadRequestException(
          'PayOS did not return a checkout URL. Please try another method or retry.',
        );
      }

      this.logger.log(
        `PayOS checkout URL generated for payment ${paymentId}: ${checkoutUrl}`,
      );

      return { checkoutUrl, qrCode };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const errorMessage = (err as Error).message;
      this.logger.error(`PayOS API call failed: ${errorMessage}`);
      const failureMetadata = this.cryptoService.encryptJson({
        gateway: 'payos',
        stage: 'initiate',
        error: errorMessage,
        failedAt: new Date().toISOString(),
      });
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.FAILED,
          ...(failureMetadata ? { gatewayResponse: failureMetadata } : {}),
        },
      });
      const isSignatureError = errorMessage
        .toLowerCase()
        .includes('payment signature');
      throw new BadRequestException(
        isSignatureError
          ? 'PayOS configuration is invalid. Please verify PAYOS_CHECKSUM_KEY in the API runtime.'
          : `Failed to create PayOS payment link: ${errorMessage}`,
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
    // Default redirectUrl back to *our* API so the in-app WebView (and the
    // web popup) can recognize the gateway's redirect and pop / message
    // back to the FE. webhook.site is still acceptable for IPN (server →
    // server) but useless for the user-facing redirect.
    const apiBaseUrl = process.env.API_PUBLIC_URL || 'http://localhost:3000';
    const redirectUrl =
      process.env.MOMO_REDIRECT_URL || `${apiBaseUrl}/payments/momo-return`;
    const ipnUrl =
      process.env.MOMO_IPN_URL ||
      'https://webhook.site/b3088a6a-2d17-4f8d-a383-71389a6c600b';

    // Persist orderId so handleMomoReturn can match the gateway redirect to
    // this payment row even before the IPN arrives. Without this, the
    // return page has nothing to look up.
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

      // Persist orderId + transition to PROCESSING so the return / IPN can
      // match the gateway redirect back to this Payment row. Mirrors the
      // PayOS flow above.
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          transactionId: orderId,
          status: PaymentStatus.PROCESSING,
        },
      });

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
   * Handle MoMo redirect (user-facing) — best-effort match by `orderId`.
   *
   * Security: this endpoint is **not** authoritative because the redirect
   * happens client-side and is trivially forgeable. The actual
   * `COMPLETED` transition still requires the IPN webhook (which carries a
   * signed payload). This handler only:
   *   - returns success metadata to the in-app WebView so it can pop;
   *   - on `resultCode == 0`, optimistically marks the matching PROCESSING
   *     payment as COMPLETED **iff** signature verification of the redirect
   *     query passes (MoMo signs the redirect with the same HMAC scheme as
   *     IPN, so we can verify it here).
   */
  async handleMoMoReturn(
    query: Record<string, string>,
  ): Promise<{ status: string; bookingId?: string }> {
    const orderId = query.orderId;
    const resultCode = query.resultCode;

    if (!orderId) return { status: 'missing_order_id' };

    const payment = await this.prisma.payment.findFirst({
      where: { transactionId: orderId },
    });

    if (!payment) return { status: 'unknown' };

    const success = resultCode === '0';
    const cancelled =
      resultCode === '1006' ||
      (resultCode != null && resultCode !== '0' && resultCode !== '');

    // Verify the redirect signature so we don't trust client-side query
    // tampering. MoMo signs the redirect with HMAC-SHA256 over a fixed
    // alphabetical key list — see https://developers.momo.vn for the spec.
    const isSignatureValid = this._verifyMomoRedirectSignature(query);

    if (
      success &&
      isSignatureValid &&
      payment.status !== PaymentStatus.COMPLETED
    ) {
      const successMetadata = this.cryptoService.encryptJson({
        gateway: 'momo',
        stage: 'return',
        query,
        completedAt: new Date().toISOString(),
      });
      const completed = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.COMPLETED,
          paidAt: new Date(),
          ...(successMetadata
            ? { gatewayResponse: successMetadata as Prisma.InputJsonValue }
            : {}),
        },
      });
      this.logger.log(`MoMo payment ${payment.id} completed via return URL`);
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

    if (cancelled && payment.status === PaymentStatus.PROCESSING) {
      const cancelMetadata = this.cryptoService.encryptJson({
        gateway: 'momo',
        stage: 'return',
        query,
        cancelledAt: new Date().toISOString(),
      });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PENDING,
          transactionId: null,
          ...(cancelMetadata
            ? { gatewayResponse: cancelMetadata as Prisma.InputJsonValue }
            : {}),
        },
      });
      this.logger.log(
        `MoMo payment ${payment.id} cancelled (resultCode=${resultCode}), reset to pending`,
      );
      return { status: 'cancelled', bookingId: payment.bookingId };
    }

    if (success && !isSignatureValid) {
      this.logger.warn(
        `MoMo return signature mismatch for payment ${payment.id} — waiting for IPN`,
      );
      return { status: 'pending', bookingId: payment.bookingId };
    }

    return {
      status:
        payment.status === PaymentStatus.COMPLETED ? 'success' : 'pending',
      bookingId: payment.bookingId,
    };
  }

  /**
   * Verify HMAC-SHA256 signature of a MoMo redirect / IPN payload. The key
   * list is the same as the one used to sign the create-payment request,
   * sorted alphabetically and joined with `&`.
   */
  private _verifyMomoRedirectSignature(query: Record<string, string>): boolean {
    const signature = query.signature;
    if (!signature) return false;

    const accessKey = process.env.MOMO_ACCESS_KEY || 'F8BBA842ECF85';
    const secretKey =
      process.env.MOMO_SECRET_KEY || 'K951B6PE1waDMi640xX08PD3vg6EkVlz';

    const rawSignature =
      `accessKey=${accessKey}` +
      `&amount=${query.amount ?? ''}` +
      `&extraData=${query.extraData ?? ''}` +
      `&message=${query.message ?? ''}` +
      `&orderId=${query.orderId ?? ''}` +
      `&orderInfo=${query.orderInfo ?? ''}` +
      `&orderType=${query.orderType ?? ''}` +
      `&partnerCode=${query.partnerCode ?? ''}` +
      `&payType=${query.payType ?? ''}` +
      `&requestId=${query.requestId ?? ''}` +
      `&responseTime=${query.responseTime ?? ''}` +
      `&resultCode=${query.resultCode ?? ''}` +
      `&transId=${query.transId ?? ''}`;

    const expected = crypto
      .createHmac('sha256', secretKey)
      .update(rawSignature)
      .digest('hex');

    // timingSafeEqual throws RangeError when buffers differ in length, so
    // short-circuit when the redirect signature is the wrong size before
    // doing the comparison.
    if (expected.length !== signature.length) return false;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(signature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  /**
   * Handle PayOS webhook callback — verifies signature and updates payment status
   */
  async handlePayOSWebhook(body: Record<string, unknown>): Promise<void> {
    let webhookData: Awaited<ReturnType<typeof this.payos.webhooks.verify>>;
    try {
      webhookData = await this.payos.webhooks.verify(
        body as Parameters<typeof this.payos.webhooks.verify>[0],
      );
    } catch (err) {
      this.logger.error(
        `PayOS webhook verification failed: ${(err as Error).message}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }

    const { orderCode, code } = webhookData;

    this.logger.log(
      `PayOS webhook received: orderCode=${orderCode}, code=${code}`,
    );

    // Look up the payment for this orderCode regardless of result code so
    // we can mark non-success codes as FAILED instead of leaving the payment
    // stuck in PROCESSING forever.
    const payment = await this.prisma.payment.findFirst({
      where: {
        transactionId: String(orderCode),
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
      },
    });

    if (!payment) {
      this.logger.warn(
        `PayOS webhook for orderCode ${orderCode} did not match any pending/processing payment`,
      );
      return;
    }

    if (String(code) === '00') {
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
      return;
    }

    // Any non-success code means the gateway transaction failed (insufficient
    // funds, declined, etc). Persist that so the renter can pick another
    // method instead of staring at a "Đang xử lý" state forever.
    const failureMetadata = this.cryptoService.encryptJson({
      gateway: 'payos',
      stage: 'webhook',
      code: String(code),
      desc: webhookData.desc,
      failedAt: new Date().toISOString(),
    });
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        ...(failureMetadata ? { gatewayResponse: failureMetadata } : {}),
      },
    });
    this.logger.warn(
      `PayOS payment ${payment.id} marked FAILED (code=${code}, desc=${webhookData.desc ?? 'n/a'})`,
    );
    this.eventEmitter.emit(
      'payment.failed',
      new PaymentFailedEvent(payment.id, payment.bookingId, payment.payerId),
    );
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
        const successMetadata = this.cryptoService.encryptJson({
          gateway: 'payos',
          stage: 'return',
          query,
          completedAt: new Date().toISOString(),
        });
        const completed = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            paidAt: new Date(),
            ...(successMetadata
              ? { gatewayResponse: successMetadata as Prisma.InputJsonValue }
              : {}),
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

      // Payment may have already been marked COMPLETED by the webhook —
      // surface the booking id so the FE can return to the right page.
      const completedPayment = await this.prisma.payment.findFirst({
        where: {
          transactionId: orderCode,
          status: PaymentStatus.COMPLETED,
        },
        select: { bookingId: true },
      });
      if (completedPayment) {
        return { status: 'success', bookingId: completedPayment.bookingId };
      }
    } else if (status === 'CANCELLED') {
      const payment = await this.prisma.payment.findFirst({
        where: {
          transactionId: orderCode,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
      });

      if (payment) {
        const cancelMetadata = this.cryptoService.encryptJson({
          gateway: 'payos',
          stage: 'return',
          query,
          cancelledAt: new Date().toISOString(),
        });
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.PENDING,
            transactionId: null,
            ...(cancelMetadata
              ? { gatewayResponse: cancelMetadata as Prisma.InputJsonValue }
              : {}),
          },
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
   * Reconcile a local PROCESSING PayOS payment against PayOS's record.
   * Returns the upstream status bucket so callers can decide whether the
   * payment is safe to reset (cancelled/expired) or already paid.
   */
  private async tryReconcilePayOSStatus(
    paymentId: string,
    orderCode: string,
  ): Promise<'completed' | 'cancelled' | 'expired' | 'pending' | 'unknown'> {
    const numericOrderCode = Number(orderCode);
    if (!Number.isFinite(numericOrderCode)) return 'unknown';
    try {
      const link = await this.payos.paymentRequests.get(numericOrderCode);
      const status = String(link?.status ?? '').toUpperCase();
      this.logger.log(
        `PayOS link ${orderCode} status from gateway: ${status || 'n/a'}`,
      );

      if (status === 'PAID') {
        const successMetadata = this.cryptoService.encryptJson({
          gateway: 'payos',
          stage: 'reconcile',
          link,
          completedAt: new Date().toISOString(),
        });
        const completed = await this.prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.COMPLETED,
            paidAt: new Date(),
            ...(successMetadata
              ? { gatewayResponse: successMetadata as Prisma.InputJsonValue }
              : {}),
          },
        });
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
        return 'completed';
      }

      if (status === 'CANCELLED') return 'cancelled';
      if (status === 'EXPIRED') return 'expired';
      if (status === 'PENDING' || status === 'PROCESSING') return 'pending';
      return 'unknown';
    } catch (err) {
      this.logger.warn(
        `Failed to fetch PayOS link ${orderCode}: ${(err as Error).message}`,
      );
      return 'unknown';
    }
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
