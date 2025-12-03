import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from '../entities/user.entity';

export class AuthResponseDto {
  @ApiProperty({ description: 'User information' })
  user: UserEntity;

  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  constructor(user: UserEntity, accessToken: string) {
    this.user = user;
    this.accessToken = accessToken;
  }
}

