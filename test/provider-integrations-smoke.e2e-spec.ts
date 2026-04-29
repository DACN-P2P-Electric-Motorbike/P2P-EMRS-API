import * as crypto from 'node:crypto';
import * as nodemailer from 'nodemailer';
import { PayOS } from '@payos/node';

const providerSmokeEnabled = process.env.RUN_PROVIDER_SMOKE === '1';
const describeProvider = providerSmokeEnabled ? describe : describe.skip;
const itSmtp =
  providerSmokeEnabled && process.env.RUN_SMTP_SMOKE === '1' ? it : it.skip;
const itMomo =
  providerSmokeEnabled && process.env.RUN_MOMO_SMOKE === '1' ? it : it.skip;
const itPayos =
  providerSmokeEnabled && process.env.RUN_PAYOS_SMOKE === '1' ? it : it.skip;

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required for provider smoke tests`);
  }
  return value;
};

describeProvider('External provider smoke tests', () => {
  itSmtp('verifies SMTP credentials without sending email', async () => {
    const port = Number(process.env.EMAIL_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST ?? 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: {
        user: requireEnv('EMAIL_USER'),
        pass: requireEnv('EMAIL_PASS'),
      },
    });

    try {
      await expect(transporter.verify()).resolves.toBe(true);
    } finally {
      transporter.close();
    }
  });

  itMomo('creates a MoMo sandbox payment URL', async () => {
    const partnerCode = requireEnv('MOMO_PARTNER_CODE');
    const accessKey = requireEnv('MOMO_ACCESS_KEY');
    const secretKey = requireEnv('MOMO_SECRET_KEY');
    const redirectUrl =
      process.env.MOMO_REDIRECT_URL ?? 'https://example.com/momo-return';
    const ipnUrl = process.env.MOMO_IPN_URL ?? 'https://example.com/momo-ipn';
    const orderId = `${partnerCode}${Date.now()}`;
    const requestId = orderId;
    const amount = '1000';
    const orderInfo = 'DreamRide provider smoke test';
    const requestType = 'payWithMethod';
    const extraData = '';

    const rawSignature =
      `accessKey=${accessKey}` +
      `&amount=${amount}` +
      `&extraData=${extraData}` +
      `&ipnUrl=${ipnUrl}` +
      `&orderId=${orderId}` +
      `&orderInfo=${orderInfo}` +
      `&partnerCode=${partnerCode}` +
      `&redirectUrl=${redirectUrl}` +
      `&requestId=${requestId}` +
      `&requestType=${requestType}`;

    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(rawSignature)
      .digest('hex');

    const response = await fetch(
      'https://test-payment.momo.vn/v2/gateway/api/create',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerCode,
          partnerName: 'DreamRide Smoke',
          storeId: partnerCode,
          requestId,
          amount,
          orderId,
          orderInfo,
          redirectUrl,
          ipnUrl,
          lang: 'vi',
          requestType,
          autoCapture: true,
          extraData,
          orderGroupId: '',
          signature,
        }),
      },
    );

    const data = (await response.json()) as {
      resultCode: number;
      message: string;
      payUrl?: string;
      deeplink?: string;
    };

    expect(data.resultCode).toBe(0);
    expect(data.payUrl).toEqual(expect.stringContaining('http'));
  });

  itPayos('creates a PayOS payment link', async () => {
    const payos = new PayOS({
      clientId: requireEnv('PAYOS_CLIENT_ID'),
      apiKey: requireEnv('PAYOS_API_KEY'),
      checksumKey: requireEnv('PAYOS_CHECKSUM_KEY'),
    });

    const result = (await payos.paymentRequests.create({
      orderCode: Number(`${Date.now()}`.slice(-8)),
      amount: 1000,
      description: 'DreamRide smoke',
      cancelUrl: process.env.PAYOS_CANCEL_URL ?? 'https://example.com/cancel',
      returnUrl: process.env.PAYOS_RETURN_URL ?? 'https://example.com/return',
      items: [{ name: 'Smoke test', quantity: 1, price: 1000 }],
    })) as Record<string, unknown>;

    expect(result.checkoutUrl).toEqual(expect.stringContaining('http'));
  });
});
