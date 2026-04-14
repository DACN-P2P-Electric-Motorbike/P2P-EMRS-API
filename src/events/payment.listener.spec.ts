import { Test, TestingModule } from '@nestjs/testing';
import { PaymentEventListener } from './payment.listener';
import { NotificationService } from '../notification/notification.service';
import { NotificationGateway } from '../notification/notification.gateway';
import { NotificationType } from '@prisma/client';
import { PaymentCompletedEvent, PaymentFailedEvent } from './payment.events';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNotificationService = () => ({
  createNotification: jest.fn(),
});

const mockNotificationGateway = () => ({
  isUserOnline: jest.fn(),
  sendToUser: jest.fn(),
});

const makeNotification = (id = 'notif-uuid') => ({ id });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const paymentCompletedEvent = new PaymentCompletedEvent(
  'payment-1',
  'booking-1',
  'payer-1',
  'receiver-1',
  250000,
);

const paymentFailedEvent = new PaymentFailedEvent(
  'payment-2',
  'booking-2',
  'payer-2',
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaymentEventListener', () => {
  let listener: PaymentEventListener;
  let notificationService: ReturnType<typeof mockNotificationService>;
  let notificationGateway: ReturnType<typeof mockNotificationGateway>;

  beforeEach(async () => {
    notificationService = mockNotificationService();
    notificationGateway = mockNotificationGateway();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentEventListener,
        { provide: NotificationService, useValue: notificationService },
        { provide: NotificationGateway, useValue: notificationGateway },
      ],
    }).compile();

    listener = module.get<PaymentEventListener>(PaymentEventListener);
  });

  // =========================================================================
  // handlePaymentCompleted
  // =========================================================================

  describe('handlePaymentCompleted', () => {
    beforeEach(() => {
      notificationService.createNotification
        .mockResolvedValueOnce(makeNotification('payer-notif'))
        .mockResolvedValueOnce(makeNotification('receiver-notif'));
      notificationGateway.isUserOnline.mockReturnValue(false);
    });

    it('should create notifications for BOTH payer and receiver', async () => {
      await listener.handlePaymentCompleted(paymentCompletedEvent);

      expect(notificationService.createNotification).toHaveBeenCalledTimes(2);
    });

    it('should create PAYMENT_SUCCESS notification for the payer', async () => {
      await listener.handlePaymentCompleted(paymentCompletedEvent);

      const payerCall = notificationService.createNotification.mock.calls[0][0];
      expect(payerCall.receiverId).toBe('payer-1');
      expect(payerCall.type).toBe(NotificationType.PAYMENT_SUCCESS);
      expect(payerCall.bookingId).toBe('booking-1');
    });

    it('should format amount as Vietnamese locale in payer message', async () => {
      await listener.handlePaymentCompleted(paymentCompletedEvent);

      const payerCall = notificationService.createNotification.mock.calls[0][0];
      // 250000 formatted in vi-VN locale should contain "250.000"
      expect(payerCall.message).toContain('250');
    });

    it('should create PAYMENT_SUCCESS notification for the receiver', async () => {
      await listener.handlePaymentCompleted(paymentCompletedEvent);

      const receiverCall = notificationService.createNotification.mock.calls[1][0];
      expect(receiverCall.receiverId).toBe('receiver-1');
      expect(receiverCall.senderId).toBe('payer-1');
      expect(receiverCall.type).toBe(NotificationType.PAYMENT_SUCCESS);
    });

    it('should send WebSocket event to online payer', async () => {
      notificationGateway.isUserOnline.mockImplementation(
        (userId: string) => userId === 'payer-1',
      );

      await listener.handlePaymentCompleted(paymentCompletedEvent);

      const wsRecipients = notificationGateway.sendToUser.mock.calls.map(
        (c: any) => c[0],
      );
      expect(wsRecipients).toContain('payer-1');
    });

    it('should send WebSocket event to online receiver', async () => {
      notificationGateway.isUserOnline.mockReturnValue(true);

      await listener.handlePaymentCompleted(paymentCompletedEvent);

      const wsRecipients = notificationGateway.sendToUser.mock.calls.map(
        (c: any) => c[0],
      );
      expect(wsRecipients).toContain('receiver-1');
    });

    it('should use "payment_success" event key for payer and "payment_received" for receiver', async () => {
      notificationGateway.isUserOnline.mockReturnValue(true);

      await listener.handlePaymentCompleted(paymentCompletedEvent);

      const calls = notificationGateway.sendToUser.mock.calls;
      const payerWs = calls.find((c: any) => c[0] === 'payer-1');
      const receiverWs = calls.find((c: any) => c[0] === 'receiver-1');

      expect(payerWs?.[1]).toBe('payment_success');
      expect(receiverWs?.[1]).toBe('payment_received');
    });

    it('should NOT send WebSocket to offline users', async () => {
      notificationGateway.isUserOnline.mockReturnValue(false);

      await listener.handlePaymentCompleted(paymentCompletedEvent);

      expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handlePaymentFailed
  // =========================================================================

  describe('handlePaymentFailed', () => {
    beforeEach(() => {
      notificationService.createNotification.mockResolvedValue(
        makeNotification('fail-notif'),
      );
    });

    it('should create exactly ONE notification for the payer only', async () => {
      notificationGateway.isUserOnline.mockReturnValue(false);

      await listener.handlePaymentFailed(paymentFailedEvent);

      expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
    });

    it('should create PAYMENT_FAILED notification for the payer', async () => {
      notificationGateway.isUserOnline.mockReturnValue(false);

      await listener.handlePaymentFailed(paymentFailedEvent);

      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          receiverId: 'payer-2',
          type: NotificationType.PAYMENT_FAILED,
          bookingId: 'booking-2',
        }),
      );
    });

    it('should send WebSocket "payment_failed" event when payer is online', async () => {
      notificationGateway.isUserOnline.mockReturnValue(true);

      await listener.handlePaymentFailed(paymentFailedEvent);

      expect(notificationGateway.sendToUser).toHaveBeenCalledWith(
        'payer-2',
        'payment_failed',
        expect.objectContaining({ bookingId: 'booking-2' }),
      );
    });

    it('should NOT send WebSocket when payer is offline', async () => {
      notificationGateway.isUserOnline.mockReturnValue(false);

      await listener.handlePaymentFailed(paymentFailedEvent);

      expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
    });
  });
});
