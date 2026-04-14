import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MailService } from '../mail/mail.service';
import { VehiclesService } from '../vehicles';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserRole, UserStatus } from '@prisma/client';

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
  otp: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
  vehicle: { create: jest.fn() },
});

const mockJwt = () => ({
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
});

const mockMail = () => ({
  sendOtp: jest.fn().mockResolvedValue(undefined),
  sendWelcome: jest.fn().mockResolvedValue(undefined),
});

const mockVehiclesService = () => ({
  registerVehicle: jest.fn(),
});

const mockEventEmitter = () => ({
  emit: jest.fn(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthService — updateProfile', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: mockJwt() },
        { provide: MailService, useValue: mockMail() },
        { provide: VehiclesService, useValue: mockVehiclesService() },
        { provide: EventEmitter2, useValue: mockEventEmitter() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // =========================================================================
  // Success cases
  // =========================================================================

  it('should update fullName only when only fullName is provided', async () => {
    const dto: UpdateProfileDto = { fullName: 'New Name' };
    prisma.user.update.mockResolvedValue(makePrismaUser({ fullName: 'New Name' }));

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
    };

    prisma.user.findUnique.mockResolvedValue(null); // phone not taken
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
    prisma.user.findUnique.mockResolvedValue(makePrismaUser({ phone: '0901234567' }));
    prisma.user.update.mockResolvedValue(makePrismaUser({ phone: '0901234567' }));

    await expect(service.updateProfile(USER_ID, dto)).resolves.toBeDefined();
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('should not include undefined fields in the update data', async () => {
    const dto: UpdateProfileDto = { avatarUrl: 'https://cdn.example.com/pic.jpg' };
    prisma.user.update.mockResolvedValue(makePrismaUser({ avatarUrl: dto.avatarUrl }));

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
    const dto: UpdateProfileDto = { phone: '0901234567' };
    // findUnique returns a DIFFERENT user
    prisma.user.findUnique.mockResolvedValue(makePrismaUser({ id: OTHER_ID, phone: '0901234567' }));

    await expect(service.updateProfile(USER_ID, dto)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('should check phone uniqueness when phone field is present', async () => {
    const dto: UpdateProfileDto = { phone: '0912345678' };
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue(makePrismaUser());

    await service.updateProfile(USER_ID, dto);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { phone: dto.phone },
    });
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
});
