import {
  Controller,
  Post,
  Get,
  Body,
  Param,
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
import { PaymentsService } from './payments.service';
import { PaymentEntity } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create payment',
    description: 'Create payment for a confirmed booking',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment created successfully',
    type: PaymentEntity,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid payment data',
  })
  async createPayment(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePaymentDto,
  ): Promise<PaymentEntity> {
    return this.paymentsService.createPayment(userId, dto);
  }

  @Get('by-booking')
  @ApiOperation({
    summary: 'Get payment by booking',
    description: 'Get payment details for a specific booking',
  })
  @ApiQuery({
    name: 'bookingId',
    description: 'Booking ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment details',
    type: PaymentEntity,
  })
  async getPaymentByBooking(
    @Query('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
  ): Promise<PaymentEntity | null> {
    return this.paymentsService.getPaymentByBookingId(bookingId, userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get payment details',
    description: 'Get detailed information about a specific payment',
  })
  @ApiParam({
    name: 'id',
    description: 'Payment ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment details',
    type: PaymentEntity,
  })
  @ApiResponse({
    status: 404,
    description: 'Payment not found',
  })
  async getPayment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<PaymentEntity> {
    return this.paymentsService.getPaymentById(id, userId);
  }

  @Post(':id/simulate-success')
  @ApiOperation({
    summary: 'Simulate payment success (DEV ONLY)',
    description: 'Simulate successful payment for testing',
  })
  @ApiParam({
    name: 'id',
    description: 'Payment ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment marked as successful',
    type: PaymentEntity,
  })
  async simulateSuccess(@Param('id') id: string): Promise<PaymentEntity> {
    return this.paymentsService.simulatePaymentSuccess(id);
  }
}
