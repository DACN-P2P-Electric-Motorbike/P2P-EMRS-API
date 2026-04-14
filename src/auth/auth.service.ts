import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto, LoginDto } from './dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  ForgotPasswordDto,
  VerifyOtpDto,
  ResetPasswordDto,
  OtpResponseDto,
  VerifyOtpResponseDto,
  ResetPasswordResponseDto,
} from './dto/forgot-password.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserEntity } from './entities/user.entity';
import { UserRole, UserStatus, OtpType } from '@prisma/client';
import { CreateVehicleDto, VehiclesService } from 'src/vehicles';
import { NewUserRegisteredEvent } from '../events/admin.events';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: UserRole[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 10;
  private readonly OTP_EXPIRY_MINUTES = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly vehiclesService: VehiclesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Hash password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Compare password with hashed password
   */
  private async comparePassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  /**
   * Generate JWT access token
   */
  private generateAccessToken(user: {
    id: string;
    email: string;
    roles: UserRole[];
  }): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
    };
    return this.jwtService.sign(payload);
  }

  /**
   * Generate 5-digit OTP code
   * Security: Uses cryptographically secure random number generation
   * Math.random() is NOT suitable for security-sensitive operations
   */
  private generateOtpCode(): string {
    // randomInt(10000, 100000) returns a random integer in range [10000, 99999]
    return randomInt(10000, 100000).toString();
  }

  /**
   * Register a new user
   */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    this.logger.log(`Attempting to register user with email: ${dto.email}`);

    // Check if email already exists
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingEmail) {
      throw new ConflictException('Email already registered');
    }

    // Check if phone already exists
    const existingPhone = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingPhone) {
      throw new ConflictException('Phone number already registered');
    }

    // Check if ID card number already exists (if provided)
    if (dto.idCardNum) {
      const existingIdCard = await this.prisma.user.findUnique({
        where: { idCardNum: dto.idCardNum },
      });

      if (existingIdCard) {
        throw new ConflictException('ID card number already registered');
      }
    }

    // Hash password
    const hashedPassword = await this.hashPassword(dto.password);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        fullName: dto.fullName,
        phone: dto.phone,
        roles: dto.roles || ['RENTER'],
        idCardNum: dto.idCardNum,
        address: dto.address,
        status: UserStatus.ACTIVE,
        trustScore: 100,
      },
    });

    this.logger.log(`Successfully registered user: ${user.id}`);

    // Emit admin alert event
    this.eventEmitter.emit(
      'user.registered',
      new NewUserRegisteredEvent(user.id, user.fullName, user.email),
    );

    // Generate access token
    const accessToken = this.generateAccessToken(user);

    // Return user entity (without password) and token
    const userEntity = UserEntity.fromPrisma(user);
    return new AuthResponseDto(userEntity, accessToken);
  }

  /**
   * Login user with email and password
   */
  async login(dto: LoginDto): Promise<AuthResponseDto> {
    this.logger.log(`Attempting login for email: ${dto.email}`);

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await this.comparePassword(
      dto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if user is blocked
    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException(
        'Your account has been blocked. Please contact support.',
      );
    }

    this.logger.log(`Successfully logged in user: ${user.id}`);

    // Generate access token
    const accessToken = this.generateAccessToken(user);

    // Return user entity (without password) and token
    const userEntity = UserEntity.fromPrisma(user);
    return new AuthResponseDto(userEntity, accessToken);
  }

  /**
   * Validate user by ID (used by JWT strategy)
   */
  async validateUserById(userId: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.status === UserStatus.BLOCKED) {
      return null;
    }

    return UserEntity.fromPrisma(user);
  }

  /**
   * Get user profile by ID
   */
  async getProfile(userId: string): Promise<UserEntity> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return UserEntity.fromPrisma(user);
  }

  /**
   * Send OTP for password reset
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<OtpResponseDto> {
    this.logger.log(`Password reset requested for email: ${dto.email}`);

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('No account found with this email address');
    }

    // Invalidate any existing OTPs for this user
    await this.prisma.otpCode.updateMany({
      where: {
        userId: user.id,
        type: OtpType.PASSWORD_RESET,
        isUsed: false,
      },
      data: {
        isUsed: true,
      },
    });

    // Generate new OTP
    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(
      Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    // Save OTP to database
    await this.prisma.otpCode.create({
      data: {
        code: otpCode,
        type: OtpType.PASSWORD_RESET,
        expiresAt,
        userId: user.id,
      },
    });

    // Send email with OTP code
    const emailSent = await this.mailService.sendPasswordResetOtp(
      dto.email,
      otpCode,
      user.fullName,
    );

    // Log OTP for development (when email is not configured)
    if (!emailSent) {
      this.logger.log(`OTP for ${dto.email}: ${otpCode}`);
    }

    return {
      message: emailSent
        ? `OTP has been sent to your email. Valid for ${this.OTP_EXPIRY_MINUTES} minutes.`
        : `OTP has been sent to your email. Valid for ${this.OTP_EXPIRY_MINUTES} minutes. (Dev mode: OTP is ${otpCode})`,
      email: dto.email,
    };
  }

  /**
   * Verify OTP code
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<VerifyOtpResponseDto> {
    this.logger.log(`Verifying OTP for email: ${dto.email}`);

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('No account found with this email address');
    }

    // Find valid OTP
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        code: dto.otp,
        type: OtpType.PASSWORD_RESET,
        isUsed: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    return {
      message: 'OTP verified successfully',
      valid: true,
    };
  }

  /**
   * Reset password with OTP
   */
  async resetPassword(
    dto: ResetPasswordDto,
  ): Promise<ResetPasswordResponseDto> {
    this.logger.log(`Resetting password for email: ${dto.email}`);

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('No account found with this email address');
    }

    // Find and validate OTP
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        code: dto.otp,
        type: OtpType.PASSWORD_RESET,
        isUsed: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(dto.newPassword);

    // Update password and mark OTP as used
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { isUsed: true },
      }),
    ]);

    this.logger.log(`Password reset successful for user: ${user.id}`);

    return {
      message: 'Password has been reset successfully',
      success: true,
    };
  }

  // src/users/users.service.ts

  /**
   * Update the profile of the authenticated user
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserEntity> {
    // If phone is being updated, check uniqueness
    if (dto.phone) {
      const existing = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Phone number is already in use');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (dto.fullName !== undefined) updateData.fullName = dto.fullName;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.avatarUrl !== undefined) updateData.avatarUrl = dto.avatarUrl;
    if (dto.address !== undefined) updateData.address = dto.address;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    this.logger.log(`Profile updated for user ${userId}`);
    return UserEntity.fromPrisma(user);
  }

  async becomeOwner(
    userId: string,
    roles: UserRole[],
    vehicleData: CreateVehicleDto,
  ): Promise<any> {
    // 0. Return if OWNER
    if (roles.includes(UserRole.OWNER))
      return {
        message: 'User has been OWNER',
      };

    // 1. Add OWNER role to user
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        roles: {
          push: UserRole.OWNER, // Add OWNER to roles array
        },
      },
    });

    // 2. Generate new JWT with updated roles
    const newToken = this.generateAccessToken(user);

    return {
      user: {
        id: user.id,
        roles: user.roles,
      },
      accessToken: newToken,
      message: 'Successfully upgraded to OWNER',
    };
  }
}
