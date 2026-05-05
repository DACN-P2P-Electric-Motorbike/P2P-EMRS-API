import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
  UserStatus,
  VehicleBrand,
  VehicleStatus,
  VehicleType,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

const describeLive =
  process.env.RUN_LIVE_SMOKE === '1' ? describe : describe.skip;

const assertSmokeDatabaseUrl = () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for live smoke tests');
  }

  const parsed = new URL(databaseUrl);
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(
    parsed.hostname,
  );
  const databaseName = parsed.pathname.replace(/^\//, '');
  if (!isLocalHost || !databaseName.includes('smoke')) {
    throw new Error(
      'Live smoke tests require a local PostgreSQL database whose name includes "smoke"',
    );
  }
};

const parseDevOtp = (message: string): string => {
  const match = message.match(/OTP is (\d{5})/);
  if (!match) {
    throw new Error(`Could not parse dev OTP from message: ${message}`);
  }
  return match[1];
};

describeLive('Security/privacy live smoke (local PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = Date.now();
  const renterEmail = `renter-${suffix}@smoke.local`;
  const updatedEmail = `renter-updated-${suffix}@smoke.local`;
  const ownerEmail = `owner-${suffix}@smoke.local`;
  const renterPhone = `091${String(suffix).slice(-7)}`;
  const ownerPhone = `092${String(suffix).slice(-7)}`;
  let token: string;
  let renterId: string;

  beforeAll(async () => {
    assertSmokeDatabaseUrl();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@smoke.local' } },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@smoke.local' } },
    });
    await app.close();
  });

  it('registers, requests sensitive OTP, updates email, exports data, and creates a deletion request', async () => {
    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: renterEmail,
        password: 'Password123!',
        fullName: 'Smoke Renter',
        phone: renterPhone,
        roles: [UserRole.RENTER],
        idCardNum: `079${String(suffix).slice(-9)}`,
        address: 'Smoke address',
      })
      .expect(201);

    token = register.body.accessToken;
    renterId = register.body.user.id;

    const otpResponse = await request(app.getHttpServer())
      .post('/auth/request-sensitive-otp')
      .set('Authorization', `Bearer ${token}`)
      .send({ purpose: 'SENSITIVE_PROFILE_CHANGE' })
      .expect(200);

    const otp = parseDevOtp(otpResponse.body.message);

    await request(app.getHttpServer())
      .patch('/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: updatedEmail, otp })
      .expect(200)
      .expect(({ body }) => {
        expect(body.email).toBe(updatedEmail);
      });

    await request(app.getHttpServer())
      .get('/privacy/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.generatedAt).toEqual(expect.any(String));
        expect(body.user.email).toBe(updatedEmail);
        expect(body.user.trips).toEqual([]);
      });

    const deletion = await request(app.getHttpServer())
      .post('/privacy/delete-request')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(deletion.body.type).toBe('DELETE_ACCOUNT');
    expect(deletion.body.status).toBe('PENDING');
    expect(new Date(deletion.body.dueAt).getTime()).toBeGreaterThan(Date.now());

    await request(app.getHttpServer())
      .get('/privacy/requests')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: deletion.body.id }),
          ]),
        );
      });
  });

  it('refunds a completed payment with a financial OTP and stores encrypted refund metadata', async () => {
    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        password: 'not-used',
        fullName: 'Smoke Owner',
        phone: ownerPhone,
        roles: [UserRole.OWNER],
        status: UserStatus.ACTIVE,
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        ownerId: owner.id,
        licensePlate: `SMK-${String(suffix).slice(-6)}`,
        model: 'Smoke Model',
        brand: VehicleBrand.VINFAST,
        type: VehicleType.VINFAST_KLARA,
        pricePerHour: 25000,
        pricePerDay: 200000,
        address: 'Smoke vehicle address',
        images: [],
        status: VehicleStatus.AVAILABLE,
      },
    });

    const booking = await prisma.booking.create({
      data: {
        renterId,
        ownerId: owner.id,
        vehicleId: vehicle.id,
        status: BookingStatus.CONFIRMED,
        startTime: new Date(Date.now() + 60 * 60 * 1000),
        endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
        totalPrice: 100000,
        deposit: 20000,
      },
    });

    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        payerId: renterId,
        receiverId: owner.id,
        amount: 120000,
        platformFee: 15000,
        ownerAmount: 85000,
        method: PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
        paidAt: new Date(),
      },
    });

    const otpResponse = await request(app.getHttpServer())
      .post('/auth/request-sensitive-otp')
      .set('Authorization', `Bearer ${token}`)
      .send({ purpose: 'FINANCIAL_TRANSACTION' })
      .expect(200);

    const otp = parseDevOtp(otpResponse.body.message);

    await request(app.getHttpServer())
      .post(`/payments/${payment.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ otp })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe(PaymentStatus.REFUNDED);
        expect(body.gatewayResponse).toMatchObject({ refundedBy: renterId });
      });

    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(typeof stored.gatewayResponse).toBe('string');
    expect(stored.gatewayResponse).toMatch(/^enc:v1:/);
  });
});
