import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Res,
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
import { OwnerEarningsDto } from './dto/owner-earnings.dto';
import { VerifySensitiveOtpDto } from '../auth/dto/sensitive-action-otp.dto';
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
    description:
      'Handle redirect after PayOS payment — serves HTML that notifies the Flutter tab',
  })
  async payosReturn(
    @Query() query: Record<string, string>,
    @Res() res: any,
  ): Promise<void> {
    const result = await this.paymentsService.handlePayOSReturn(query);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(this._buildPaymentResultHtml(result.status, result.bookingId));
  }

  @Public()
  @Get('payos-cancel')
  @ApiOperation({
    summary: 'PayOS cancel callback',
    description: 'Handle redirect after PayOS payment cancellation',
  })
  async payosCancel(
    @Query() query: Record<string, string>,
    @Res() res: any,
  ): Promise<void> {
    const result = await this.paymentsService.handlePayOSReturn({
      ...query,
      status: 'CANCELLED',
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(this._buildPaymentResultHtml(result.status, result.bookingId));
  }

  private _buildPaymentResultHtml(status: string, bookingId?: string): string {
    const isSuccess = status === 'success';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4000';
    const fallbackUrl = bookingId
      ? `${frontendUrl}/#/bookings/${bookingId}`
      : `${frontendUrl}/#/bookings`;

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${isSuccess ? 'Thanh toán thành công' : 'Đã huỷ thanh toán'}</title>
  <style>
    body { font-family: sans-serif; display: flex; flex-direction: column;
           align-items: center; justify-content: center; min-height: 100vh;
           margin: 0; background: #f8f9fd; color: #333; }
    .card { background: white; border-radius: 16px; padding: 40px;
            text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,.08); max-width: 360px; }
    .icon { font-size: 64px; }
    h2 { margin: 16px 0 8px; }
    p { color: #888; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? '✅' : '❌'}</div>
    <h2>${isSuccess ? 'Thanh toán thành công!' : 'Đã huỷ thanh toán'}</h2>
    <p>${isSuccess ? 'Giao dịch của bạn đã được xử lý.' : 'Bạn đã huỷ giao dịch.'} Cửa sổ này sẽ tự đóng.</p>
  </div>
  <script>
    const payload = {
      type: 'payos_result',
      status: '${status}',
      bookingId: '${bookingId ?? ''}'
    };
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, '*');
      window.close();
    } else {
      // Opened in same tab or no opener — redirect back to app
      setTimeout(() => { window.location.href = '${fallbackUrl}'; }, 2000);
    }
  </script>
</body>
</html>`;
  }

  @Get('owner-earnings')
  @ApiOperation({
    summary: 'Get owner earnings',
    description:
      'Get earnings summary for the authenticated owner — total earned, platform fees, net earnings, and per-booking breakdown',
  })
  @ApiResponse({
    status: 200,
    description: 'Owner earnings summary',
    type: OwnerEarningsDto,
  })
  async getOwnerEarnings(
    @CurrentUser('id') userId: string,
  ): Promise<OwnerEarningsDto> {
    return this.paymentsService.getOwnerEarnings(
      userId,
    ) as unknown as OwnerEarningsDto;
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
  async simulateSuccess(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<PaymentEntity> {
    return this.paymentsService.simulatePaymentSuccess(id, userId);
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
    @Body() dto: VerifySensitiveOtpDto,
  ): Promise<PaymentEntity> {
    return this.paymentsService.refundPayment(id, userId, dto.otp);
  }
}
