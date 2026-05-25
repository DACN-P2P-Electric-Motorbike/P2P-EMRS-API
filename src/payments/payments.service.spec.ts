import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import {
  BookingStatus,
  OtpType,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthService } from '../auth/auth.service';
import { CryptoService } from '../security/crypto.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RENTER_ID = 'renter-uuid';
const OWNER_ID = 'owner-uuid';
const BOOKING_ID = 'booking-uuid';
const VEHICLE_ID = 'vehicle-uuid';
const PAYMENT_ID = 'payment-uuid';

const makeBooking = (overrides: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  renterId: RENTER_ID,
  ownerId: OWNER_ID,
  vehicleId: VEHICLE_ID,
  status: BookingStatus.CONFIRMED,
  totalPrice: 100_000,
  deposit: 20_000,
  protectionFee: 0,
  prepaidChargingFee: 0,
  payment: null,
  vehicle: { id: VEHICLE_ID, name: 'Test EV' },
  ...overrides,
});

const makePayment = (overrides: Record<string, unknown> = {}) => ({
  id: PAYMENT_ID,
  bookingId: BOOKING_ID,
  payerId: RENTER_ID,
  receiverId: OWNER_ID,
  amount: 120_000,
  platformFee: 15_000,
  ownerAmount: 85_000,
  method: PaymentMethod.CASH,
  status: PaymentStatus.PENDING,
  transactionId: null,
  gatewayResponse: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  paidAt: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

const mockPrisma = () => ({
  booking: {
    findUnique: jest.fn(),
  },
  payment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

const mockEventEmitter = () => ({ emit: jest.fn() });
const mockAuthService = () => ({
  verifySensitiveActionOtp: jest.fn().mockResolvedValue(undefined),
});
const mockCryptoService = () => ({
  encryptJson: jest.fn(() => 'encrypted-json'),
  tryDecryptJson: jest.fn((value: unknown) =>
    value === 'encrypted-json' ? { decrypted: true } : value,
  ),
});

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: ReturnType<typeof mockPrisma>;
  let authService: ReturnType<typeof mockAuthService>;
  let cryptoService: ReturnType<typeof mockCryptoService>;

  beforeEach(async () => {
    prisma = mockPrisma();
    authService = mockAuthService();
    cryptoService = mockCryptoService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: mockEventEmitter() },
        { provide: AuthService, useValue: authService },
        { provide: CryptoService, useValue: cryptoService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);

    process.env.PAYOS_CLIENT_ID = 'payos-client-id';
    process.env.PAYOS_API_KEY = 'payos-api-key';
    process.env.PAYOS_CHECKSUM_KEY = 'payos-checksum-key';

    // Stub PayOS initialisation so onModuleInit doesn't fail
    (service as any).payos = {
      paymentRequests: {
        create: jest.fn(),
        cancel: jest.fn(),
        get: jest.fn().mockResolvedValue({ status: 'PENDING' }),
      },
      webhooks: { verify: jest.fn() },
    };
  });

  // =========================================================================
  // Day 1 — createPayment
  // =========================================================================
  describe('createPayment', () => {
    const dto = { bookingId: BOOKING_ID, method: PaymentMethod.CASH };

    it('should throw NotFoundException when booking does not exist', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(service.createPayment(RENTER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when user is not the renter', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      await expect(service.createPayment('other-user', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when a completed payment already exists', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          payment: makePayment({ status: PaymentStatus.COMPLETED }),
        }),
      );
      await expect(service.createPayment(RENTER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reuse an existing pending payment instead of creating a duplicate', async () => {
      const existing = makePayment({ status: PaymentStatus.PENDING });
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ payment: existing }),
      );

      const result = await service.createPayment(RENTER_ID, dto);

      expect(result.id).toBe(PAYMENT_ID);
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(prisma.payment.delete).not.toHaveBeenCalled();
    });

    it('should reuse an existing processing payment instead of creating a duplicate', async () => {
      const existing = makePayment({ status: PaymentStatus.PROCESSING });
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ payment: existing }),
      );

      const result = await service.createPayment(RENTER_ID, dto);

      expect(result.status).toBe(PaymentStatus.PROCESSING);
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(prisma.payment.delete).not.toHaveBeenCalled();
    });

    it('should reset a failed payment before retrying', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          payment: makePayment({ status: PaymentStatus.FAILED }),
        }),
      );
      prisma.payment.update.mockResolvedValue(
        makePayment({ status: PaymentStatus.PENDING }),
      );

      const result = await service.createPayment(RENTER_ID, dto);

      expect(result.status).toBe(PaymentStatus.PENDING);
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: PAYMENT_ID },
        data: {
          method: PaymentMethod.CASH,
          status: PaymentStatus.PENDING,
          transactionId: null,
          gatewayResponse: expect.anything(),
          paidAt: null,
        },
      });
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(prisma.payment.delete).not.toHaveBeenCalled();
    });

    it('should change method on an existing pending payment', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          payment: makePayment({
            status: PaymentStatus.PENDING,
            method: PaymentMethod.PAYOS,
          }),
        }),
      );
      prisma.payment.update.mockResolvedValue(
        makePayment({
          status: PaymentStatus.PENDING,
          method: PaymentMethod.MOMO,
        }),
      );

      const result = await service.createPayment(RENTER_ID, {
        bookingId: BOOKING_ID,
        method: PaymentMethod.MOMO,
      });

      expect(result.method).toBe(PaymentMethod.MOMO);
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: PAYMENT_ID },
        data: {
          method: PaymentMethod.MOMO,
          status: PaymentStatus.PENDING,
          transactionId: null,
          gatewayResponse: expect.anything(),
          paidAt: null,
        },
      });
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('should reset processing gateway state when changing method', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          payment: makePayment({
            status: PaymentStatus.PROCESSING,
            method: PaymentMethod.PAYOS,
            transactionId: '12345678',
          }),
        }),
      );
      prisma.payment.update.mockResolvedValue(
        makePayment({
          status: PaymentStatus.PENDING,
          method: PaymentMethod.CASH,
          transactionId: null,
        }),
      );

      const result = await service.createPayment(RENTER_ID, dto);

      expect(result.status).toBe(PaymentStatus.PENDING);
      expect(result.method).toBe(PaymentMethod.CASH);
      expect(
        (service as any).payos.paymentRequests.cancel,
      ).toHaveBeenCalledWith(12345678, 'User changed payment method');
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: PAYMENT_ID },
        data: {
          method: PaymentMethod.CASH,
          status: PaymentStatus.PENDING,
          transactionId: null,
          gatewayResponse: expect.anything(),
          paidAt: null,
        },
      });
    });

    it('should reject method change when active PayOS link cannot be cancelled', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          payment: makePayment({
            status: PaymentStatus.PROCESSING,
            method: PaymentMethod.PAYOS,
            transactionId: '12345678',
          }),
        }),
      );
      // Reconcile reports the link as still PENDING (active), then cancel fails.
      (service as any).payos.paymentRequests.get.mockResolvedValue({
        status: 'PENDING',
      });
      (service as any).payos.paymentRequests.cancel.mockRejectedValue(
        new Error('cancel failed'),
      );

      await expect(service.createPayment(RENTER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('should reconcile to COMPLETED when PayOS reports the link as PAID', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          payment: makePayment({
            status: PaymentStatus.PROCESSING,
            method: PaymentMethod.PAYOS,
            transactionId: '12345678',
          }),
        }),
      );
      (service as any).payos.paymentRequests.get.mockResolvedValue({
        status: 'PAID',
      });
      const completed = makePayment({ status: PaymentStatus.COMPLETED });
      prisma.payment.update.mockResolvedValueOnce(completed);
      prisma.payment.findUnique.mockResolvedValueOnce(completed);

      const result = await service.createPayment(RENTER_ID, dto);

      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(
        (service as any).payos.paymentRequests.cancel,
      ).not.toHaveBeenCalled();
    });

    it('should skip PayOS cancel when reconcile reports CANCELLED', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({
          payment: makePayment({
            status: PaymentStatus.PROCESSING,
            method: PaymentMethod.PAYOS,
            transactionId: '12345678',
          }),
        }),
      );
      (service as any).payos.paymentRequests.get.mockResolvedValue({
        status: 'CANCELLED',
      });
      prisma.payment.update.mockResolvedValue(
        makePayment({
          status: PaymentStatus.PENDING,
          method: PaymentMethod.CASH,
          transactionId: null,
        }),
      );

      const result = await service.createPayment(RENTER_ID, dto);

      expect(result.method).toBe(PaymentMethod.CASH);
      expect(
        (service as any).payos.paymentRequests.cancel,
      ).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when booking is not CONFIRMED', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ status: BookingStatus.PENDING }),
      );
      await expect(service.createPayment(RENTER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should calculate 15% platform fee from rental price only', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      const created = makePayment();
      prisma.payment.create.mockResolvedValue(created);

      await service.createPayment(RENTER_ID, dto);

      const callArg = prisma.payment.create.mock.calls[0][0].data;
      expect(callArg.amount).toBe(120_000);
      expect(callArg.platformFee).toBe(15_000);
      expect(callArg.ownerAmount).toBe(85_000);
    });

    it('should include protection fee in renter payment amount without changing owner payout', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ protectionFee: 10_000 }),
      );
      prisma.payment.create.mockResolvedValue(makePayment({ amount: 130_000 }));

      await service.createPayment(RENTER_ID, dto);

      const callArg = prisma.payment.create.mock.calls[0][0].data;
      expect(callArg.amount).toBe(130_000);
      expect(callArg.platformFee).toBe(15_000);
      expect(callArg.ownerAmount).toBe(85_000);
    });

    it('should include prepaid charging fee without changing owner payout', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ prepaidChargingFee: 50_000 }),
      );
      prisma.payment.create.mockResolvedValue(makePayment({ amount: 170_000 }));

      await service.createPayment(RENTER_ID, dto);

      const callArg = prisma.payment.create.mock.calls[0][0].data;
      expect(callArg.amount).toBe(170_000);
      expect(callArg.platformFee).toBe(15_000);
      expect(callArg.ownerAmount).toBe(85_000);
    });

    it('should create a payment with PENDING status', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      prisma.payment.create.mockResolvedValue(makePayment());

      const result = await service.createPayment(RENTER_ID, dto);

      expect(prisma.payment.create).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
      expect(result.status).toBe(PaymentStatus.PENDING);
    });

    it('should set correct payerId and receiverId', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      prisma.payment.create.mockResolvedValue(makePayment());

      await service.createPayment(RENTER_ID, dto);

      const callArg = prisma.payment.create.mock.calls[0][0].data;
      expect(callArg.payerId).toBe(RENTER_ID);
      expect(callArg.receiverId).toBe(OWNER_ID);
    });
  });

  // =========================================================================
  // Day 1 — getPaymentById
  // =========================================================================
  describe('getPaymentById', () => {
    it('should throw NotFoundException when payment does not exist', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(
        service.getPaymentById(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user has no access', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ booking: { vehicle: {} } }),
      );
      await expect(
        service.getPaymentById(PAYMENT_ID, 'stranger'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return payment for the payer', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ booking: { vehicle: {} } }),
      );
      const result = await service.getPaymentById(PAYMENT_ID, RENTER_ID);
      expect(result.id).toBe(PAYMENT_ID);
    });

    it('should return payment for the receiver (owner)', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ booking: { vehicle: {} } }),
      );
      const result = await service.getPaymentById(PAYMENT_ID, OWNER_ID);
      expect(result.id).toBe(PAYMENT_ID);
    });
  });

  // =========================================================================
  // Day 1 — getPaymentByBookingId
  // =========================================================================
  describe('getPaymentByBookingId', () => {
    it('should throw NotFoundException when booking does not exist', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(
        service.getPaymentByBookingId(BOOKING_ID, RENTER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user has no access', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      await expect(
        service.getPaymentByBookingId(BOOKING_ID, 'stranger'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return null when no payment exists for the booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      prisma.payment.findUnique.mockResolvedValue(null);
      const result = await service.getPaymentByBookingId(BOOKING_ID, RENTER_ID);
      expect(result).toBeNull();
    });

    it('should return the payment when one exists', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      const result = await service.getPaymentByBookingId(BOOKING_ID, RENTER_ID);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(PAYMENT_ID);
    });
  });

  // =========================================================================
  // Day 1 — Payment status logic (simulatePaymentSuccess)
  // =========================================================================
  describe('simulatePaymentSuccess', () => {
    it('should throw NotFoundException for non-existent payment', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(service.simulatePaymentSuccess(PAYMENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update status to COMPLETED and set paidAt', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      const completed = makePayment({
        status: PaymentStatus.COMPLETED,
        paidAt: new Date(),
      });
      prisma.payment.update.mockResolvedValue(completed);

      const result = await service.simulatePaymentSuccess(PAYMENT_ID);

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PAYMENT_ID },
          data: expect.objectContaining({
            status: PaymentStatus.COMPLETED,
          }),
        }),
      );
      expect(result.status).toBe(PaymentStatus.COMPLETED);
    });

    it('should generate a SIM_ transaction ID', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      prisma.payment.update.mockResolvedValue(
        makePayment({ status: PaymentStatus.COMPLETED }),
      );

      await service.simulatePaymentSuccess(PAYMENT_ID);

      const data = prisma.payment.update.mock.calls[0][0].data;
      expect(data.transactionId).toMatch(/^SIM_\d+$/);
    });

    it('should reject simulation when caller is not the payer', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      await expect(
        service.simulatePaymentSuccess(PAYMENT_ID, 'stranger'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('should be idempotent for already-completed payments', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.COMPLETED }),
      );

      const result = await service.simulatePaymentSuccess(
        PAYMENT_ID,
        RENTER_ID,
      );

      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('should reject simulation for refunded payments', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.REFUNDED }),
      );
      await expect(
        service.simulatePaymentSuccess(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // Day 1 — Payment status logic (handlePayOSReturn)
  // =========================================================================
  describe('handlePayOSReturn', () => {
    it('should return status "missing_order_code" when orderCode is absent', async () => {
      const result = await service.handlePayOSReturn({} as any);
      expect(result).toEqual({ status: 'missing_order_code' });
    });

    it('should mark payment as COMPLETED when status is PAID', async () => {
      const pending = makePayment({ status: PaymentStatus.PROCESSING });
      prisma.payment.findFirst.mockResolvedValue(pending);
      prisma.payment.update.mockResolvedValue(
        makePayment({ status: PaymentStatus.COMPLETED }),
      );

      const result = await service.handlePayOSReturn({
        orderCode: '12345678',
        status: 'PAID',
      });

      expect(result).toEqual(expect.objectContaining({ status: 'success' }));
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.COMPLETED,
          }),
        }),
      );
    });

    it('should reset payment to PENDING when status is CANCELLED', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        makePayment({ status: PaymentStatus.PROCESSING }),
      );
      prisma.payment.update.mockResolvedValue(
        makePayment({ status: PaymentStatus.PENDING }),
      );

      const result = await service.handlePayOSReturn({
        orderCode: '12345678',
        status: 'CANCELLED',
      });

      expect(result).toEqual(expect.objectContaining({ status: 'cancelled' }));
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.PENDING,
          }),
        }),
      );
    });

    it('should return status "unknown" for unrecognised status', async () => {
      const result = await service.handlePayOSReturn({
        orderCode: '12345678',
      } as any);
      expect(result).toEqual({ status: 'unknown' });
    });

    it('should return status from params when no matching payment found for PAID', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      const result = await service.handlePayOSReturn({
        orderCode: '12345678',
        status: 'PAID',
      });
      expect(result).toEqual({ status: 'PAID' });
    });

    it('should reconcile to success when webhook already marked the payment COMPLETED', async () => {
      prisma.payment.findFirst
        // First call (pending/processing scope) — none.
        .mockResolvedValueOnce(null)
        // Second call (already-completed scope) — the webhook-completed row.
        .mockResolvedValueOnce({ bookingId: BOOKING_ID });

      const result = await service.handlePayOSReturn({
        orderCode: '12345678',
        status: 'PAID',
      });

      expect(result).toEqual({ status: 'success', bookingId: BOOKING_ID });
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('should encrypt return-URL metadata into gatewayResponse on success', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        makePayment({ status: PaymentStatus.PROCESSING }),
      );
      prisma.payment.update.mockResolvedValue(
        makePayment({ status: PaymentStatus.COMPLETED }),
      );

      await service.handlePayOSReturn({
        orderCode: '12345678',
        status: 'PAID',
      });

      expect(cryptoService.encryptJson).toHaveBeenCalledWith(
        expect.objectContaining({
          gateway: 'payos',
          stage: 'return',
        }),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.COMPLETED,
            gatewayResponse: 'encrypted-json',
          }),
        }),
      );
    });

    it('should clear stale transactionId when status is CANCELLED', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        makePayment({
          status: PaymentStatus.PROCESSING,
          transactionId: '12345678',
        }),
      );
      prisma.payment.update.mockResolvedValue(
        makePayment({
          status: PaymentStatus.PENDING,
          transactionId: null,
        }),
      );

      await service.handlePayOSReturn({
        orderCode: '12345678',
        status: 'CANCELLED',
      });

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.PENDING,
            transactionId: null,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // Day 3 — Edge: initiatePayOSPayment
  // =========================================================================
  describe('initiatePayOSPayment', () => {
    it('should throw NotFoundException when payment not found', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(
        service.initiatePayOSPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user is not the payer', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      await expect(
        service.initiatePayOSPayment(PAYMENT_ID, 'other-user'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when payment already processed', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.COMPLETED }),
      );
      await expect(
        service.initiatePayOSPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should call PayOS SDK and return checkoutUrl + qrCode', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      prisma.payment.update.mockResolvedValue(
        makePayment({ status: PaymentStatus.PROCESSING }),
      );

      const payosMock = (service as any).payos;
      payosMock.paymentRequests.create.mockResolvedValue({
        checkoutUrl: 'https://pay.payos.vn/test',
        qrCode: 'data:image/png;base64,abc',
      });

      const result = await service.initiatePayOSPayment(PAYMENT_ID, RENTER_ID);

      expect(result.checkoutUrl).toBe('https://pay.payos.vn/test');
      expect(result.qrCode).toBe('data:image/png;base64,abc');
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.PROCESSING,
          }),
        }),
      );
    });

    it('should fail clearly when PayOS checksum key is missing', async () => {
      delete process.env.PAYOS_CHECKSUM_KEY;
      prisma.payment.findUnique.mockResolvedValue(makePayment());

      await expect(
        service.initiatePayOSPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow('PayOS is not configured');

      const payosMock = (service as any).payos;
      expect(payosMock.paymentRequests.create).not.toHaveBeenCalled();
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('should mark payment failed when PayOS SDK fails', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      const payosMock = (service as any).payos;
      payosMock.paymentRequests.create.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        service.initiatePayOSPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: PAYMENT_ID },
        data: expect.objectContaining({
          status: PaymentStatus.FAILED,
          gatewayResponse: 'encrypted-json',
        }),
      });
      expect(cryptoService.encryptJson).toHaveBeenCalledWith(
        expect.objectContaining({
          gateway: 'payos',
          stage: 'initiate',
          error: 'Network error',
        }),
      );
    });

    it('should surface invalid PayOS signature config as a configuration error', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      const payosMock = (service as any).payos;
      payosMock.paymentRequests.create.mockRejectedValue(
        new Error('Failed to create payment signature'),
      );

      await expect(
        service.initiatePayOSPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow('PayOS configuration is invalid');
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: PAYMENT_ID },
        data: expect.objectContaining({
          status: PaymentStatus.FAILED,
          gatewayResponse: 'encrypted-json',
        }),
      });
    });

    it('should reject amounts below the PayOS 1000 VND minimum', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment({ amount: 500 }));

      await expect(
        service.initiatePayOSPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(/PayOS amount/);

      const payosMock = (service as any).payos;
      expect(payosMock.paymentRequests.create).not.toHaveBeenCalled();
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('should reject localhost return URLs in production', async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      const previousReturnUrl = process.env.PAYOS_RETURN_URL;
      const previousCancelUrl = process.env.PAYOS_CANCEL_URL;
      process.env.NODE_ENV = 'production';
      process.env.PAYOS_RETURN_URL =
        'http://localhost:3000/payments/payos-return';
      process.env.PAYOS_CANCEL_URL =
        'https://api.example.com/payments/payos-cancel';

      prisma.payment.findUnique.mockResolvedValue(makePayment());

      await expect(
        service.initiatePayOSPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(/PAYOS_RETURN_URL/);

      const payosMock = (service as any).payos;
      expect(payosMock.paymentRequests.create).not.toHaveBeenCalled();

      process.env.NODE_ENV = previousNodeEnv;
      if (previousReturnUrl !== undefined) {
        process.env.PAYOS_RETURN_URL = previousReturnUrl;
      } else {
        delete process.env.PAYOS_RETURN_URL;
      }
      if (previousCancelUrl !== undefined) {
        process.env.PAYOS_CANCEL_URL = previousCancelUrl;
      } else {
        delete process.env.PAYOS_CANCEL_URL;
      }
    });

    it('should mark FAILED when PayOS returns an empty checkoutUrl', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      const payosMock = (service as any).payos;
      payosMock.paymentRequests.create.mockResolvedValue({
        checkoutUrl: '',
        qrCode: '',
      });

      await expect(
        service.initiatePayOSPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(/checkout URL/);

      // Two updates: first stores PROCESSING + transactionId, then FAILED.
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.FAILED,
          }),
        }),
      );
    });

    it('should generate orderCode larger than legacy 8-digit window', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      prisma.payment.update.mockResolvedValue(
        makePayment({ status: PaymentStatus.PROCESSING }),
      );
      const payosMock = (service as any).payos;
      payosMock.paymentRequests.create.mockResolvedValue({
        checkoutUrl: 'https://pay.payos.vn/test',
        qrCode: '',
      });

      await service.initiatePayOSPayment(PAYMENT_ID, RENTER_ID);

      const callArg = payosMock.paymentRequests.create.mock.calls[0][0];
      expect(callArg.orderCode).toBeGreaterThan(99_999_999); // > old 8-digit cap
      expect(Number.isInteger(callArg.orderCode)).toBe(true);
      expect(callArg.orderCode).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    });
  });

  // =========================================================================
  // Day 3 — Edge: refundPayment
  // =========================================================================
  describe('refundPayment', () => {
    it('should require OTP before looking up the payment', async () => {
      await expect(
        service.refundPayment(PAYMENT_ID, RENTER_ID, ''),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
      expect(authService.verifySensitiveActionOtp).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when payment not found', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(
        service.refundPayment(PAYMENT_ID, RENTER_ID, '12345'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user has no access', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.COMPLETED, booking: {} }),
      );
      await expect(
        service.refundPayment(PAYMENT_ID, 'stranger', '12345'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when payment is not COMPLETED', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.PENDING, booking: {} }),
      );
      await expect(
        service.refundPayment(PAYMENT_ID, RENTER_ID, '12345'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for already refunded payment', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.REFUNDED, booking: {} }),
      );
      await expect(
        service.refundPayment(PAYMENT_ID, RENTER_ID, '12345'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update status to REFUNDED for a completed payment', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.COMPLETED, booking: {} }),
      );
      const refunded = makePayment({ status: PaymentStatus.REFUNDED });
      prisma.payment.update.mockResolvedValue(refunded);

      const result = await service.refundPayment(
        PAYMENT_ID,
        RENTER_ID,
        '12345',
      );

      expect(result.status).toBe(PaymentStatus.REFUNDED);
      expect(authService.verifySensitiveActionOtp).toHaveBeenCalledWith(
        RENTER_ID,
        '12345',
        OtpType.FINANCIAL_TRANSACTION,
      );
      expect(cryptoService.encryptJson).toHaveBeenCalledWith(
        expect.objectContaining({
          refundedAt: expect.any(String),
          refundedBy: RENTER_ID,
        }),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.REFUNDED,
            gatewayResponse: 'encrypted-json',
          }),
        }),
      );
    });

    it('should allow the receiver (owner) to refund', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.COMPLETED, booking: {} }),
      );
      prisma.payment.update.mockResolvedValue(
        makePayment({ status: PaymentStatus.REFUNDED }),
      );

      const result = await service.refundPayment(PAYMENT_ID, OWNER_ID, '12345');
      expect(result.status).toBe(PaymentStatus.REFUNDED);
    });
  });

  // =========================================================================
  // Day 3 — Edge: handlePayOSWebhook
  // =========================================================================
  describe('handlePayOSWebhook', () => {
    it('should throw BadRequestException on invalid webhook signature', async () => {
      const payosMock = (service as any).payos;
      payosMock.webhooks.verify.mockRejectedValue(
        new Error('Invalid signature'),
      );

      await expect(service.handlePayOSWebhook({ data: 'bad' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should mark payment COMPLETED when webhook code is "00"', async () => {
      const payosMock = (service as any).payos;
      payosMock.webhooks.verify.mockResolvedValue({
        orderCode: 12345678,
        code: '00',
      });
      prisma.payment.findFirst.mockResolvedValue(
        makePayment({ transactionId: '12345678' }),
      );
      prisma.payment.update.mockResolvedValue(
        makePayment({ status: PaymentStatus.COMPLETED }),
      );

      await service.handlePayOSWebhook({ data: 'valid' });

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.COMPLETED,
          }),
        }),
      );
    });

    it('should not update when no matching payment found for webhook', async () => {
      const payosMock = (service as any).payos;
      payosMock.webhooks.verify.mockResolvedValue({
        orderCode: 99999999,
        code: '00',
      });
      prisma.payment.findFirst.mockResolvedValue(null);

      await service.handlePayOSWebhook({ data: 'valid' });

      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('should mark payment FAILED when webhook code is not "00"', async () => {
      const payosMock = (service as any).payos;
      payosMock.webhooks.verify.mockResolvedValue({
        orderCode: 12345678,
        code: '01',
        desc: 'Insufficient funds',
      });
      prisma.payment.findFirst.mockResolvedValue(
        makePayment({ transactionId: '12345678' }),
      );
      prisma.payment.update.mockResolvedValue(
        makePayment({ status: PaymentStatus.FAILED }),
      );

      await service.handlePayOSWebhook({ data: 'declined' });

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.FAILED,
            gatewayResponse: 'encrypted-json',
          }),
        }),
      );
    });

    it('should not update when no matching pending/processing payment exists for non-success webhook', async () => {
      const payosMock = (service as any).payos;
      payosMock.webhooks.verify.mockResolvedValue({
        orderCode: 99999999,
        code: '01',
        desc: 'Declined',
      });
      prisma.payment.findFirst.mockResolvedValue(null);

      await service.handlePayOSWebhook({ data: 'late' });

      expect(prisma.payment.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Day 3 — Edge: invalid payment method / status combinations
  // =========================================================================
  describe('createPayment — edge: booking status variations', () => {
    const dto = { bookingId: BOOKING_ID, method: PaymentMethod.PAYOS };

    it.each([
      BookingStatus.PENDING,
      BookingStatus.ONGOING,
      BookingStatus.COMPLETED,
      BookingStatus.CANCELLED,
      BookingStatus.REJECTED,
    ])('should reject booking with status %s', async (status) => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking({ status }));
      await expect(service.createPayment(RENTER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // Day 4 — initiateMoMoPayment
  // =========================================================================
  describe('initiateMoMoPayment', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should throw NotFoundException when payment not found', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(
        service.initiateMoMoPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user is not the payer', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      await expect(
        service.initiateMoMoPayment(PAYMENT_ID, 'other-user'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when payment already processed', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.COMPLETED }),
      );
      await expect(
        service.initiateMoMoPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return paymentUrl and deeplink on success', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      globalThis.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            resultCode: 0,
            message: 'Success',
            payUrl: 'https://momo.vn/pay',
            deeplink: 'momo://pay',
          }),
      }) as any;

      const result = await service.initiateMoMoPayment(PAYMENT_ID, RENTER_ID);

      expect(result.paymentUrl).toBe('https://momo.vn/pay');
      expect(result.deeplink).toBe('momo://pay');
    });

    it('should throw BadRequestException when MoMo returns non-zero resultCode', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      globalThis.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            resultCode: 49,
            message: 'Insufficient funds',
          }),
      }) as any;

      await expect(
        service.initiateMoMoPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when fetch fails (network error)', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      globalThis.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Network timeout')) as any;

      await expect(
        service.initiateMoMoPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle missing payUrl/deeplink in MoMo response', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      globalThis.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            resultCode: 0,
            message: 'Success',
          }),
      }) as any;

      const result = await service.initiateMoMoPayment(PAYMENT_ID, RENTER_ID);

      expect(result.paymentUrl).toBe('');
      expect(result.deeplink).toBe('');
    });
  });

  // =========================================================================
  // Day 4 — onModuleInit
  // =========================================================================
  describe('onModuleInit', () => {
    it('should initialise PayOS SDK without throwing', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });

  describe('platform fee calculation — edge values', () => {
    const dto = { bookingId: BOOKING_ID, method: PaymentMethod.CASH };

    it('should handle zero-value bookings', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ totalPrice: 0, deposit: 0 }),
      );
      prisma.payment.create.mockResolvedValue(
        makePayment({ amount: 0, platformFee: 0, ownerAmount: 0 }),
      );

      await service.createPayment(RENTER_ID, dto);

      const data = prisma.payment.create.mock.calls[0][0].data;
      expect(data.amount).toBe(0);
      expect(data.platformFee).toBe(0);
      expect(data.ownerAmount).toBe(0);
    });

    it('should handle large amounts without overflow', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ totalPrice: 50_000_000, deposit: 10_000_000 }),
      );
      prisma.payment.create.mockResolvedValue(makePayment());

      await service.createPayment(RENTER_ID, dto);

      const data = prisma.payment.create.mock.calls[0][0].data;
      expect(data.amount).toBe(60_000_000);
      expect(data.platformFee).toBe(7_500_000);
      expect(data.ownerAmount).toBe(42_500_000);
    });
  });
});
