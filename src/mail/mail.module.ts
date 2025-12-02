import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const port = configService.get<number>('EMAIL_PORT', 587);
        // Port 465 uses SSL, port 587 uses STARTTLS (secure should be false)
        const secure = port === 465;
        
        return {
          transport: {
            host: configService.get<string>('EMAIL_HOST', 'smtp.gmail.com'),
            port,
            secure, // true for 465, false for other ports
            auth: {
              user: configService.get<string>('EMAIL_USER'),
              pass: configService.get<string>('EMAIL_PASS'),
            },
          },
          defaults: {
            from: configService.get<string>('EMAIL_FROM', '"Dream Ride" <noreply@dreamride.com>'),
          },
        };
      },
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

