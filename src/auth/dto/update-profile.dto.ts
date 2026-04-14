import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsUrl,
  Matches,
} from 'class-validator';

export class UpdateProfileDto {
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
}
