import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new JwtAuthGuard(reflector);
  });

  it('allows public routes without invoking passport', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = { getHandler: jest.fn(), getClass: jest.fn() } as any;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('returns authenticated users and rejects invalid requests', () => {
    const user = { id: 'user-1' };

    expect(guard.handleRequest(null, user, null)).toBe(user);
    expect(() => guard.handleRequest(null, null, null)).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.handleRequest(new Error('boom'), null, null)).toThrow(
      'boom',
    );
  });
});
