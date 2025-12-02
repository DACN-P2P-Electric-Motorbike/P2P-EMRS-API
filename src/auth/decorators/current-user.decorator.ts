import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserEntity } from '../entities/user.entity';

/**
 * Custom decorator to extract the current user from the request
 * Usage: @CurrentUser() user: UserEntity
 */
export const CurrentUser = createParamDecorator(
  (data: keyof UserEntity | undefined, ctx: ExecutionContext): UserEntity | any => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UserEntity;

    if (data) {
      return user[data];
    }

    return user;
  },
);

