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
import { Public } from '../auth/decorators/public.decorator';

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

  @Public()
  @Post('payos-webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'PayOS webhook',
    description: 'Receive payment status updates from PayOS',
  })
  async payosWebhook(
    @Body() body: Record<string, unknown>,
  ): Promise<{ message: string }> {
    await this.paymentsService.handlePayOSWebhook(body);
    return { message: 'ok' };
  }

  @Public()
  @Get('payos-return')
  @ApiOperation({
    summary: 'PayOS return callback',
    description: 'Handle redirect after PayOS payment',
  })
  async payosReturn(
    @Query() query: Record<string, string>,
  ): Promise<{ message: string; status: string }> {
    const status = await this.paymentsService.handlePayOSReturn(query);
    return { message: 'Payment processed', status };
  }

  @Public()
  @Get('payos-cancel')
  @ApiOperation({
    summary: 'PayOS cancel callback',
    description: 'Handle redirect after PayOS payment cancellation',
  })
  async payosCancel(
    @Query() query: Record<string, string>,
  ): Promise<{ message: string; status: string }> {
    const status = await this.paymentsService.handlePayOSReturn({
      ...query,
      status: 'CANCELLED',
    });
    return { message: 'Payment cancelled', status };
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
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: 200, type: PaymentEntity })
  async simulateSuccess(@Param('id') id: string): Promise<PaymentEntity> {
    return this.paymentsService.simulatePaymentSuccess(id);
  }

  @Post(':id/initiate-payos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate PayOS payment',
    description: 'Generate PayOS checkout URL via bank transfer / QR',
  })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: 200, description: 'PayOS checkout URL and QR code' })
  async initiatePayOS(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ checkoutUrl: string; qrCode: string }> {
    return this.paymentsService.initiatePayOSPayment(id, userId);
  }

  @Post(':id/initiate-momo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate MoMo payment',
    description: 'Generate MoMo sandbox payment URL',
  })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: 200, description: 'MoMo payment URLs' })
  async initiateMoMo(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ paymentUrl: string; deeplink: string }> {
    return this.paymentsService.initiateMoMoPayment(id, userId);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refund payment',
    description: 'Refund a completed payment (deposit return)',
  })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: 200, type: PaymentEntity })
  async refundPayment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<PaymentEntity> {
    return this.paymentsService.refundPayment(id, userId);
  }
}
