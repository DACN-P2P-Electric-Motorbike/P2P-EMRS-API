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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AdminUsersService } from '../services/admin-users.service';
import { QueryUsersDto } from '../dto/query-users.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { AdjustTrustScoreDto } from '../dto/adjust-trust-score.dto';

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

  @Get('trust-score/overview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trust score overview (Admin)',
    description:
      'Distribution and alert lists for low score, rapid score drops, and active warnings.',
  })
  @ApiResponse({ status: 200, description: 'Trust score admin overview' })
  async getTrustScoreOverview() {
    const result = await this.usersService.getTrustScoreOverview();
    return { status: 'success', data: result };
  }

  @Get(':id/trust-score')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User trust score detail (Admin)',
    description: 'Current tier, recent score events, and active warnings.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User trust score detail' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserTrustScore(@Param('id') userId: string) {
    const result = await this.usersService.getUserTrustScore(userId);
    return { status: 'success', data: result };
  }

  @Patch(':id/trust-score')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually adjust trust score (Admin)',
    description:
      'Apply a positive or negative trust score delta with a required audit reason.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Trust score adjusted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async adjustTrustScore(
    @Param('id') userId: string,
    @Body() dto: AdjustTrustScoreDto,
    @CurrentUser('id') adminId: string,
  ) {
    const result = await this.usersService.adjustTrustScore(
      userId,
      dto,
      adminId,
    );
    return {
      status: 'success',
      data: result,
      message: 'Trust score adjusted successfully',
    };
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
