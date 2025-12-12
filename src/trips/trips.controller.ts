import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
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
} from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { TripEntity } from './entities/trip.entity';
import { StartTripDto } from './dto/start-trip.dto';
import { EndTripDto } from './dto/end-trip.dto';
import { ReportIssueDto } from './dto/report-issue.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Trips')
@Controller('trips')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start a trip',
    description: 'Renter starts a trip for a confirmed booking',
  })
  @ApiResponse({
    status: 201,
    description: 'Trip started successfully',
    type: TripEntity,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot start trip - invalid booking status',
  })
  async startTrip(
    @CurrentUser('id') userId: string,
    @Body() dto: StartTripDto,
  ): Promise<TripEntity> {
    return this.tripsService.startTrip(userId, dto);
  }

  @Patch(':id/end')
  @ApiOperation({
    summary: 'End a trip',
    description: 'Renter ends an ongoing trip',
  })
  @ApiParam({
    name: 'id',
    description: 'Trip ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Trip ended successfully',
    type: TripEntity,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot end trip - invalid trip status',
  })
  async endTrip(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: EndTripDto,
  ): Promise<TripEntity> {
    return this.tripsService.endTrip(id, userId, dto);
  }

  @Get('active')
  @ApiOperation({
    summary: 'Get active trip',
    description: 'Get the current ongoing trip for the user',
  })
  @ApiResponse({
    status: 200,
    description: 'Active trip details (null if no active trip)',
    type: TripEntity,
  })
  async getActiveTrip(
    @CurrentUser('id') userId: string,
  ): Promise<TripEntity | null> {
    return this.tripsService.getActiveTrip(userId);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Get trip history',
    description: 'Get completed trips for the user',
  })
  @ApiResponse({
    status: 200,
    description: 'Trip history',
    type: [TripEntity],
  })
  async getTripHistory(
    @CurrentUser('id') userId: string,
  ): Promise<TripEntity[]> {
    return this.tripsService.getTripHistory(userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get trip details',
    description: 'Get detailed information about a specific trip',
  })
  @ApiParam({
    name: 'id',
    description: 'Trip ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Trip details',
    type: TripEntity,
  })
  @ApiResponse({
    status: 404,
    description: 'Trip not found',
  })
  async getTrip(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<TripEntity> {
    return this.tripsService.getTripById(id, userId);
  }

  @Patch(':id/report-issue')
  @ApiOperation({
    summary: 'Report issue during trip',
    description: 'Renter reports an issue encountered during the trip',
  })
  @ApiParam({
    name: 'id',
    description: 'Trip ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Issue reported successfully',
    type: TripEntity,
  })
  async reportIssue(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReportIssueDto,
  ): Promise<TripEntity> {
    return this.tripsService.reportIssue(id, userId, dto);
  }
}
