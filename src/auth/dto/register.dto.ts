import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
  IsEnum,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    description: 'User password (minimum 6 characters)',
    example: 'password123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiProperty({
    description: 'Full name of the user',
    example: 'Nguyen Van A',
  })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  fullName: string;

  @ApiProperty({
    description: 'Vietnamese phone number',
    example: '+84912345678',
  })
  @IsPhoneNumber('VN', { message: 'Please provide a valid Vietnamese phone number' })
  @IsNotEmpty({ message: 'Phone number is required' })
  phone: string;

  @ApiPropertyOptional({
    description: 'User role (defaults to RENTER)',
    enum: UserRole,
    default: UserRole.RENTER,
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'Role must be RENTER, OWNER, or ADMIN' })
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Vietnamese ID card number (CCCD/CMND)',
    example: '012345678901',
  })
  @IsOptional()
  @IsString()
  idCardNum?: string;

  @ApiPropertyOptional({
    description: 'User address',
    example: '123 Nguyen Trai, Quan 1, TP.HCM',
  })
  @IsOptional()
  @IsString()
  address?: string;
}

