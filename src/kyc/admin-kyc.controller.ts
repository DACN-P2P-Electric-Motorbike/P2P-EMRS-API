import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { KycStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { QueryKycDto, ReviewKycDto } from './dto';
import { KycService } from './kyc.service';
import { KycVerificationEntity } from './entities/kyc-verification.entity';

@ApiTags('Admin - KYC')
@Controller('admin/kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminKycController {
  constructor(private readonly kycService: KycService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List KYC submissions for admin review' })
  @ApiQuery({ name: 'status', enum: KycStatus, required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated KYC submissions' })
  async list(@Query() query: QueryKycDto) {
    const result = await this.kycService.listForAdmin(query);
    return { status: 'success', data: result };
  }

  @Patch(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a KYC submission' })
  @ApiParam({ name: 'id', description: 'KYC verification UUID' })
  @ApiResponse({
    status: 200,
    description: 'KYC reviewed',
    type: KycVerificationEntity,
  })
  async review(
    @Param('id') id: string,
    @Body() dto: ReviewKycDto,
    @CurrentUser('id') adminId: string,
  ) {
    const reviewed = await this.kycService.review(id, dto, adminId);
    return {
      status: 'success',
      data: reviewed,
      message: 'KYC reviewed successfully',
    };
  }
}
