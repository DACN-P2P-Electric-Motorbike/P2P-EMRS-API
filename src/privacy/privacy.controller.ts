import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrivacyService } from './privacy.service';

@ApiTags('Privacy')
@Controller('privacy')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get('export')
  @ApiOperation({
    summary: 'Export current user personal data',
    description:
      'Supports personal-data access rights under Vietnam Decree 13/2023/ND-CP. Exact GPS coordinates are not included in exports.',
  })
  @ApiResponse({ status: 200, description: 'Personal data export' })
  async exportPersonalData(@CurrentUser('id') userId: string) {
    return this.privacyService.exportPersonalData(userId);
  }

  @Post('delete-request')
  @ApiOperation({
    summary: 'Request account deletion',
    description:
      'Creates a deletion request with a 72-hour SLA for processing under Vietnam personal-data rules.',
  })
  @ApiResponse({ status: 201, description: 'Deletion request created' })
  async requestAccountDeletion(@CurrentUser('id') userId: string) {
    return this.privacyService.requestAccountDeletion(userId);
  }

  @Get('requests')
  @ApiOperation({
    summary: 'List current user privacy requests',
  })
  @ApiResponse({ status: 200, description: 'Privacy request list' })
  async getMyRequests(@CurrentUser('id') userId: string) {
    return this.privacyService.getMyRequests(userId);
  }
}
