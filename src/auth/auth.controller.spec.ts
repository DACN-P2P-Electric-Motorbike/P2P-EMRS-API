/**
 * Unit tests for AuthController.
 * AuthService is fully mocked — each handler delegates to the right service
 * method with the right args (or returns the injected user for profile reads).
 */
import { UserRole } from '@prisma/client';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserEntity } from './entities/user.entity';

describe('AuthController', () => {
  let controller: AuthController;
  let service: jest.Mocked<AuthService>;

  const user = {
    id: 'user-1',
    email: 'user@test.com',
    roles: [UserRole.RENTER],
  } as unknown as UserEntity;

  beforeEach(() => {
    service = {
      register: jest.fn().mockResolvedValue({ accessToken: 'token' }),
      login: jest.fn().mockResolvedValue({ accessToken: 'token' }),
      updateProfile: jest.fn().mockResolvedValue(user),
      requestSensitiveActionOtp: jest
        .fn()
        .mockResolvedValue({ message: 'OTP sent' }),
      forgotPassword: jest.fn().mockResolvedValue({ message: 'OTP sent' }),
      verifyOtp: jest.fn().mockResolvedValue({ verified: true }),
      resetPassword: jest.fn().mockResolvedValue({ message: 'reset' }),
      becomeOwner: jest.fn().mockResolvedValue({ id: 'vehicle-1' }),
    } as unknown as jest.Mocked<AuthService>;

    controller = new AuthController(service);
  });

  it('POST /register delegates to AuthService.register', async () => {
    const dto = { email: 'a@test.com', password: 'pw' } as any;

    await expect(controller.register(dto)).resolves.toEqual({
      accessToken: 'token',
    });
    expect(service.register).toHaveBeenCalledWith(dto);
  });

  it('POST /login delegates to AuthService.login', async () => {
    const dto = { email: 'a@test.com', password: 'pw' } as any;

    await expect(controller.login(dto)).resolves.toEqual({
      accessToken: 'token',
    });
    expect(service.login).toHaveBeenCalledWith(dto);
  });

  it('GET /profile returns the current user without calling the service', async () => {
    await expect(controller.getProfile(user)).resolves.toBe(user);
  });

  it('PATCH /profile delegates to AuthService.updateProfile', async () => {
    const dto = { fullName: 'New Name' } as any;

    await expect(controller.updateProfile('user-1', dto)).resolves.toBe(user);
    expect(service.updateProfile).toHaveBeenCalledWith('user-1', dto);
  });

  it('POST /request-sensitive-otp delegates to AuthService.requestSensitiveActionOtp', async () => {
    const dto = { action: 'REFUND' } as any;

    await expect(
      controller.requestSensitiveOtp('user-1', dto),
    ).resolves.toEqual({ message: 'OTP sent' });
    expect(service.requestSensitiveActionOtp).toHaveBeenCalledWith(
      'user-1',
      dto,
    );
  });

  it('POST /forgot-password delegates to AuthService.forgotPassword', async () => {
    const dto = { email: 'a@test.com' } as any;

    await expect(controller.forgotPassword(dto)).resolves.toEqual({
      message: 'OTP sent',
    });
    expect(service.forgotPassword).toHaveBeenCalledWith(dto);
  });

  it('POST /verify-otp delegates to AuthService.verifyOtp', async () => {
    const dto = { email: 'a@test.com', otp: '123456' } as any;

    await expect(controller.verifyOtp(dto)).resolves.toEqual({
      verified: true,
    });
    expect(service.verifyOtp).toHaveBeenCalledWith(dto);
  });

  it('POST /reset-password delegates to AuthService.resetPassword', async () => {
    const dto = { email: 'a@test.com', otp: '123456', password: 'new' } as any;

    await expect(controller.resetPassword(dto)).resolves.toEqual({
      message: 'reset',
    });
    expect(service.resetPassword).toHaveBeenCalledWith(dto);
  });

  it('POST /become-owner delegates id, roles, and vehicle data to AuthService.becomeOwner', async () => {
    const vehicleData = { licensePlate: '59A-12345' } as any;

    await expect(controller.becomeOwner(user, vehicleData)).resolves.toEqual({
      id: 'vehicle-1',
    });
    expect(service.becomeOwner).toHaveBeenCalledWith(
      user.id,
      user.roles,
      vehicleData,
    );
  });
});
