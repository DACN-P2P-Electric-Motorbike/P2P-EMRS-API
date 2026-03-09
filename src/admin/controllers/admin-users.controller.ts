import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../../auth/guards';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AdminUsersService } from '../services/admin-users.service';
import { QueryUsersDto } from '../dto/query-users.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';

@ApiTags('Admin – Users')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all users (Admin)',
    description: 'Get paginated list of users. Filter by role and/or status.',
  })
  @ApiQuery({ name: 'role', enum: UserRole, required: false })
  @ApiQuery({ name: 'status', enum: UserStatus, required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated user list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – Admin only' })
  async getUsers(@Query() query: QueryUsersDto) {
    const result = await this.usersService.getUsers(query);
    return { status: 'success', data: result };
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update user status (Admin)',
    description: 'Activate or ban a user account.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User status updated',
    schema: {
      example: {
        status: 'success',
        data: {
          id: 'uuid',
          fullName: 'Nguyen Van A',
          email: '...',
          status: 'BLOCKED',
        },
        message: 'User status updated successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid status value' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserStatus(
    @Param('id') userId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    const updated = await this.usersService.updateUserStatus(userId, dto);
    return {
      status: 'success',
      data: updated,
      message: 'User status updated successfully',
    };
  }
}
