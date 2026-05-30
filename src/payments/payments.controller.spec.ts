import { PaymentMethod } from '@prisma/client';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let service: jest.Mocked<PaymentsService>;
  let payment: any;

  beforeEach(() => {
    payment = { id: 'payment-1', bookingId: 'booking-1' };
    service = {
      createPayment: jest.fn().mockResolvedValue(payment),
      getPaymentByBookingId: jest.fn().mockResolvedValue(payment),
      handlePayOSWebhook: jest.fn().mockResolvedValue(undefined),
      handlePayOSReturn: jest
        .fn()
        .mockResolvedValue({ status: 'success', bookingId: 'booking-1' }),
      handleMoMoReturn: jest
        .fn()
        .mockResolvedValue({ status: 'success', bookingId: 'booking-1' }),
      getOwnerEarnings: jest.fn().mockResolvedValue({ totalEarned: 100 }),
      getPaymentById: jest.fn().mockResolvedValue(payment),
      simulatePaymentSuccess: jest.fn().mockResolvedValue(payment),
      initiatePayOSPayment: jest
        .fn()
        .mockResolvedValue({ checkoutUrl: 'https://payos', qrCode: 'qr' }),
      initiateMoMoPayment: jest
        .fn()
        .mockResolvedValue({ paymentUrl: 'https://momo', deeplink: 'momo://' }),
      refundPayment: jest.fn().mockResolvedValue(payment),
    } as unknown as jest.Mocked<PaymentsService>;

    controller = new PaymentsController(service);
  });

  it('delegates authenticated payment commands and queries', async () => {
    await expect(
      controller.createPayment('user-1', {
        bookingId: 'booking-1',
        method: PaymentMethod.PAYOS,
      }),
    ).resolves.toBe(payment);
    await expect(
      controller.getPaymentByBooking('booking-1', 'user-1'),
    ).resolves.toBe(payment);
    await expect(controller.getOwnerEarnings('owner-1')).resolves.toEqual({
      totalEarned: 100,
    });
    await expect(controller.getPayment('payment-1', 'user-1')).resolves.toBe(
      payment,
    );

    expect(service.createPayment).toHaveBeenCalledWith('user-1', {
      bookingId: 'booking-1',
      method: PaymentMethod.PAYOS,
    });
  });

  it('handles webhooks, redirects, gateway initiation, simulation, and refunds', async () => {
    await expect(controller.payosWebhook({ code: '00' })).resolves.toEqual({
      message: 'ok',
    });

    const response = { setHeader: jest.fn(), send: jest.fn() };
    await controller.payosReturn({ orderCode: '1' }, response);
    await controller.payosCancel({ orderCode: '1' }, response);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/html; charset=utf-8',
    );
    expect(response.send).toHaveBeenCalledWith(
      expect.stringContaining('payos_result'),
    );
    expect(service.handlePayOSReturn).toHaveBeenLastCalledWith({
      orderCode: '1',
      status: 'CANCELLED',
    });

    await controller.momoReturn({ orderId: 'momo-1' }, response);
    expect(service.handleMoMoReturn).toHaveBeenCalledWith({
      orderId: 'momo-1',
    });

    await expect(
      controller.simulateSuccess('payment-1', 'user-1'),
    ).resolves.toBe(payment);
    await expect(
      controller.initiatePayOS('payment-1', 'user-1'),
    ).resolves.toEqual({ checkoutUrl: 'https://payos', qrCode: 'qr' });
    await expect(
      controller.initiateMoMo('payment-1', 'user-1'),
    ).resolves.toEqual({ paymentUrl: 'https://momo', deeplink: 'momo://' });
    await expect(
      controller.refundPayment('payment-1', 'owner-1', { otp: '123456' }),
    ).resolves.toBe(payment);

    expect(service.refundPayment).toHaveBeenCalledWith(
      'payment-1',
      'owner-1',
      '123456',
    );
  });

  it('builds fallback redirect HTML for success and cancelled states', () => {
    const successHtml = (controller as any)._buildPaymentResultHtml(
      'success',
      'booking-1',
    );
    const cancelledHtml = (controller as any)._buildPaymentResultHtml(
      'CANCELLED',
    );

    expect(successHtml).toContain('Thanh toán thành công');
    expect(successHtml).toContain('/#/bookings/booking-1');
    expect(cancelledHtml).toContain('Đã huỷ thanh toán');
    expect(cancelledHtml).toContain('/#/bookings');
  });
});
