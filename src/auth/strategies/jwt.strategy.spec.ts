import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let authService: jest.Mocked<AuthService>;

  beforeEach(() => {
    authService = {
      validateUserById: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;
  });

  it('requires JWT_SECRET during construction', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };

    expect(
      () => new JwtStrategy(config as unknown as ConfigService, authService),
    ).toThrow('JWT_SECRET is not defined');
  });

  it('returns validated users and rejects missing users', async () => {
    const config = { get: jest.fn().mockReturnValue('secret') };
    const strategy = new JwtStrategy(
      config as unknown as ConfigService,
      authService,
    );
    const user = { id: 'user-1' } as any;

    authService.validateUserById.mockResolvedValueOnce(user);
    await expect(
      strategy.validate({ sub: 'user-1', email: 'x@y.com' } as any),
    ).resolves.toBe(user);

    authService.validateUserById.mockResolvedValueOnce(null);
    await expect(
      strategy.validate({ sub: 'missing', email: 'x@y.com' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
