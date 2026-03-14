import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentStatus, BookingStatus, PaymentMethod } from '@prisma/client';

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
  platformFee: 18_000,
  ownerAmount: 102_000,
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
  },
});

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);

    // Stub PayOS initialisation so onModuleInit doesn't fail
    (service as any).payos = {
      paymentRequests: { create: jest.fn() },
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

    it('should throw BadRequestException when payment already exists', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ payment: makePayment() }),
      );
      await expect(service.createPayment(RENTER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when booking is not CONFIRMED', async () => {
      prisma.booking.findUnique.mockResolvedValue(
        makeBooking({ status: BookingStatus.PENDING }),
      );
      await expect(service.createPayment(RENTER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should calculate 15% platform fee correctly', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      const created = makePayment();
      prisma.payment.create.mockResolvedValue(created);

      await service.createPayment(RENTER_ID, dto);

      const callArg = prisma.payment.create.mock.calls[0][0].data;
      // totalPrice=100000 + deposit=20000 = 120000
      expect(callArg.amount).toBe(120_000);
      expect(callArg.platformFee).toBe(18_000); // 15%
      expect(callArg.ownerAmount).toBe(102_000);
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
      const result = await service.getPaymentByBookingId(
        BOOKING_ID,
        RENTER_ID,
      );
      expect(result).toBeNull();
    });

    it('should return the payment when one exists', async () => {
      prisma.booking.findUnique.mockResolvedValue(makeBooking());
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      const result = await service.getPaymentByBookingId(
        BOOKING_ID,
        RENTER_ID,
      );
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
  });

  // =========================================================================
  // Day 1 — Payment status logic (handlePayOSReturn)
  // =========================================================================
  describe('handlePayOSReturn', () => {
    it('should return "missing_order_code" when orderCode is absent', async () => {
      const result = await service.handlePayOSReturn({} as any);
      expect(result).toBe('missing_order_code');
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

      expect(result).toBe('success');
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

      expect(result).toBe('cancelled');
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.PENDING,
          }),
        }),
      );
    });

    it('should return "unknown" for unrecognised status', async () => {
      const result = await service.handlePayOSReturn({
        orderCode: '12345678',
      } as any);
      expect(result).toBe('unknown');
    });

    it('should return status string when no matching payment found for PAID', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      const result = await service.handlePayOSReturn({
        orderCode: '12345678',
        status: 'PAID',
      });
      expect(result).toBe('PAID');
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

    it('should throw BadRequestException when PayOS SDK fails', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      const payosMock = (service as any).payos;
      payosMock.paymentRequests.create.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        service.initiatePayOSPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // Day 3 — Edge: refundPayment
  // =========================================================================
  describe('refundPayment', () => {
    it('should throw NotFoundException when payment not found', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(
        service.refundPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user has no access', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.COMPLETED, booking: {} }),
      );
      await expect(
        service.refundPayment(PAYMENT_ID, 'stranger'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when payment is not COMPLETED', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.PENDING, booking: {} }),
      );
      await expect(
        service.refundPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for already refunded payment', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.REFUNDED, booking: {} }),
      );
      await expect(
        service.refundPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update status to REFUNDED for a completed payment', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.COMPLETED, booking: {} }),
      );
      const refunded = makePayment({ status: PaymentStatus.REFUNDED });
      prisma.payment.update.mockResolvedValue(refunded);

      const result = await service.refundPayment(PAYMENT_ID, RENTER_ID);

      expect(result.status).toBe(PaymentStatus.REFUNDED);
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.REFUNDED,
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

      const result = await service.refundPayment(PAYMENT_ID, OWNER_ID);
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

      await expect(
        service.handlePayOSWebhook({ data: 'bad' }),
      ).rejects.toThrow(BadRequestException);
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

    it('should not update when webhook code is not "00"', async () => {
      const payosMock = (service as any).payos;
      payosMock.webhooks.verify.mockResolvedValue({
        orderCode: 12345678,
        code: '01',
      });

      await service.handlePayOSWebhook({ data: 'valid' });

      expect(prisma.payment.findFirst).not.toHaveBeenCalled();
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
    ])(
      'should reject booking with status %s',
      async (status) => {
        prisma.booking.findUnique.mockResolvedValue(makeBooking({ status }));
        await expect(service.createPayment(RENTER_ID, dto)).rejects.toThrow(
          BadRequestException,
        );
      },
    );
  });

  // =========================================================================
  // Day 4 — initiateMoMoPayment
  // =========================================================================
  describe('initiateMoMoPayment', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
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
      global.fetch = jest.fn().mockResolvedValue({
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
      global.fetch = jest.fn().mockResolvedValue({
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
      global.fetch = jest.fn().mockRejectedValue(
        new Error('Network timeout'),
      ) as any;

      await expect(
        service.initiateMoMoPayment(PAYMENT_ID, RENTER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle missing payUrl/deeplink in MoMo response', async () => {
      prisma.payment.findUnique.mockResolvedValue(makePayment());
      global.fetch = jest.fn().mockResolvedValue({
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
      expect(data.platformFee).toBe(9_000_000);
      expect(data.ownerAmount).toBe(51_000_000);
    });
  });
});
