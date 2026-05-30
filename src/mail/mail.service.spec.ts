import { Test, TestingModule } from '@nestjs/testing';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

/**
 * Unit tests for MailService.
 * MailerService is mocked — no real SMTP connection is made.
 */
describe('MailService', () => {
  const buildService = async (
    emailUser: string | undefined,
    sendMail: jest.Mock,
  ): Promise<MailService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MailerService, useValue: { sendMail } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'EMAIL_USER' ? emailUser : undefined,
            ),
          },
        },
      ],
    }).compile();

    return module.get<MailService>(MailService);
  };

  describe('when email is not configured', () => {
    let service: MailService;
    let sendMail: jest.Mock;

    beforeEach(async () => {
      sendMail = jest.fn();
      service = await buildService(undefined, sendMail);
    });

    it('skips sending the password reset OTP and returns false', async () => {
      const sent = await service.sendPasswordResetOtp(
        'user@example.com',
        '12345',
        'Test User',
      );
      expect(sent).toBe(false);
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('skips sending the sensitive action OTP and returns false', async () => {
      const sent = await service.sendSensitiveActionOtp(
        'user@example.com',
        '12345',
        'Test User',
        'financial transaction',
      );
      expect(sent).toBe(false);
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('skips the welcome email and returns false', async () => {
      const sent = await service.sendWelcomeEmail(
        'user@example.com',
        'Test User',
      );
      expect(sent).toBe(false);
      expect(sendMail).not.toHaveBeenCalled();
    });
  });

  describe('when email is configured', () => {
    let service: MailService;
    let sendMail: jest.Mock;

    beforeEach(async () => {
      sendMail = jest.fn().mockResolvedValue(undefined);
      service = await buildService('noreply@dreamride.vn', sendMail);
    });

    it('sends the password reset OTP and returns true', async () => {
      const sent = await service.sendPasswordResetOtp(
        'user@example.com',
        '12345',
        'Test User',
      );
      expect(sent).toBe(true);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Password Reset - Dream Ride',
          html: expect.stringContaining('12345'),
        }),
      );
    });

    it('sends the sensitive action OTP with the purpose label and returns true', async () => {
      const sent = await service.sendSensitiveActionOtp(
        'user@example.com',
        '54321',
        'Test User',
        'email or phone change',
      );
      expect(sent).toBe(true);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('email or phone change'),
          html: expect.stringContaining('54321'),
        }),
      );
    });

    it('sends the welcome email and returns true', async () => {
      const sent = await service.sendWelcomeEmail(
        'user@example.com',
        'Test User',
      );
      expect(sent).toBe(true);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Welcome to Dream Ride'),
        }),
      );
    });

    it('returns false when the password reset email fails to send', async () => {
      sendMail.mockRejectedValueOnce(new Error('SMTP down'));
      const sent = await service.sendPasswordResetOtp(
        'user@example.com',
        '12345',
        'Test User',
      );
      expect(sent).toBe(false);
    });

    it('returns false when the sensitive action email fails to send', async () => {
      sendMail.mockRejectedValueOnce(new Error('SMTP down'));
      const sent = await service.sendSensitiveActionOtp(
        'user@example.com',
        '12345',
        'Test User',
        'financial transaction',
      );
      expect(sent).toBe(false);
    });

    it('returns false when the welcome email fails to send', async () => {
      sendMail.mockRejectedValueOnce(new Error('SMTP down'));
      const sent = await service.sendWelcomeEmail(
        'user@example.com',
        'Test User',
      );
      expect(sent).toBe(false);
    });
  });
});
