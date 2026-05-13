import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

const ALLOWED_USER_STATUSES = [
  UserStatus.ACTIVE,
  UserStatus.RESTRICTED,
  UserStatus.BLOCKED,
] as const;
type AllowedUserStatus = (typeof ALLOWED_USER_STATUSES)[number];

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: ALLOWED_USER_STATUSES,
    description: 'New user status',
    example: 'ACTIVE',
  })
  @IsNotEmpty()
  @IsEnum(ALLOWED_USER_STATUSES, {
    message: 'status must be one of: ACTIVE, RESTRICTED, BLOCKED',
  })
  status: AllowedUserStatus;
}
