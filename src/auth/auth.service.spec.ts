import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
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
import { TrustScoreService } from '../trust-score/trust-score.service';

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

const mockTrustScoreService = () => ({
  recordPositiveEvent: jest.fn().mockResolvedValue({ trustScore: 105 }),
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
        { provide: TrustScoreService, useValue: mockTrustScoreService() },
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

  it('should throw UnauthorizedException when the user is missing during an email/phone change', async () => {
    const dto: UpdateProfileDto = { email: 'new@example.com', otp: '12345' };
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.updateProfile(USER_ID, dto)).rejects.toThrow(
      UnauthorizedException,
    );
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

describe('AuthService — becomeOwner', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof mockPrisma>;
  let vehiclesService: ReturnType<typeof mockVehiclesService>;

  const vehicleDto = {
    licensePlate: '51A-12345',
    model: 'Feliz',
    brand: 'VINFAST',
    type: 'ELECTRIC_SCOOTER',
    pricePerHour: 10000,
    pricePerDay: 120000,
    images: ['https://example.com/vehicle.jpg'],
  } as any;

  beforeEach(async () => {
    prisma = mockPrisma();
    vehiclesService = mockVehiclesService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: mockJwt() },
        { provide: MailService, useValue: mockMail() },
        { provide: VehiclesService, useValue: vehiclesService },
        { provide: EventEmitter2, useValue: mockEventEmitter() },
        { provide: CryptoService, useValue: mockCrypto() },
        { provide: TrustScoreService, useValue: mockTrustScoreService() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('does not persist OWNER when vehicle registration is rejected', async () => {
    prisma.user.findUnique.mockResolvedValue(makePrismaUser());
    vehiclesService.registerVehicle.mockRejectedValue(
      new ForbiddenException('KYC verification is required before listing'),
    );

    await expect(
      service.becomeOwner(USER_ID, [UserRole.RENTER], vehicleDto),
    ).rejects.toThrow(ForbiddenException);

    expect(vehiclesService.registerVehicle).toHaveBeenCalledWith(
      USER_ID,
      [UserRole.RENTER, UserRole.OWNER],
      vehicleDto,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.becomeOwner(USER_ID, [UserRole.RENTER], vehicleDto),
    ).rejects.toThrow(NotFoundException);
    expect(vehiclesService.registerVehicle).not.toHaveBeenCalled();
  });

  it('promotes the user only after vehicle registration succeeds', async () => {
    const promotedUser = makePrismaUser({
      roles: [UserRole.RENTER, UserRole.OWNER],
    });
    prisma.user.findUnique.mockResolvedValue(makePrismaUser());
    vehiclesService.registerVehicle.mockResolvedValue({ id: 'vehicle-1' });
    prisma.user.update.mockResolvedValue(promotedUser);

    const result = await service.becomeOwner(
      USER_ID,
      [UserRole.RENTER],
      vehicleDto,
    );

    expect(vehiclesService.registerVehicle).toHaveBeenCalledWith(
      USER_ID,
      [UserRole.RENTER, UserRole.OWNER],
      vehicleDto,
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { roles: [UserRole.RENTER, UserRole.OWNER] },
    });
    expect(
      vehiclesService.registerVehicle.mock.invocationCallOrder[0],
    ).toBeLessThan(prisma.user.update.mock.invocationCallOrder[0]);
    expect(result.user.roles).toEqual([UserRole.RENTER, UserRole.OWNER]);
    expect(result.accessToken).toBe('mock.jwt.token');
    expect(result.vehicle).toEqual({ id: 'vehicle-1' });
  });

  it('returns an auth-shaped response for users that are already owners', async () => {
    prisma.user.findUnique.mockResolvedValue(
      makePrismaUser({ roles: [UserRole.RENTER, UserRole.OWNER] }),
    );

    const result = await service.becomeOwner(
      USER_ID,
      [UserRole.RENTER, UserRole.OWNER],
      vehicleDto,
    );

    expect(vehiclesService.registerVehicle).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      user: {
        id: USER_ID,
        roles: [UserRole.RENTER, UserRole.OWNER],
      },
      accessToken: 'mock.jwt.token',
      message: 'User has been OWNER',
    });
  });
});

describe('AuthService — register / login / OTP flows', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof mockPrisma>;
  let mail: ReturnType<typeof mockMail>;
  let events: ReturnType<typeof mockEventEmitter>;

  beforeEach(async () => {
    prisma = mockPrisma();
    mail = mockMail();
    events = mockEventEmitter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: mockJwt() },
        { provide: MailService, useValue: mail },
        { provide: VehiclesService, useValue: mockVehiclesService() },
        { provide: EventEmitter2, useValue: events },
        { provide: CryptoService, useValue: mockCrypto() },
        { provide: TrustScoreService, useValue: mockTrustScoreService() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // -------------------------------------------------------------------------
  // register
  // -------------------------------------------------------------------------
  describe('register', () => {
    const dto = {
      email: 'new@example.com',
      password: 'Secret123!',
      fullName: 'New User',
      phone: '0912345678',
    } as any;

    it('creates a user and emits a registration event', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // email + phone free
      prisma.user.create.mockResolvedValue(
        makePrismaUser({ id: 'new-id', email: dto.email, phone: dto.phone }),
      );

      const result = await service.register(dto);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: dto.email,
            fullName: dto.fullName,
            phone: dto.phone,
            roles: ['RENTER'],
            status: UserStatus.ACTIVE,
            trustScore: 100,
          }),
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'user.registered',
        expect.objectContaining({ email: dto.email }),
      );
      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.user.email).toBe(dto.email);
    });

    it('rejects a duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(makePrismaUser());

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate phone', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // email free
        .mockResolvedValueOnce(makePrismaUser()); // phone taken

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate ID card number', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // email free
        .mockResolvedValueOnce(null); // phone free
      prisma.user.findFirst.mockResolvedValue(makePrismaUser());

      await expect(
        service.register({ ...dto, idCardNum: '012345678901' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('encrypts the ID card number before persisting', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(makePrismaUser());

      await service.register({ ...dto, idCardNum: '012345678901' });

      const createArg = prisma.user.create.mock.calls[0][0];
      expect(createArg.data.idCardNum).toBe('enc:012345678901');
    });
  });

  // -------------------------------------------------------------------------
  // login
  // -------------------------------------------------------------------------
  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'Secret123!' } as any;

    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an invalid password', async () => {
      const hash = await bcrypt.hash('other-password', 10);
      prisma.user.findUnique.mockResolvedValue(
        makePrismaUser({ password: hash }),
      );

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a blocked account even with valid credentials', async () => {
      const hash = await bcrypt.hash(dto.password, 10);
      prisma.user.findUnique.mockResolvedValue(
        makePrismaUser({ password: hash, status: UserStatus.BLOCKED }),
      );

      await expect(service.login(dto)).rejects.toThrow(
        'Your account has been blocked. Please contact support.',
      );
    });

    it('returns a token for valid credentials', async () => {
      const hash = await bcrypt.hash(dto.password, 10);
      prisma.user.findUnique.mockResolvedValue(
        makePrismaUser({ password: hash }),
      );

      const result = await service.login(dto);

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.user.email).toBe('test@example.com');
    });
  });

  // -------------------------------------------------------------------------
  // validateUserById / getProfile
  // -------------------------------------------------------------------------
  describe('validateUserById', () => {
    it('returns null for a missing user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.validateUserById(USER_ID)).resolves.toBeNull();
    });

    it('returns null for a blocked user', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makePrismaUser({ status: UserStatus.BLOCKED }),
      );
      await expect(service.validateUserById(USER_ID)).resolves.toBeNull();
    });

    it('returns the user entity for an active user', async () => {
      prisma.user.findUnique.mockResolvedValue(makePrismaUser());
      const result = await service.validateUserById(USER_ID);
      expect(result?.id).toBe(USER_ID);
    });
  });

  describe('getProfile', () => {
    it('throws when the user is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile(USER_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns the profile entity', async () => {
      prisma.user.findUnique.mockResolvedValue(makePrismaUser());
      const result = await service.getProfile(USER_ID);
      expect(result.id).toBe(USER_ID);
    });
  });

  // -------------------------------------------------------------------------
  // forgotPassword
  // -------------------------------------------------------------------------
  describe('forgotPassword', () => {
    it('throws when no account matches the email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.forgotPassword({ email: 'nope@example.com' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('invalidates old OTPs, creates a new one and reports email sent', async () => {
      prisma.user.findUnique.mockResolvedValue(makePrismaUser());
      prisma.otpCode.updateMany.mockResolvedValue({ count: 2 });
      prisma.otpCode.create.mockResolvedValue({ id: 'otp-1' });
      mail.sendPasswordResetOtp = jest.fn().mockResolvedValue(true);

      const result = await service.forgotPassword({
        email: 'test@example.com',
      } as any);

      expect(prisma.otpCode.updateMany).toHaveBeenCalled();
      expect(prisma.otpCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: expect.stringMatching(/^\d{5}$/),
          type: OtpType.PASSWORD_RESET,
        }),
      });
      expect(result.message).not.toContain('Dev mode');
      expect(result.email).toBe('test@example.com');
    });

    it('includes the dev-mode OTP when the email could not be sent', async () => {
      prisma.user.findUnique.mockResolvedValue(makePrismaUser());
      prisma.otpCode.updateMany.mockResolvedValue({ count: 0 });
      prisma.otpCode.create.mockResolvedValue({ id: 'otp-1' });
      mail.sendPasswordResetOtp = jest.fn().mockResolvedValue(false);

      const result = await service.forgotPassword({
        email: 'test@example.com',
      } as any);

      expect(result.message).toContain('Dev mode');
    });
  });

  describe('requestSensitiveActionOtp dev-mode fallback', () => {
    it('logs the OTP and reports dev mode when email delivery fails', async () => {
      prisma.user.findUnique.mockResolvedValue(makePrismaUser());
      prisma.otpCode.updateMany.mockResolvedValue({ count: 0 });
      prisma.otpCode.create.mockResolvedValue({ id: 'otp-2' });
      mail.sendSensitiveActionOtp = jest.fn().mockResolvedValue(false);

      const result = await service.requestSensitiveActionOtp(USER_ID, {
        purpose: SensitiveActionPurpose.SensitiveProfileChange,
      });

      expect(result.message).toContain('Dev mode');
    });
  });

  // -------------------------------------------------------------------------
  // verifyOtp
  // -------------------------------------------------------------------------
  describe('verifyOtp', () => {
    it('throws when the account does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.verifyOtp({ email: 'nope@example.com', otp: '12345' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws on an invalid/expired OTP', async () => {
      prisma.user.findUnique.mockResolvedValue(makePrismaUser());
      prisma.otpCode.findFirst.mockResolvedValue(null);
      await expect(
        service.verifyOtp({ email: 'test@example.com', otp: '00000' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('confirms a valid OTP', async () => {
      prisma.user.findUnique.mockResolvedValue(makePrismaUser());
      prisma.otpCode.findFirst.mockResolvedValue({ id: 'otp-1' });
      const result = await service.verifyOtp({
        email: 'test@example.com',
        otp: '12345',
      } as any);
      expect(result.valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // resetPassword
  // -------------------------------------------------------------------------
  describe('resetPassword', () => {
    const dto = {
      email: 'test@example.com',
      otp: '12345',
      newPassword: 'BrandNew123!',
    } as any;

    it('throws when the account does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword(dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws on an invalid/expired OTP', async () => {
      prisma.user.findUnique.mockResolvedValue(makePrismaUser());
      prisma.otpCode.findFirst.mockResolvedValue(null);
      await expect(service.resetPassword(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('hashes the new password and consumes the OTP in a transaction', async () => {
      prisma.user.findUnique.mockResolvedValue(makePrismaUser());
      prisma.otpCode.findFirst.mockResolvedValue({ id: 'otp-1' });
      const txSpy = jest.fn().mockResolvedValue([]);
      (prisma as any).$transaction = txSpy;

      const result = await service.resetPassword(dto);

      expect(txSpy).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });
  });
});
