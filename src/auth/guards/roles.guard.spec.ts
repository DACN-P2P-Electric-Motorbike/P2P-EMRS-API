import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: RolesGuard;

  const makeContext = (user?: any): any => ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  });

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new RolesGuard(reflector);
  });

  it('allows routes without required roles and users with matching roles', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(undefined);
    expect(guard.canActivate(makeContext())).toBe(true);

    reflector.getAllAndOverride.mockReturnValueOnce([UserRole.ADMIN]);
    expect(
      guard.canActivate(
        makeContext({ roles: [UserRole.RENTER, UserRole.ADMIN] }),
      ),
    ).toBe(true);
  });

  it('rejects missing users or users without required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(makeContext({ roles: [UserRole.RENTER] })),
    ).toThrow('required role(s) [ADMIN] not found');
  });
});
