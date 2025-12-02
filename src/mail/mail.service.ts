import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly isEmailEnabled: boolean;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {
    // Check if email is configured
    this.isEmailEnabled = !!this.configService.get<string>('EMAIL_USER');
  }

  /**
   * Send OTP code for password reset
   */
  async sendPasswordResetOtp(email: string, otp: string, fullName: string): Promise<boolean> {
    if (!this.isEmailEnabled) {
      this.logger.warn(`Email not configured. OTP for ${email}: ${otp}`);
      return false;
    }

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Password Reset - Dream Ride',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset</title>
          </head>
          <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f7fa;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="background-color: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Logo -->
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #4A6CF7; font-size: 28px; font-style: italic; margin: 0;">
                    DREAM<br>RI<span style="font-size: 24px;">🏍️</span>E
                  </h1>
                </div>
                
                <!-- Content -->
                <h2 style="color: #1E2A3B; font-size: 24px; margin-bottom: 16px; text-align: center;">
                  Password Reset Request
                </h2>
                
                <p style="color: #6B7B8F; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  Hi ${fullName},
                </p>
                
                <p style="color: #6B7B8F; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  We received a request to reset your password. Use the verification code below to proceed:
                </p>
                
                <!-- OTP Code -->
                <div style="background-color: #f5f7fa; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                  <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #4A6CF7;">
                    ${otp}
                  </span>
                </div>
                
                <p style="color: #6B7B8F; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                  This code will expire in <strong>10 minutes</strong>.
                </p>
                
                <p style="color: #6B7B8F; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                  If you didn't request a password reset, please ignore this email or contact support if you have concerns.
                </p>
                
                <!-- Footer -->
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
                
                <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
                  © ${new Date().getFullYear()} Dream Ride. All rights reserved.<br>
                  P2P Electric Motorbike Rental Platform
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      });

      this.logger.log(`Password reset OTP sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}`, error);
      return false;
    }
  }

  /**
   * Send welcome email after registration
   */
  async sendWelcomeEmail(email: string, fullName: string): Promise<boolean> {
    if (!this.isEmailEnabled) {
      this.logger.warn(`Email not configured. Skipping welcome email for ${email}`);
      return false;
    }

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Welcome to Dream Ride! 🏍️',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to Dream Ride</title>
          </head>
          <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f7fa;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="background-color: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Logo -->
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #4A6CF7; font-size: 28px; font-style: italic; margin: 0;">
                    DREAM<br>RI<span style="font-size: 24px;">🏍️</span>E
                  </h1>
                </div>
                
                <!-- Content -->
                <h2 style="color: #1E2A3B; font-size: 24px; margin-bottom: 16px; text-align: center;">
                  Welcome to Dream Ride! 🎉
                </h2>
                
                <p style="color: #6B7B8F; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  Hi ${fullName},
                </p>
                
                <p style="color: #6B7B8F; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  Thank you for joining Dream Ride - Vietnam's premier P2P electric motorbike rental platform!
                </p>
                
                <p style="color: #6B7B8F; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  With Dream Ride, you can:
                </p>
                
                <ul style="color: #6B7B8F; font-size: 16px; line-height: 1.8; margin-bottom: 24px;">
                  <li>🔋 Rent eco-friendly electric motorbikes</li>
                  <li>💰 Earn money by sharing your bike</li>
                  <li>🌱 Contribute to a greener Vietnam</li>
                </ul>
                
                <!-- Footer -->
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
                
                <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
                  © ${new Date().getFullYear()} Dream Ride. All rights reserved.<br>
                  P2P Electric Motorbike Rental Platform
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      });

      this.logger.log(`Welcome email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}`, error);
      return false;
    }
  }
}

