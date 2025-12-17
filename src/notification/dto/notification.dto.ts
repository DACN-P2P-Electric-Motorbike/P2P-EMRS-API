import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class MarkAsReadDto {
  @ApiProperty({
    description: 'Array of notification IDs to mark as read',
    type: [String],
  })
  @IsString({ each: true })
  @IsNotEmpty()
  notificationIds: string[];
}

export class RegisterFcmTokenDto {
  @ApiProperty({
    description: 'FCM device token',
    example: 'fXy...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'Device platform',
    example: 'android',
    enum: ['android', 'ios'],
  })
  @IsString()
  @IsNotEmpty()
  platform: 'android' | 'ios';
}