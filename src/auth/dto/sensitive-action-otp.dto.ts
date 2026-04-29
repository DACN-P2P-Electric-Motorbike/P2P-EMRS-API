import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Length } from 'class-validator';

export enum SensitiveActionPurpose {
  SensitiveProfileChange = 'SENSITIVE_PROFILE_CHANGE',
  FinancialTransaction = 'FINANCIAL_TRANSACTION',
}

export class RequestSensitiveActionOtpDto {
  @ApiProperty({
    enum: SensitiveActionPurpose,
    description: 'Sensitive action that requires two-factor OTP verification',
  })
  @IsEnum(SensitiveActionPurpose)
  @IsNotEmpty()
  purpose: SensitiveActionPurpose;
}

export class VerifySensitiveOtpDto {
  @ApiProperty({
    description: '5-digit OTP code sent to the account email',
    example: '12345',
  })
  @IsString()
  @Length(5, 5, { message: 'OTP must be exactly 5 digits' })
  @IsNotEmpty({ message: 'OTP code is required' })
  otp: string;
}
