import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

const makeConfig = (values: Record<string, string | undefined>) =>
  ({
    get: jest.fn((key: string, defaultValue?: unknown) => {
      return values[key] ?? defaultValue;
    }),
  }) as unknown as ConfigService;

const makeMailer = () =>
  ({
    sendMail: jest.fn().mockResolvedValue(undefined),
  }) as unknown as MailerService & { sendMail: jest.Mock };

describe('MailService — sensitive action OTP', () => {
  it('does not attempt SMTP delivery when email is not configured', async () => {
    const mailer = makeMailer();
    const service = new MailService(mailer, makeConfig({}));

    await expect(
      service.sendSensitiveActionOtp(
        'user@example.com',
        '12345',
        'Test User',
        'financial transaction',
      ),
    ).resolves.toBe(false);
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('sends a sensitive-action OTP email when SMTP is configured', async () => {
    const mailer = makeMailer();
    const service = new MailService(
      mailer,
      makeConfig({ EMAIL_USER: 'smtp-user' }),
    );

    await expect(
      service.sendSensitiveActionOtp(
        'user@example.com',
        '12345',
        'Test User',
        'email or phone change',
      ),
    ).resolves.toBe(true);

    expect(mailer.sendMail).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Dream Ride verification code - email or phone change',
      html: expect.stringContaining('12345'),
    });
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('Test User'),
      }),
    );
  });

  it('returns false when SMTP delivery fails', async () => {
    const mailer = makeMailer();
    mailer.sendMail.mockRejectedValue(new Error('SMTP unavailable'));
    const service = new MailService(
      mailer,
      makeConfig({ EMAIL_USER: 'smtp-user' }),
    );

    await expect(
      service.sendSensitiveActionOtp(
        'user@example.com',
        '12345',
        'Test User',
        'financial transaction',
      ),
    ).resolves.toBe(false);
  });
});
