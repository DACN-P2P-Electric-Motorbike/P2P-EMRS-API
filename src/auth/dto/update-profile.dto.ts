import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsUrl,
  Matches,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Email address. Requires OTP when changed.',
    example: 'nguyenvana@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;

  @ApiPropertyOptional({ description: 'Full name', example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Phone number (10 digits)',
    example: '0912345678',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(0|\+84)[3-9]\d{8}$/, {
    message: 'Phone must be a valid Vietnamese mobile number',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Avatar URL',
    example: 'https://s3.amazonaws.com/bucket/avatar.jpg',
  })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Address',
    example: '123 Lê Lợi, Quận 1, TP.HCM',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({
    description:
      '5-digit OTP required when changing email or phone. Request it from POST /auth/request-sensitive-otp.',
    example: '12345',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/, {
    message: 'OTP must be exactly 5 digits',
  })
  otp?: string;
}
