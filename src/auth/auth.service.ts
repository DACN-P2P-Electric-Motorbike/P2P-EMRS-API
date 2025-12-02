import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto, LoginDto } from './dto';
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

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
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
  private generateAccessToken(user: { id: string; email: string; role: UserRole }): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }

  /**
   * Generate 5-digit OTP code
   */
  private generateOtpCode(): string {
    return Math.floor(10000 + Math.random() * 90000).toString();
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
        role: dto.role || UserRole.RENTER,
        idCardNum: dto.idCardNum,
        address: dto.address,
        status: UserStatus.ACTIVE,
        trustScore: 100.0,
      },
    });

    this.logger.log(`Successfully registered user: ${user.id}`);

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
    const isPasswordValid = await this.comparePassword(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if user is blocked
    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Your account has been blocked. Please contact support.');
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
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

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
  async resetPassword(dto: ResetPasswordDto): Promise<ResetPasswordResponseDto> {
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
}
