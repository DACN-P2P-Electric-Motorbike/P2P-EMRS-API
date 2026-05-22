import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SubmitKycDto } from './dto';
import { KycService } from './kyc.service';
import {
  KycStatusResponse,
  KycVerificationEntity,
} from './entities/kyc-verification.entity';

@ApiTags('KYC')
@Controller('kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit KYC documents for review' })
  @ApiResponse({
    status: 201,
    description: 'KYC submitted',
    type: KycVerificationEntity,
  })
  submit(
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitKycDto,
  ): Promise<KycVerificationEntity> {
    return this.kycService.submit(userId, dto);
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user KYC status' })
  @ApiResponse({ status: 200, description: 'Current KYC status' })
  getStatus(@CurrentUser('id') userId: string): Promise<KycStatusResponse> {
    return this.kycService.getStatus(userId);
  }
}
