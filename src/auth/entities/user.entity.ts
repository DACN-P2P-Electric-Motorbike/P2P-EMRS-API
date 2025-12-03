import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User, UserRole, UserStatus } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

export class UserEntity implements Omit<User, 'password'> {
  @ApiProperty({ description: 'User unique identifier' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'User email address' })
  @Expose()
  email: string;

  @Exclude()
  password?: string;

  @ApiProperty({ description: 'User full name' })
  @Expose()
  fullName: string;

  @ApiProperty({ description: 'User phone number' })
  @Expose()
  phone: string;

  @ApiPropertyOptional({ description: 'User avatar URL' })
  @Expose()
  avatarUrl: string | null;

  @ApiProperty({ description: 'User role', enum: UserRole })
  @Expose()
  role: UserRole;

  @ApiProperty({ description: 'User status', enum: UserStatus })
  @Expose()
  status: UserStatus;

  @ApiProperty({ description: 'User trust score (0-100)' })
  @Expose()
  trustScore: number;

  @ApiPropertyOptional({ description: 'Vietnamese ID card number' })
  @Expose()
  idCardNum: string | null;

  @ApiPropertyOptional({ description: 'User address' })
  @Expose()
  address: string | null;

  @ApiProperty({ description: 'Account creation timestamp' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(user: User): UserEntity {
    const { password, ...userWithoutPassword } = user;
    return new UserEntity(userWithoutPassword);
  }
}

