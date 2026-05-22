/**
 * @module Booking Tests — Integration (E2E)
 * @member Member A — Dương Hoàng Long
 * @coverage target ≥80%
 * @testCount 15
 *
 * Integration tests for the /bookings endpoints.
 * Uses a real NestJS HTTP application with a fully mocked PrismaService,
 * mocked JwtAuthGuard, and mocked EventEmitter2.
 *
 * Notable behaviours tested here reflect the real service implementation:
 *  - Bookings are created with status PENDING (not CONFIRMED)
 *  - cancelBooking allows PENDING or CONFIRMED bookings only
 *  - Renters and owners can cancel bookings they are involved in
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { BookingStatus, VehicleStatus, UserRole, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { BookingsController } from '../src/booking/bookings.controller';
import { BookingsService } from '../src/booking/bookings.service';
import { BookingLockService } from '../src/booking/booking-lock.service';
import { PrismaService } from '../src/database/prisma.service';
import { JwtAuthGuard } from '../src/auth/guards';
import { TrustScoreService } from '../src/trust-score/trust-score.service';
import { KycService } from '../src/kyc/kyc.service';
import {
  createMockBooking,
  RENTER_ID,
  BOOKING_OWNER_ID,
  BOOKED_VEHICLE_ID,
  BOOKING_ID,
  THIRD_PARTY_ID,
} from './factories/booking.factory';
import { createMockVehicle } from './factories/vehicle.factory';

// ─── Constants ────────────────────────────────────────────────────────────────
const RENTER_JWT = 'Bearer renter-test-token';
const NONEXISTENT_ID = '00000000-dead-4000-8000-000000000000';

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Returns ISO string `offsetHours` hours from now */
function futureIso(offsetHours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + offsetHours);
  return d.toISOString();
}

/** Builds a minimal valid CreateBookingDto body */
function buildBookingBody(
  overrides: Record<string, any> = {},
): Record<string, any> {
  return {
    vehicleId: BOOKED_VEHICLE_ID,
    startTime: futureIso(2),
    endTime: futureIso(4),
    notes: 'Integration test booking',
    ...overrides,
  };
}

/** Available vehicle record (passes all service checks) */
function availableVehicle() {
  return {
    ...createMockVehicle({
      id: BOOKED_VEHICLE_ID,
      ownerId: BOOKING_OWNER_ID,
      status: VehicleStatus.AVAILABLE,
      isAvailable: true,
    }),
    owner: {
      id: BOOKING_OWNER_ID,
      fullName: 'Owner',
      phone: '0901234567',
      avatarUrl: null,
    },
    pricePerHour: new Prisma.Decimal(25000),
    pricePerDay: new Prisma.Decimal(300000),
    deposit: 500000,
  };
}

// ─── Mock guards ──────────────────────────────────────────────────────────────

/** Guard that injects the renter user */
class MockRenterGuard {
  canActivate(context: any) {
    context.switchToHttp().getRequest().user = {
      id: RENTER_ID,
      email: 'renter@test.com',
      fullName: 'Test Renter',
      phone: '0999999999',
      avatarUrl: null,
      roles: [UserRole.RENTER],
      status: 'ACTIVE',
      trustScore: 100,
      idCardNum: null,
      address: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return true;
  }
}

/** Guard that injects the vehicle *owner* user */
class MockOwnerGuard {
  canActivate(context: any) {
    context.switchToHttp().getRequest().user = {
      id: BOOKING_OWNER_ID,
      email: 'owner@test.com',
      fullName: 'Test Owner',
      phone: '0988888888',
      avatarUrl: null,
      roles: [UserRole.OWNER],
      status: 'ACTIVE',
      trustScore: 100,
      idCardNum: null,
      address: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return true;
  }
}

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockPrismaVehicle = { findUnique: jest.fn(), update: jest.fn() };
const mockPrismaBooking = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
const mockPrismaBookingLock = {
  findMany: jest.fn(),
};
const mockPrismaPayment = {
  findUnique: jest.fn().mockResolvedValue(null),
  update: jest.fn(),
};
const mockPrismaUser = { findUnique: jest.fn(), update: jest.fn() };
const mockEmitter = { emit: jest.fn() };
const mockBookingLockService = {
  createLock: jest.fn(),
  releaseLock: jest.fn(),
  hasConflictingLock: jest.fn().mockResolvedValue(false),
  releaseLocksByVehicleAndTime: jest.fn().mockResolvedValue(undefined),
};
const mockTrustScoreService = {
  assertCanCreateBooking: jest.fn().mockResolvedValue(undefined),
  recordViolation: jest.fn().mockResolvedValue({ warned: true, score: 100 }),
};
const mockKycService = {
  assertApproved: jest.fn().mockResolvedValue(undefined),
};

// ─── App fixture factory ──────────────────────────────────────────────────────
async function buildApp(
  guardClass: any = MockRenterGuard,
): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [BookingsController],
    providers: [
      BookingsService,
      {
        provide: PrismaService,
        useValue: {
          vehicle: mockPrismaVehicle,
          booking: mockPrismaBooking,
          bookingLock: mockPrismaBookingLock,
          user: mockPrismaUser,
          $transaction: jest.fn().mockImplementation(async (callback) =>
            callback({
              booking: mockPrismaBooking,
              payment: mockPrismaPayment,
              user: mockPrismaUser,
            }),
          ),
        },
      },
      { provide: EventEmitter2, useValue: mockEmitter },
      { provide: TrustScoreService, useValue: mockTrustScoreService },
      { provide: BookingLockService, useValue: mockBookingLockService },
      { provide: KycService, useValue: mockKycService },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useClass(guardClass)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe('/bookings (Integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildApp();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /bookings ──────────────────────────────────────────────────────
  describe('POST /bookings', () => {
    it('should return 201 with { bookingId, status, vehicleId, renterId } on success', async () => {
      // Arrange
      const vehicle = availableVehicle();
      const booking = createMockBooking({ status: BookingStatus.PENDING });
      mockPrismaVehicle.findUnique.mockResolvedValue(vehicle);
      mockPrismaBooking.findMany.mockResolvedValue([]); // no conflicts
      mockPrismaBooking.create.mockResolvedValue(booking);

      // Act
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', RENTER_JWT)
        .send(buildBookingBody())
        .expect(201);

      // Assert
      expect(res.body).toMatchObject({
        id: expect.any(String),
        status: BookingStatus.PENDING,
        vehicleId: BOOKED_VEHICLE_ID,
        renterId: RENTER_ID,
      });
    });

    it('should call eventEmitter.emit with "booking.created" as a side effect', async () => {
      // Arrange
      const vehicle = availableVehicle();
      const booking = createMockBooking();
      mockPrismaVehicle.findUnique.mockResolvedValue(vehicle);
      mockPrismaBooking.findMany.mockResolvedValue([]);
      mockPrismaBooking.create.mockResolvedValue(booking);

      // Act
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', RENTER_JWT)
        .send(buildBookingBody())
        .expect(201);

      // Assert — event emitter called with booking.created
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'booking.created',
        expect.any(Object),
      );
    });

    it('should return 409 when vehicle already has an overlapping booking', async () => {
      // Arrange — existing booking causes conflict
      const vehicle = availableVehicle();
      const conflictingBooking = createMockBooking({
        status: BookingStatus.CONFIRMED,
      });
      mockPrismaVehicle.findUnique.mockResolvedValue(vehicle);
      mockPrismaBooking.findMany.mockResolvedValue([conflictingBooking]); // conflict!

      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', RENTER_JWT)
        .send(buildBookingBody())
        .expect(409);
    });

    it('should return 400 when startTime is in the past', async () => {
      // Arrange
      const pastStart = new Date();
      pastStart.setHours(pastStart.getHours() - 2);

      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', RENTER_JWT)
        .send(buildBookingBody({ startTime: pastStart.toISOString() }))
        .expect(400);
    });

    it('should return 401/403 when no Authorization header provided', async () => {
      // Arrange — use a guard that rejects
      const securedModule = await Test.createTestingModule({
        controllers: [BookingsController],
        providers: [
          BookingsService,
          {
            provide: PrismaService,
            useValue: {
              vehicle: mockPrismaVehicle,
              booking: mockPrismaBooking,
              bookingLock: mockPrismaBookingLock,
              user: mockPrismaUser,
            },
          },
          { provide: EventEmitter2, useValue: mockEmitter },
          { provide: TrustScoreService, useValue: mockTrustScoreService },
          { provide: BookingLockService, useValue: mockBookingLockService },
          { provide: KycService, useValue: mockKycService },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => false })
        .compile();

      const securedApp = securedModule.createNestApplication();
      securedApp.useGlobalPipes(new ValidationPipe({ whitelist: true }));
      await securedApp.init();

      // Act & Assert
      await request(securedApp.getHttpServer())
        .post('/bookings')
        .send(buildBookingBody())
        .expect(403);

      await securedApp.close();
    });

    it('should return 400 when renter tries to book their own vehicle', async () => {
      // Arrange — vehicle's owner is the renter
      const ownVehicle = availableVehicle();
      ownVehicle.ownerId = RENTER_ID;
      mockPrismaVehicle.findUnique.mockResolvedValue(ownVehicle);

      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', RENTER_JWT)
        .send(buildBookingBody())
        .expect(400);
    });
  });

  // ─── GET /bookings/:id ───────────────────────────────────────────────────
  describe('GET /bookings/:id', () => {
    it('should return 200 when accessed by the renter', async () => {
      // Arrange
      const booking = createMockBooking({ renterId: RENTER_ID });
      mockPrismaBooking.findUnique.mockResolvedValue(booking);

      // Act & Assert
      const res = await request(app.getHttpServer())
        .get(`/bookings/${BOOKING_ID}`)
        .set('Authorization', RENTER_JWT)
        .expect(200);

      expect(res.body.id).toBe(BOOKING_ID);
    });

    it('should return 200 when accessed by the vehicle owner', async () => {
      // Arrange — rebuild the app injecting the owner as current user
      const ownerApp = await buildApp(MockOwnerGuard);
      const booking = createMockBooking({
        ownerId: BOOKING_OWNER_ID,
        renterId: RENTER_ID,
      });
      mockPrismaBooking.findUnique.mockResolvedValue(booking);

      // Act & Assert
      const res = await request(ownerApp.getHttpServer())
        .get(`/bookings/${BOOKING_ID}`)
        .set('Authorization', 'Bearer owner-token')
        .expect(200);

      expect(res.body.id).toBe(BOOKING_ID);
      await ownerApp.close();
    });

    it('should return 404 when a different user tries to access the booking', async () => {
      // Arrange — booking belongs to RENTER_ID + BOOKING_OWNER_ID, but current user is THIRD_PARTY
      const thirdPartyApp = await buildApp(
        class {
          canActivate(ctx: any) {
            ctx.switchToHttp().getRequest().user = {
              id: THIRD_PARTY_ID,
              email: 'third@test.com',
              fullName: 'Third Party',
              phone: '0111111111',
              avatarUrl: null,
              roles: [UserRole.RENTER],
              status: 'ACTIVE',
              trustScore: 100,
              idCardNum: null,
              address: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            return true;
          }
        },
      );
      const booking = createMockBooking({
        renterId: RENTER_ID,
        ownerId: BOOKING_OWNER_ID,
      });
      mockPrismaBooking.findUnique.mockResolvedValue(booking);

      // Act & Assert
      await request(thirdPartyApp.getHttpServer())
        .get(`/bookings/${BOOKING_ID}`)
        .set('Authorization', 'Bearer third-party-token')
        .expect(404);

      await thirdPartyApp.close();
    });

    it('should return 404 when bookingId does not exist', async () => {
      // Arrange
      mockPrismaBooking.findUnique.mockResolvedValue(null);

      // Act & Assert
      await request(app.getHttpServer())
        .get(`/bookings/${NONEXISTENT_ID}`)
        .set('Authorization', RENTER_JWT)
        .expect(404);
    });
  });

  // ─── PATCH /bookings/:id/cancel ──────────────────────────────────────────
  describe('PATCH /bookings/:id/cancel', () => {
    it('should return 200 when renter cancels a PENDING booking', async () => {
      // Arrange
      const booking = createMockBooking({
        renterId: RENTER_ID,
        status: BookingStatus.PENDING,
      });
      const cancelledBooking = createMockBooking({
        renterId: RENTER_ID,
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
      });
      mockPrismaBooking.findUnique.mockResolvedValue(booking);
      mockPrismaBooking.update.mockResolvedValue(cancelledBooking);
      mockPrismaUser.findUnique.mockResolvedValue({
        id: RENTER_ID,
        trustScore: 100,
      });
      mockPrismaUser.update.mockResolvedValue({});

      // Act & Assert
      const res = await request(app.getHttpServer())
        .patch(`/bookings/${BOOKING_ID}/cancel`)
        .set('Authorization', RENTER_JWT)
        .send({ reason: 'Changed plans' })
        .expect(200);

      expect(res.body.status).toBe(BookingStatus.CANCELLED);
    });

    it('should return 400 when booking status is COMPLETED', async () => {
      // Arrange
      const completedBooking = createMockBooking({
        renterId: RENTER_ID,
        status: BookingStatus.COMPLETED,
      });
      mockPrismaBooking.findUnique.mockResolvedValue(completedBooking);

      // Act & Assert
      await request(app.getHttpServer())
        .patch(`/bookings/${BOOKING_ID}/cancel`)
        .set('Authorization', RENTER_JWT)
        .send({ reason: 'Too late' })
        .expect(400);
    });

    it('should return 200 when the vehicle owner cancels a booking they own', async () => {
      const ownerApp = await buildApp(MockOwnerGuard);
      const booking = createMockBooking({
        renterId: RENTER_ID,
        ownerId: BOOKING_OWNER_ID,
        status: BookingStatus.PENDING,
      });
      const cancelledBooking = createMockBooking({
        renterId: RENTER_ID,
        ownerId: BOOKING_OWNER_ID,
        status: BookingStatus.CANCELLED,
        cancelledBy: 'OWNER',
        cancelledAt: new Date(),
      });
      mockPrismaBooking.findUnique.mockResolvedValue(booking);
      mockPrismaBooking.update.mockResolvedValue(cancelledBooking);

      const res = await request(ownerApp.getHttpServer())
        .patch(`/bookings/${BOOKING_ID}/cancel`)
        .set('Authorization', 'Bearer owner-token')
        .send({ reason: 'Owner wants to cancel' })
        .expect(200);

      expect(res.body.status).toBe(BookingStatus.CANCELLED);
      expect(res.body.cancelledBy).toBe('OWNER');

      await ownerApp.close();
    });
  });

  // ─── DATA FLOW CHAIN TEST ────────────────────────────────────────────────
  describe('DATA FLOW CHAIN — POST /bookings → side effects', () => {
    it('should create booking, trigger "booking.created" event, with correct payload', async () => {
      // Arrange
      const vehicle = availableVehicle();
      const booking = createMockBooking({
        status: BookingStatus.PENDING,
        renterId: RENTER_ID,
      });
      mockPrismaVehicle.findUnique.mockResolvedValue(vehicle);
      mockPrismaBooking.findMany.mockResolvedValue([]);
      mockPrismaBooking.create.mockResolvedValue(booking);

      // Step 1 — Create booking
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', RENTER_JWT)
        .send(buildBookingBody());

      // Assert step 1: HTTP 201
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();

      // Step 2 — Verify the event was emitted with the correct structure
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'booking.created',
        expect.objectContaining({
          bookingId: expect.any(String),
          renterId: RENTER_ID,
          ownerId: BOOKING_OWNER_ID,
          vehicleId: BOOKED_VEHICLE_ID,
        }),
      );

      // Step 3 — The emitted event count should be exactly 1
      const bookingCreatedCalls = mockEmitter.emit.mock.calls.filter(
        (call) => call[0] === 'booking.created',
      );
      expect(bookingCreatedCalls).toHaveLength(1);
    });
  });
});
