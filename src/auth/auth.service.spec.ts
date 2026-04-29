import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MailService } from '../mail/mail.service';
import { VehiclesService } from '../vehicles';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { OtpType, UserRole, UserStatus } from '@prisma/client';
import { CryptoService } from '../security/crypto.service';
import { SensitiveActionPurpose } from './dto/sensitive-action-otp.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-1';
const OTHER_ID = 'user-uuid-2';

const makePrismaUser = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  email: 'test@example.com',
  fullName: 'Test User',
  phone: null,
  idCardNum: null,
  avatarUrl: null,
  address: null,
  roles: [UserRole.RENTER],
  status: UserStatus.ACTIVE,
  trustScore: 80,
  passwordHash: 'hashed',
  otpHash: null,
  otpExpiry: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = () => ({
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  otpCode: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  vehicle: { create: jest.fn() },
});

const mockJwt = () => ({
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
});

const mockMail = () => ({
  sendOtp: jest.fn().mockResolvedValue(undefined),
  sendWelcome: jest.fn().mockResolvedValue(undefined),
  sendSensitiveActionOtp: jest.fn().mockResolvedValue(true),
});

const mockVehiclesService = () => ({
  registerVehicle: jest.fn(),
});

const mockEventEmitter = () => ({
  emit: jest.fn(),
});

const mockCrypto = () => ({
  tryDecryptString: jest.fn((value: string | null) => value),
  maskSensitive: jest.fn((value: string | null) => value),
  encryptStringDeterministic: jest.fn((value: string) => `enc:${value}`),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthService — updateProfile', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof mockPrisma>;
  let mail: ReturnType<typeof mockMail>;

  beforeEach(async () => {
    prisma = mockPrisma();
    mail = mockMail();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: mockJwt() },
        { provide: MailService, useValue: mail },
        { provide: VehiclesService, useValue: mockVehiclesService() },
        { provide: EventEmitter2, useValue: mockEventEmitter() },
        { provide: CryptoService, useValue: mockCrypto() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // =========================================================================
  // Success cases
  // =========================================================================

  it('should update fullName only when only fullName is provided', async () => {
    const dto: UpdateProfileDto = { fullName: 'New Name' };
    prisma.user.update.mockResolvedValue(
      makePrismaUser({ fullName: 'New Name' }),
    );

    const result = await service.updateProfile(USER_ID, dto);

    expect(prisma.user.findUnique).not.toHaveBeenCalled(); // no phone check
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { fullName: 'New Name' },
    });
    expect(result.fullName).toBe('New Name');
  });

  it('should update all fields when all are provided', async () => {
    const dto: UpdateProfileDto = {
      fullName: 'Full Name',
      phone: '0901234567',
      avatarUrl: 'https://example.com/avatar.png',
      address: '123 Main St',
      otp: '12345',
    };

    prisma.user.findUnique
      .mockResolvedValueOnce(makePrismaUser({ phone: '0900000000' }))
      .mockResolvedValueOnce(null); // phone not taken
    prisma.otpCode.findFirst.mockResolvedValue({ id: 'otp-1' });
    prisma.otpCode.update.mockResolvedValue({ id: 'otp-1', isUsed: true });
    prisma.user.update.mockResolvedValue(
      makePrismaUser({
        fullName: dto.fullName,
        phone: dto.phone,
        avatarUrl: dto.avatarUrl,
        address: dto.address,
      }),
    );

    const result = await service.updateProfile(USER_ID, dto);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: {
        fullName: 'Full Name',
        phone: '0901234567',
        avatarUrl: 'https://example.com/avatar.png',
        address: '123 Main St',
      },
    });
    expect(result.phone).toBe('0901234567');
  });

  it('should allow updating phone to one that the SAME user already has', async () => {
    const dto: UpdateProfileDto = { phone: '0901234567' };
    // findUnique returns the same user (not a conflict)
    prisma.user.findUnique.mockResolvedValue(
      makePrismaUser({ phone: '0901234567' }),
    );
    prisma.user.update.mockResolvedValue(
      makePrismaUser({ phone: '0901234567' }),
    );

    await expect(service.updateProfile(USER_ID, dto)).resolves.toBeDefined();
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('should not include undefined fields in the update data', async () => {
    const dto: UpdateProfileDto = {
      avatarUrl: 'https://cdn.example.com/pic.jpg',
    };
    prisma.user.update.mockResolvedValue(
      makePrismaUser({ avatarUrl: dto.avatarUrl }),
    );

    await service.updateProfile(USER_ID, dto);

    const updateCall = prisma.user.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('fullName');
    expect(updateCall.data).not.toHaveProperty('phone');
    expect(updateCall.data).not.toHaveProperty('address');
    expect(updateCall.data.avatarUrl).toBe(dto.avatarUrl);
  });

  // =========================================================================
  // Phone uniqueness guard
  // =========================================================================

  it('should throw ConflictException when phone is already taken by another user', async () => {
    const dto: UpdateProfileDto = { phone: '0901234567', otp: '12345' };
    prisma.user.findUnique
      .mockResolvedValueOnce(makePrismaUser({ phone: '0900000000' }))
      .mockResolvedValueOnce(
        makePrismaUser({ id: OTHER_ID, phone: '0901234567' }),
      );
    prisma.otpCode.findFirst.mockResolvedValue({ id: 'otp-1' });
    prisma.otpCode.update.mockResolvedValue({ id: 'otp-1', isUsed: true });

    await expect(service.updateProfile(USER_ID, dto)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('should check phone uniqueness when phone field is present', async () => {
    const dto: UpdateProfileDto = { phone: '0912345678', otp: '12345' };
    prisma.user.findUnique
      .mockResolvedValueOnce(makePrismaUser({ phone: '0900000000' }))
      .mockResolvedValueOnce(null);
    prisma.otpCode.findFirst.mockResolvedValue({ id: 'otp-1' });
    prisma.otpCode.update.mockResolvedValue({ id: 'otp-1', isUsed: true });
    prisma.user.update.mockResolvedValue(makePrismaUser());

    await service.updateProfile(USER_ID, dto);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { phone: dto.phone },
    });
  });

  it('should require OTP when changing phone', async () => {
    const dto: UpdateProfileDto = { phone: '0912345678' };
    prisma.user.findUnique.mockResolvedValue(
      makePrismaUser({ phone: '0900000000' }),
    );

    await expect(service.updateProfile(USER_ID, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('should require OTP when changing email', async () => {
    const dto: UpdateProfileDto = { email: 'new@example.com' };
    prisma.user.findUnique.mockResolvedValue(
      makePrismaUser({ email: 'old@example.com' }),
    );

    await expect(service.updateProfile(USER_ID, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when email is already taken by another user', async () => {
    const dto: UpdateProfileDto = {
      email: 'taken@example.com',
      otp: '12345',
    };
    prisma.user.findUnique
      .mockResolvedValueOnce(makePrismaUser({ email: 'old@example.com' }))
      .mockResolvedValueOnce(
        makePrismaUser({ id: OTHER_ID, email: 'taken@example.com' }),
      );
    prisma.otpCode.findFirst.mockResolvedValue({ id: 'otp-1' });
    prisma.otpCode.update.mockResolvedValue({ id: 'otp-1', isUsed: true });

    await expect(service.updateProfile(USER_ID, dto)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('should NOT check phone uniqueness when phone is not in the DTO', async () => {
    const dto: UpdateProfileDto = { fullName: 'No Phone' };
    prisma.user.update.mockResolvedValue(makePrismaUser());

    await service.updateProfile(USER_ID, dto);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Return value shape
  // =========================================================================

  it('should return a UserEntity with updated data', async () => {
    const dto: UpdateProfileDto = { fullName: 'Updated Name' };
    prisma.user.update.mockResolvedValue(
      makePrismaUser({ fullName: 'Updated Name' }),
    );

    const result = await service.updateProfile(USER_ID, dto);

    expect(result).toHaveProperty('id', USER_ID);
    expect(result).toHaveProperty('fullName', 'Updated Name');
    expect(result).toHaveProperty('email');
  });

  // =========================================================================
  // Sensitive-action OTP
  // =========================================================================

  it('should request a sensitive profile-change OTP', async () => {
    prisma.user.findUnique.mockResolvedValue(makePrismaUser());
    prisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.otpCode.create.mockResolvedValue({ id: 'otp-2' });

    const result = await service.requestSensitiveActionOtp(USER_ID, {
      purpose: SensitiveActionPurpose.SensitiveProfileChange,
    });

    expect(result.email).toBe('test@example.com');
    expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        type: OtpType.SENSITIVE_PROFILE_CHANGE,
        isUsed: false,
      },
      data: { isUsed: true },
    });
    expect(prisma.otpCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: expect.stringMatching(/^\d{5}$/),
        type: OtpType.SENSITIVE_PROFILE_CHANGE,
        userId: USER_ID,
        expiresAt: expect.any(Date),
      }),
    });
    expect(mail.sendSensitiveActionOtp).toHaveBeenCalledWith(
      'test@example.com',
      expect.stringMatching(/^\d{5}$/),
      'Test User',
      'email or phone change',
    );
  });

  it('should request a financial-transaction OTP', async () => {
    prisma.user.findUnique.mockResolvedValue(makePrismaUser());

    await service.requestSensitiveActionOtp(USER_ID, {
      purpose: SensitiveActionPurpose.FinancialTransaction,
    });

    expect(prisma.otpCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: OtpType.FINANCIAL_TRANSACTION,
      }),
    });
    expect(mail.sendSensitiveActionOtp).toHaveBeenCalledWith(
      'test@example.com',
      expect.any(String),
      'Test User',
      'financial transaction',
    );
  });

  it('should reject sensitive OTP requests for missing users', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.requestSensitiveActionOtp(USER_ID, {
        purpose: SensitiveActionPurpose.SensitiveProfileChange,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });

  it('should verify and mark a sensitive OTP as used', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({ id: 'otp-1' });

    await service.verifySensitiveActionOtp(
      USER_ID,
      '12345',
      OtpType.SENSITIVE_PROFILE_CHANGE,
    );

    expect(prisma.otpCode.findFirst).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        code: '12345',
        type: OtpType.SENSITIVE_PROFILE_CHANGE,
        isUsed: false,
        expiresAt: { gt: expect.any(Date) },
      },
    });
    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'otp-1' },
      data: { isUsed: true },
    });
  });

  it('should reject invalid sensitive OTPs', async () => {
    prisma.otpCode.findFirst.mockResolvedValue(null);

    await expect(
      service.verifySensitiveActionOtp(
        USER_ID,
        '99999',
        OtpType.FINANCIAL_TRANSACTION,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.otpCode.update).not.toHaveBeenCalled();
  });
});
