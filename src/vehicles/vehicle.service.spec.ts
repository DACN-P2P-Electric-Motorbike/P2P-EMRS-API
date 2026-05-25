/**
 * @module Vehicle Tests
 * @member Member A — Dương Hoàng Long
 * @coverage target ≥80%
 * @testCount 39
 *
 * Unit tests for VehiclesService.
 * All Prisma calls are mocked — no real DB connection required.
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AvailabilityWindowRecurrence,
  AvailabilityWindowType,
  BatteryType,
  VehicleStatus,
  VehicleType,
  VehicleBrand,
  VehicleCondition,
  UserRole,
  Prisma,
} from '@prisma/client';

import { VehiclesService } from './vehicles.service';
import { PrismaService } from '../database/prisma.service';
import { TrustScoreService } from '../trust-score/trust-score.service';
import { KycService } from '../kyc/kyc.service';
import {
  createMockVehicle,
  MockVehicle,
  OWNER_ID,
  VEHICLE_ID,
} from '../../test/factories/vehicle.factory';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A second owner UUID for conflict-scenario tests */
const OTHER_OWNER_ID = 'eeee1111-0000-4000-8000-eeeeeeeeeeee';

/** Build a minimal CreateVehicleDto */
function buildCreateDto(
  overrides: Record<string, any> = {},
): Record<string, any> {
  return {
    licensePlate: '59A-12345',
    model: 'Klara S',
    brand: VehicleBrand.VINFAST,
    type: VehicleType.ELECTRIC_SCOOTER,
    pricePerHour: 25000,
    pricePerDay: 300000,
    address: '123 Nguyen Trai, Quan 1, TP.HCM',
    latitude: 10.7769,
    longitude: 106.7009,
    images: ['https://example.com/image1.jpg'],
    batteryLevel: 100,
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('VehiclesService', () => {
  let service: VehiclesService;

  // Typed mocks for PrismaService delegates
  const mockVehicleDelegate = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };
  const mockBookingDelegate = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  };
  const mockBookingLockDelegate = {
    findMany: jest.fn(),
  };
  const mockVehicleAvailabilityWindowDelegate = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockUserDelegate = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };
  const mockEventEmitter = { emit: jest.fn() };
  const mockTrustScoreService = {
    assertCanRegisterVehicle: jest.fn().mockResolvedValue(undefined),
  };
  const mockKycService = {
    assertApproved: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        {
          provide: PrismaService,
          useValue: {
            vehicle: mockVehicleDelegate,
            booking: mockBookingDelegate,
            bookingLock: mockBookingLockDelegate,
            vehicleAvailabilityWindow: mockVehicleAvailabilityWindowDelegate,
            user: mockUserDelegate,
          },
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: TrustScoreService,
          useValue: mockTrustScoreService,
        },
        {
          provide: KycService,
          useValue: mockKycService,
        },
      ],
    }).compile();

    service = module.get<VehiclesService>(VehiclesService);

    // Clear all mocks before each test
    jest.clearAllMocks();
    mockBookingDelegate.findMany.mockResolvedValue([]);
    mockBookingLockDelegate.findMany.mockResolvedValue([]);
    mockVehicleAvailabilityWindowDelegate.findMany.mockResolvedValue([]);
    mockVehicleAvailabilityWindowDelegate.findFirst.mockResolvedValue(null);
    mockKycService.assertApproved.mockResolvedValue(undefined);
  });

  // ─── registerVehicle ────────────────────────────────────────────────────────

  describe('registerVehicle', () => {
    const ownerRoles: UserRole[] = [UserRole.OWNER];
    const dto = buildCreateDto() as any;

    it('should create vehicle with status PENDING_APPROVAL when owner registers a new vehicle', async () => {
      // Arrange
      const createdVehicle: MockVehicle = createMockVehicle({
        status: VehicleStatus.PENDING_APPROVAL,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(null); // no duplicate plate
      mockVehicleDelegate.create.mockResolvedValue(createdVehicle);

      // Act
      const result = await service.registerVehicle(OWNER_ID, ownerRoles, dto);

      // Assert
      expect(result.status).toBe(VehicleStatus.PENDING_APPROVAL);
      expect(mockVehicleDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: OWNER_ID,
            status: VehicleStatus.PENDING_APPROVAL,
          }),
        }),
      );
    });

    it('should emit "vehicle.submitted" event after successful registration', async () => {
      // Arrange
      const createdVehicle: MockVehicle = createMockVehicle({
        status: VehicleStatus.PENDING_APPROVAL,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(null);
      mockVehicleDelegate.create.mockResolvedValue(createdVehicle);

      // Act
      await service.registerVehicle(OWNER_ID, ownerRoles, dto);

      // Assert
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'vehicle.submitted',
        expect.any(Object),
      );
    });

    it('should throw ForbiddenException when user has only RENTER role (not OWNER)', async () => {
      // Arrange
      const renterRoles: UserRole[] = [UserRole.RENTER];

      // Act & Assert
      await expect(
        service.registerVehicle(OWNER_ID, renterRoles, dto),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.registerVehicle(OWNER_ID, renterRoles, dto),
      ).rejects.toThrow('Only users with OWNER role can register vehicles');
    });

    it('should throw ConflictException when licensePlate already exists in DB', async () => {
      // Arrange — simulate an existing vehicle with same plate
      mockVehicleDelegate.findUnique.mockResolvedValue(createMockVehicle());

      // Act & Assert
      await expect(
        service.registerVehicle(OWNER_ID, ownerRoles, dto),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.registerVehicle(OWNER_ID, ownerRoles, dto),
      ).rejects.toThrow('A vehicle with this license plate already exists');
    });

    it('should allow ADMIN role to register a vehicle', async () => {
      // Arrange
      const adminRoles: UserRole[] = [UserRole.ADMIN];
      const createdVehicle: MockVehicle = createMockVehicle({
        status: VehicleStatus.PENDING_APPROVAL,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(null);
      mockVehicleDelegate.create.mockResolvedValue(createdVehicle);

      // Act
      const result = await service.registerVehicle(OWNER_ID, adminRoles, dto);

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe(VehicleStatus.PENDING_APPROVAL);
      expect(mockKycService.assertApproved).not.toHaveBeenCalled();
    });

    it('should require owner KYC approval before registering a vehicle', async () => {
      mockKycService.assertApproved.mockRejectedValueOnce(
        new ForbiddenException('KYC verification is required'),
      );

      await expect(
        service.registerVehicle(OWNER_ID, ownerRoles, dto),
      ).rejects.toThrow(ForbiddenException);

      expect(mockKycService.assertApproved).toHaveBeenCalledWith(
        OWNER_ID,
        'vehicle',
      );
      expect(mockVehicleDelegate.findUnique).not.toHaveBeenCalled();
    });

    it('should persist instant-book and listing policy fields when provided', async () => {
      const createdVehicle: MockVehicle = createMockVehicle({
        status: VehicleStatus.PENDING_APPROVAL,
        instantBook: true,
        dailyKmLimit: 120,
        excessKmPrice: 3000,
        weeklyDiscount: 10,
        monthlyDiscount: 20,
        allowSmoke: false,
        allowPets: true,
        geoRestriction: 'province_only',
        batteryReturnMin: 30,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(null);
      mockVehicleDelegate.create.mockResolvedValue(createdVehicle);

      await service.registerVehicle(OWNER_ID, ownerRoles, {
        ...dto,
        instantBook: true,
        dailyKmLimit: 120,
        excessKmPrice: 3000,
        weeklyDiscount: 10,
        monthlyDiscount: 20,
        allowSmoke: false,
        allowPets: true,
        geoRestriction: 'province_only',
        batteryReturnMin: 30,
      });

      expect(mockVehicleDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            instantBook: true,
            dailyKmLimit: 120,
            excessKmPrice: 3000,
            weeklyDiscount: 10,
            monthlyDiscount: 20,
            allowSmoke: false,
            allowPets: true,
            geoRestriction: 'province_only',
            batteryReturnMin: 30,
          }),
        }),
      );
    });

    it('should persist EV condition and battery lifecycle fields when provided', async () => {
      const createdVehicle: MockVehicle = createMockVehicle({
        status: VehicleStatus.PENDING_APPROVAL,
        firstRegistrationYear: 2024,
        condition: VehicleCondition.GOOD,
        batteryType: BatteryType.REMOVABLE,
        batteryHealth: 94,
        batteryCycleCount: 180,
        batteryLastServicedAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(null);
      mockVehicleDelegate.create.mockResolvedValue(createdVehicle);

      await service.registerVehicle(OWNER_ID, ownerRoles, {
        ...dto,
        firstRegistrationYear: 2024,
        condition: VehicleCondition.GOOD,
        batteryType: BatteryType.REMOVABLE,
        batteryHealth: 94,
        batteryCycleCount: 180,
        batteryLastServicedAt: '2026-05-01T00:00:00.000Z',
      });

      expect(mockVehicleDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstRegistrationYear: 2024,
            condition: VehicleCondition.GOOD,
            batteryType: BatteryType.REMOVABLE,
            batteryHealth: 94,
            batteryCycleCount: 180,
            batteryLastServicedAt: new Date('2026-05-01T00:00:00.000Z'),
          }),
        }),
      );
    });
  });

  // ─── getVehicleById ─────────────────────────────────────────────────────────

  describe('getVehicleById', () => {
    it('should return full vehicle detail when vehicleId exists', async () => {
      // Arrange
      const vehicle = createMockVehicle();
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      // Act
      const result = await service.getVehicleById(VEHICLE_ID);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(VEHICLE_ID);
      expect(mockVehicleDelegate.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: VEHICLE_ID } }),
      );
    });

    it('should throw NotFoundException when vehicleId does not exist', async () => {
      // Arrange
      mockVehicleDelegate.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getVehicleById('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getVehicleById('nonexistent-id')).rejects.toThrow(
        'Vehicle not found',
      );
    });

    it('should throw NotFoundException when vehicleId is empty string', async () => {
      // Arrange — empty string will not match any real UUID, treat like not found
      mockVehicleDelegate.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getVehicleById('')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getAvailableVehicles / filterByStatus ──────────────────────────────────

  describe('getAvailableVehicles', () => {
    it('should return only AVAILABLE vehicles when no filter params provided', async () => {
      // Arrange
      const vehicles = [
        createMockVehicle({ id: 'v1', status: VehicleStatus.AVAILABLE }),
        createMockVehicle({ id: 'v2', status: VehicleStatus.AVAILABLE }),
      ];
      mockVehicleDelegate.findMany.mockResolvedValue(vehicles);
      mockVehicleDelegate.count.mockResolvedValue(2);

      // Act
      const result = await service.getAvailableVehicles();

      // Assert
      expect(result.vehicles).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockVehicleDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: VehicleStatus.AVAILABLE,
            isAvailable: true,
          }),
        }),
      );
    });

    it('should filter vehicles by type when type param is provided', async () => {
      // Arrange
      const filteredVehicles = [
        createMockVehicle({ type: VehicleType.ELECTRIC_SCOOTER }),
      ];
      mockVehicleDelegate.findMany.mockResolvedValue(filteredVehicles);
      mockVehicleDelegate.count.mockResolvedValue(1);

      // Act
      const result = await service.getAvailableVehicles({
        type: 'ELECTRIC_SCOOTER',
      });

      // Assert
      expect(result.vehicles).toHaveLength(1);
      expect(mockVehicleDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'ELECTRIC_SCOOTER' }),
        }),
      );
    });

    it('should return empty array when no vehicles match filters', async () => {
      // Arrange
      mockVehicleDelegate.findMany.mockResolvedValue([]);
      mockVehicleDelegate.count.mockResolvedValue(0);

      // Act
      const result = await service.getAvailableVehicles({
        type: 'NONEXISTENT',
      });

      // Assert
      expect(result.vehicles).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should apply price range filter when minPrice and maxPrice are provided', async () => {
      // Arrange
      mockVehicleDelegate.findMany.mockResolvedValue([]);
      mockVehicleDelegate.count.mockResolvedValue(0);

      // Act
      await service.getAvailableVehicles({ minPrice: 10000, maxPrice: 50000 });

      // Assert
      expect(mockVehicleDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            pricePerHour: expect.objectContaining({ gte: 10000, lte: 50000 }),
          }),
        }),
      );
    });

    it('should filter by instant book when requested', async () => {
      mockVehicleDelegate.findMany.mockResolvedValue([
        createMockVehicle({ instantBook: true }),
      ]);
      mockVehicleDelegate.count.mockResolvedValue(1);

      await service.getAvailableVehicles({ instantBook: true });

      expect(mockVehicleDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ instantBook: true }),
        }),
      );
    });

    it('should filter by EV condition, battery type, and battery health', async () => {
      mockVehicleDelegate.findMany.mockResolvedValue([]);
      mockVehicleDelegate.count.mockResolvedValue(0);

      await service.getAvailableVehicles({
        condition: VehicleCondition.LIKE_NEW,
        batteryType: BatteryType.SWAPPABLE,
        minBatteryHealth: 90,
      });

      expect(mockVehicleDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            condition: VehicleCondition.LIKE_NEW,
            batteryType: BatteryType.SWAPPABLE,
            batteryHealth: { gte: 90 },
          }),
        }),
      );
    });

    it('should rank stronger EV condition and battery health higher', async () => {
      mockVehicleDelegate.findMany.mockResolvedValue([
        createMockVehicle({
          id: 'tired-ev',
          condition: VehicleCondition.FAIR,
          batteryType: BatteryType.FIXED_NON_REMOVABLE,
          batteryHealth: 60,
          totalTrips: 0,
          totalRating: 4,
        }),
        createMockVehicle({
          id: 'healthy-ev',
          condition: VehicleCondition.LIKE_NEW,
          batteryType: BatteryType.SWAPPABLE,
          batteryHealth: 96,
          totalTrips: 0,
          totalRating: 4,
        }),
      ]);
      mockVehicleDelegate.count.mockResolvedValue(2);

      const result = await service.getAvailableVehicles();

      expect(result.vehicles.map((vehicle) => vehicle.id)).toEqual([
        'healthy-ev',
        'tired-ev',
      ]);
    });

    it('should exclude active booking locks in requested rental window', async () => {
      const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const endTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      mockBookingDelegate.findMany.mockResolvedValue([
        { vehicleId: 'booked-vehicle' },
      ]);
      mockBookingLockDelegate.findMany.mockResolvedValue([
        { vehicleId: 'locked-vehicle' },
      ]);
      mockVehicleDelegate.findMany.mockResolvedValue([]);
      mockVehicleDelegate.count.mockResolvedValue(0);

      await service.getAvailableVehicles({ startTime, endTime });

      expect(mockVehicleDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['booked-vehicle', 'locked-vehicle'] },
          }),
        }),
      );
    });

    it('should exclude blocked calendar windows and uncovered available calendars', async () => {
      const startTime = '2026-05-25T08:00:00.000Z';
      const endTime = '2026-05-25T10:00:00.000Z';
      const oneOffWindow = {
        id: 'window-1',
        type: AvailabilityWindowType.AVAILABLE,
        recurrence: AvailabilityWindowRecurrence.ONCE,
        recurringWeekdays: [],
        timezoneOffsetMinutes: null,
        recurrenceEndsAt: null,
        startTime: new Date('2026-05-25T08:00:00.000Z'),
        endTime: new Date('2026-05-25T18:00:00.000Z'),
        note: null,
        createdAt: new Date('2026-05-22T00:00:00.000Z'),
        updatedAt: new Date('2026-05-22T00:00:00.000Z'),
      };
      mockBookingDelegate.findMany.mockResolvedValue([]);
      mockBookingLockDelegate.findMany.mockResolvedValue([]);
      mockVehicleAvailabilityWindowDelegate.findMany
        .mockResolvedValueOnce([
          {
            ...oneOffWindow,
            vehicleId: 'blocked-vehicle',
            type: AvailabilityWindowType.BLOCKED,
          },
        ])
        .mockResolvedValueOnce([
          { ...oneOffWindow, vehicleId: 'calendar-covered' },
          {
            ...oneOffWindow,
            vehicleId: 'calendar-missing',
            startTime: new Date('2026-05-26T08:00:00.000Z'),
            endTime: new Date('2026-05-26T18:00:00.000Z'),
          },
        ]);
      mockVehicleDelegate.findMany.mockResolvedValue([]);
      mockVehicleDelegate.count.mockResolvedValue(0);

      await service.getAvailableVehicles({ startTime, endTime });

      expect(
        mockVehicleAvailabilityWindowDelegate.findMany,
      ).toHaveBeenCalledTimes(2);
      expect(mockVehicleDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['blocked-vehicle', 'calendar-missing'] },
          }),
        }),
      );
    });

    it('should apply weekly blocked and available rules to a later occurrence', async () => {
      const startTime = '2026-06-01T02:00:00.000Z';
      const endTime = '2026-06-01T04:00:00.000Z';
      const weeklyWindow = {
        id: 'weekly-window',
        type: AvailabilityWindowType.AVAILABLE,
        recurrence: AvailabilityWindowRecurrence.WEEKLY,
        recurringWeekdays: [1],
        timezoneOffsetMinutes: 420,
        recurrenceEndsAt: null,
        startTime: new Date('2026-05-25T01:00:00.000Z'),
        endTime: new Date('2026-05-25T11:00:00.000Z'),
        note: null,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      };
      mockVehicleAvailabilityWindowDelegate.findMany
        .mockResolvedValueOnce([
          {
            ...weeklyWindow,
            vehicleId: 'weekly-blocked',
            type: AvailabilityWindowType.BLOCKED,
          },
        ])
        .mockResolvedValueOnce([
          { ...weeklyWindow, vehicleId: 'weekly-covered' },
          {
            ...weeklyWindow,
            vehicleId: 'wrong-weekday',
            recurringWeekdays: [2],
          },
        ]);
      mockVehicleDelegate.findMany.mockResolvedValue([]);
      mockVehicleDelegate.count.mockResolvedValue(0);

      await service.getAvailableVehicles({ startTime, endTime });

      expect(mockVehicleDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['weekly-blocked', 'wrong-weekday'] },
          }),
        }),
      );
    });
  });

  // ─── getMyVehicles ──────────────────────────────────────────────────────────

  describe('getMyVehicles', () => {
    it('should return all vehicles owned by ownerId', async () => {
      // Arrange
      const vehicles = [
        createMockVehicle({ id: 'v1', ownerId: OWNER_ID }),
        createMockVehicle({ id: 'v2', ownerId: OWNER_ID }),
      ];
      mockVehicleDelegate.findMany.mockResolvedValue(vehicles);

      // Act
      const result = await service.getMyVehicles(OWNER_ID);

      // Assert
      expect(result).toHaveLength(2);
      expect(mockVehicleDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: OWNER_ID } }),
      );
    });

    it('should return empty array when owner has no vehicles', async () => {
      // Arrange
      mockVehicleDelegate.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getMyVehicles(OTHER_OWNER_ID);

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  // ─── updateVehicle ──────────────────────────────────────────────────────────

  describe('updateVehicle', () => {
    it('should update vehicle when called by the owner', async () => {
      // Arrange
      const vehicle = createMockVehicle({
        ownerId: OWNER_ID,
        status: VehicleStatus.AVAILABLE,
      });
      const updatedVehicle = createMockVehicle({ model: 'Klara V' });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockVehicleDelegate.update.mockResolvedValue(updatedVehicle);

      // Act
      const result = await service.updateVehicle(
        VEHICLE_ID,
        OWNER_ID,
        [UserRole.OWNER],
        { model: 'Klara V' } as any,
      );

      // Assert
      expect(result.model).toBe('Klara V');
      expect(mockVehicleDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VEHICLE_ID },
          data: expect.objectContaining({ model: 'Klara V' }),
        }),
      );
    });

    it('should throw NotFoundException when vehicle does not exist', async () => {
      // Arrange
      mockVehicleDelegate.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.updateVehicle(
          VEHICLE_ID,
          OWNER_ID,
          [UserRole.OWNER],
          {} as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner and not ADMIN', async () => {
      // Arrange
      const vehicle = createMockVehicle({ ownerId: OTHER_OWNER_ID });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      // Act & Assert
      await expect(
        service.updateVehicle(
          VEHICLE_ID,
          OWNER_ID,
          [UserRole.RENTER],
          {} as any,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.updateVehicle(
          VEHICLE_ID,
          OWNER_ID,
          [UserRole.RENTER],
          {} as any,
        ),
      ).rejects.toThrow('You can only update your own vehicles');
    });

    it('should allow ADMIN to update another user vehicle', async () => {
      const vehicle = createMockVehicle({ ownerId: OTHER_OWNER_ID });
      const updated = createMockVehicle({ model: 'Admin edit' });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockVehicleDelegate.update.mockResolvedValue(updated);

      const result = await service.updateVehicle(
        VEHICLE_ID,
        OWNER_ID,
        [UserRole.ADMIN],
        { model: 'Admin edit' } as any,
      );

      expect(result.model).toBe('Admin edit');
    });

    it('should reject owner setting disallowed status', async () => {
      const vehicle = createMockVehicle({
        ownerId: OWNER_ID,
        status: VehicleStatus.AVAILABLE,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      await expect(
        service.updateVehicle(VEHICLE_ID, OWNER_ID, [UserRole.OWNER], {
          status: VehicleStatus.PENDING_APPROVAL,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject owner status change while vehicle is PENDING_APPROVAL', async () => {
      const vehicle = createMockVehicle({
        ownerId: OWNER_ID,
        status: VehicleStatus.PENDING_APPROVAL,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      await expect(
        service.updateVehicle(VEHICLE_ID, OWNER_ID, [UserRole.OWNER], {
          status: VehicleStatus.AVAILABLE,
        } as any),
      ).rejects.toThrow(
        /Cannot change status while vehicle is PENDING_APPROVAL/,
      );
    });

    it('should reject owner setting AVAILABLE while vehicle is RENTED', async () => {
      const vehicle = createMockVehicle({
        ownerId: OWNER_ID,
        status: VehicleStatus.RENTED,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      await expect(
        service.updateVehicle(VEHICLE_ID, OWNER_ID, [UserRole.OWNER], {
          status: VehicleStatus.AVAILABLE,
        } as any),
      ).rejects.toThrow(
        'Cannot set status to AVAILABLE while vehicle is being rented',
      );
    });

    it('should merge multiple optional fields into update', async () => {
      const vehicle = createMockVehicle({ ownerId: OWNER_ID });
      const updated = createMockVehicle({ address: 'New', latitude: 11 });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockVehicleDelegate.update.mockResolvedValue(updated);

      await service.updateVehicle(VEHICLE_ID, OWNER_ID, [UserRole.OWNER], {
        address: 'New',
        latitude: 11,
        description: 'x',
        images: ['a'],
      } as any);

      expect(mockVehicleDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            address: 'New',
            latitude: 11,
            description: 'x',
            images: ['a'],
          }),
        }),
      );
    });

    it('should include type, batteryLevel, and pricePerHour when provided', async () => {
      const vehicle = createMockVehicle({ ownerId: OWNER_ID });
      const updated = createMockVehicle();
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockVehicleDelegate.update.mockResolvedValue(updated);

      await service.updateVehicle(VEHICLE_ID, OWNER_ID, [UserRole.OWNER], {
        type: VehicleType.ELECTRIC_BIKE,
        batteryLevel: 42,
        pricePerHour: 30000,
      } as any);

      expect(mockVehicleDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: VehicleType.ELECTRIC_BIKE,
            batteryLevel: 42,
            pricePerHour: 30000,
          }),
        }),
      );
    });

    it('should include instant-book policy fields when provided', async () => {
      const vehicle = createMockVehicle({ ownerId: OWNER_ID });
      const updated = createMockVehicle({ instantBook: true });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockVehicleDelegate.update.mockResolvedValue(updated);

      await service.updateVehicle(VEHICLE_ID, OWNER_ID, [UserRole.OWNER], {
        instantBook: true,
        dailyKmLimit: 100,
        excessKmPrice: 2500,
        weeklyDiscount: 8,
        monthlyDiscount: 18,
        allowSmoke: false,
        allowPets: true,
        geoRestriction: 'nationwide',
        batteryReturnMin: 25,
      } as any);

      expect(mockVehicleDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            instantBook: true,
            dailyKmLimit: 100,
            excessKmPrice: 2500,
            weeklyDiscount: 8,
            monthlyDiscount: 18,
            allowSmoke: false,
            allowPets: true,
            geoRestriction: 'nationwide',
            batteryReturnMin: 25,
          }),
        }),
      );
    });

    it('should include EV condition and battery lifecycle fields when provided', async () => {
      const vehicle = createMockVehicle({ ownerId: OWNER_ID });
      const updated = createMockVehicle({ batteryHealth: 91 });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockVehicleDelegate.update.mockResolvedValue(updated);

      await service.updateVehicle(VEHICLE_ID, OWNER_ID, [UserRole.OWNER], {
        firstRegistrationYear: 2023,
        condition: VehicleCondition.LIKE_NEW,
        batteryType: BatteryType.FIXED_NON_REMOVABLE,
        batteryHealth: 91,
        batteryCycleCount: 220,
        batteryLastServicedAt: '2026-05-02T00:00:00.000Z',
      } as any);

      expect(mockVehicleDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstRegistrationYear: 2023,
            condition: VehicleCondition.LIKE_NEW,
            batteryType: BatteryType.FIXED_NON_REMOVABLE,
            batteryHealth: 91,
            batteryCycleCount: 220,
            batteryLastServicedAt: new Date('2026-05-02T00:00:00.000Z'),
          }),
        }),
      );
    });
  });

  // ─── deleteVehicle ──────────────────────────────────────────────────────────

  describe('deleteVehicle', () => {
    it('should delete vehicle when called by the owner', async () => {
      // Arrange
      const vehicle = createMockVehicle({
        ownerId: OWNER_ID,
        status: VehicleStatus.AVAILABLE,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockBookingDelegate.findFirst.mockResolvedValue(null);
      mockVehicleDelegate.delete.mockResolvedValue(vehicle);

      // Act
      await service.deleteVehicle(VEHICLE_ID, OWNER_ID, [UserRole.OWNER]);

      // Assert
      expect(mockVehicleDelegate.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: VEHICLE_ID } }),
      );
    });

    it('should throw BadRequestException when vehicle is currently RENTED', async () => {
      // Arrange
      const vehicle = createMockVehicle({
        ownerId: OWNER_ID,
        status: VehicleStatus.RENTED,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      // Act & Assert
      await expect(
        service.deleteVehicle(VEHICLE_ID, OWNER_ID, [UserRole.OWNER]),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.deleteVehicle(VEHICLE_ID, OWNER_ID, [UserRole.OWNER]),
      ).rejects.toThrow(
        'Cannot delete a vehicle that is currently being rented',
      );
    });

    it('should throw NotFoundException when vehicle does not exist', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteVehicle(VEHICLE_ID, OWNER_ID, [UserRole.OWNER]),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow ADMIN to delete another user vehicle', async () => {
      const vehicle = createMockVehicle({
        ownerId: OTHER_OWNER_ID,
        status: VehicleStatus.AVAILABLE,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockBookingDelegate.findFirst.mockResolvedValue(null);
      mockVehicleDelegate.delete.mockResolvedValue(vehicle);

      await service.deleteVehicle(VEHICLE_ID, OWNER_ID, [UserRole.ADMIN]);

      expect(mockVehicleDelegate.delete).toHaveBeenCalled();
    });

    it('should block deletion when vehicle has active or upcoming bookings', async () => {
      const vehicle = createMockVehicle({
        ownerId: OWNER_ID,
        status: VehicleStatus.AVAILABLE,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockBookingDelegate.findFirst.mockResolvedValue({ id: 'booking-uuid' });

      await expect(
        service.deleteVehicle(VEHICLE_ID, OWNER_ID, [UserRole.OWNER]),
      ).rejects.toThrow(
        'Cannot delete a vehicle with active or upcoming bookings',
      );
      expect(mockVehicleDelegate.delete).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when not owner and not ADMIN', async () => {
      const vehicle = createMockVehicle({ ownerId: OTHER_OWNER_ID });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      await expect(
        service.deleteVehicle(VEHICLE_ID, OWNER_ID, [UserRole.RENTER]),
      ).rejects.toThrow('You can only delete your own vehicles');
    });
  });

  // ─── toggleAvailability ─────────────────────────────────────────────────────

  describe('toggleAvailability', () => {
    it('should set vehicle to UNAVAILABLE when it is currently AVAILABLE', async () => {
      // Arrange
      const vehicle = createMockVehicle({
        status: VehicleStatus.AVAILABLE,
        isAvailable: true,
      });
      const updatedVehicle = createMockVehicle({
        status: VehicleStatus.UNAVAILABLE,
        isAvailable: false,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockVehicleDelegate.update.mockResolvedValue(updatedVehicle);

      // Act
      const result = await service.toggleAvailability(VEHICLE_ID, OWNER_ID, [
        UserRole.OWNER,
      ]);

      // Assert
      expect(result.isAvailable).toBe(false);
      expect(result.status).toBe(VehicleStatus.UNAVAILABLE);
    });

    it('should throw BadRequestException when vehicle is RENTED', async () => {
      // Arrange
      const vehicle = createMockVehicle({
        status: VehicleStatus.RENTED,
        ownerId: OWNER_ID,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      // Act & Assert
      await expect(
        service.toggleAvailability(VEHICLE_ID, OWNER_ID, [UserRole.OWNER]),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.toggleAvailability(VEHICLE_ID, OWNER_ID, [UserRole.OWNER]),
      ).rejects.toThrow(/rental is complete/);
    });

    it('should include admin message for PENDING_APPROVAL', async () => {
      const vehicle = createMockVehicle({
        status: VehicleStatus.PENDING_APPROVAL,
        ownerId: OWNER_ID,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      await expect(
        service.toggleAvailability(VEHICLE_ID, OWNER_ID, [UserRole.OWNER]),
      ).rejects.toThrow(/Contact admin/);
    });

    it('should throw NotFoundException when vehicle missing', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(null);

      await expect(
        service.toggleAvailability(VEHICLE_ID, OWNER_ID, [UserRole.OWNER]),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner and not ADMIN', async () => {
      const vehicle = createMockVehicle({ ownerId: OTHER_OWNER_ID });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);

      await expect(
        service.toggleAvailability(VEHICLE_ID, OWNER_ID, [UserRole.OWNER]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should toggle UNAVAILABLE back to AVAILABLE', async () => {
      const vehicle = createMockVehicle({
        status: VehicleStatus.UNAVAILABLE,
        isAvailable: false,
        ownerId: OWNER_ID,
      });
      const updated = createMockVehicle({
        status: VehicleStatus.AVAILABLE,
        isAvailable: true,
      });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockVehicleDelegate.update.mockResolvedValue(updated);

      const result = await service.toggleAvailability(VEHICLE_ID, OWNER_ID, [
        UserRole.OWNER,
      ]);

      expect(result.isAvailable).toBe(true);
      expect(result.status).toBe(VehicleStatus.AVAILABLE);
    });
  });

  // ─── getAvailableVehicles — pagination & price edges ────────────────────────

  describe('getAvailableVehicles (pagination & single-sided price)', () => {
    it('should paginate ranked results in memory', async () => {
      mockVehicleDelegate.findMany.mockResolvedValue([
        createMockVehicle({ id: 'v1', totalTrips: 10 }),
        createMockVehicle({ id: 'v2', totalTrips: 1 }),
      ]);
      mockVehicleDelegate.count.mockResolvedValue(2);

      const result = await service.getAvailableVehicles({
        limit: 1,
        offset: 1,
      });

      expect(mockVehicleDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 200,
          skip: 0,
        }),
      );
      expect(result.vehicles).toHaveLength(1);
    });

    it('should apply only minPrice when maxPrice omitted', async () => {
      mockVehicleDelegate.findMany.mockResolvedValue([]);
      mockVehicleDelegate.count.mockResolvedValue(0);

      await service.getAvailableVehicles({ minPrice: 5000 });

      expect(mockVehicleDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            pricePerHour: expect.objectContaining({ gte: 5000 }),
          }),
        }),
      );
    });

    it('should apply only maxPrice when minPrice omitted', async () => {
      mockVehicleDelegate.findMany.mockResolvedValue([]);
      mockVehicleDelegate.count.mockResolvedValue(0);

      await service.getAvailableVehicles({ maxPrice: 99000 });

      expect(mockVehicleDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            pricePerHour: expect.objectContaining({ lte: 99000 }),
          }),
        }),
      );
    });
  });

  // ─── Availability calendar ─────────────────────────────────────────────────

  describe('availability calendar', () => {
    const availabilityWindow = {
      id: 'window-1',
      vehicleId: VEHICLE_ID,
      type: AvailabilityWindowType.AVAILABLE,
      recurrence: AvailabilityWindowRecurrence.ONCE,
      recurringWeekdays: [],
      timezoneOffsetMinutes: null,
      recurrenceEndsAt: null,
      startTime: new Date('2026-05-25T08:00:00.000Z'),
      endTime: new Date('2026-05-25T18:00:00.000Z'),
      note: 'Day rentals',
      createdAt: new Date('2026-05-22T00:00:00.000Z'),
      updatedAt: new Date('2026-05-22T00:00:00.000Z'),
    };

    it('should list availability windows for the owner', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(
        createMockVehicle({ ownerId: OWNER_ID }),
      );
      mockVehicleAvailabilityWindowDelegate.findMany.mockResolvedValue([
        availabilityWindow,
      ]);

      const result = await service.getAvailabilityWindows(
        VEHICLE_ID,
        OWNER_ID,
        [UserRole.OWNER],
      );

      expect(result).toHaveLength(1);
      expect(
        mockVehicleAvailabilityWindowDelegate.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { vehicleId: VEHICLE_ID },
        }),
      );
    });

    it('should expose active public timing rules without owner-only fields', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue({ id: VEHICLE_ID });
      mockVehicleAvailabilityWindowDelegate.findMany.mockResolvedValue([
        availabilityWindow,
        {
          ...availabilityWindow,
          id: 'weekly-block',
          type: AvailabilityWindowType.BLOCKED,
          recurrence: AvailabilityWindowRecurrence.WEEKLY,
          recurringWeekdays: [6],
          timezoneOffsetMinutes: 420,
          note: 'Private owner reason',
        },
      ]);

      const result = await service.getPublicAvailabilitySummary(VEHICLE_ID);

      expect(result.hasAvailableCalendar).toBe(true);
      expect(result.rules).toHaveLength(2);
      expect(result.rules[1]).toMatchObject({
        type: AvailabilityWindowType.BLOCKED,
        recurringWeekdays: [6],
      });
      expect(result.rules[1]).not.toHaveProperty('id');
      expect(result.rules[1]).not.toHaveProperty('note');
      expect(
        mockVehicleAvailabilityWindowDelegate.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ vehicleId: VEHICLE_ID }),
        }),
      );
    });

    it('should reject a public availability request for an unknown vehicle', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(null);

      await expect(
        service.getPublicAvailabilitySummary(VEHICLE_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject availability access for a non-owner', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(
        createMockVehicle({ ownerId: OTHER_OWNER_ID }),
      );

      await expect(
        service.getAvailabilityWindows(VEHICLE_ID, OWNER_ID, [UserRole.OWNER]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create a valid availability window', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(
        createMockVehicle({ ownerId: OWNER_ID }),
      );
      mockVehicleAvailabilityWindowDelegate.create.mockResolvedValue(
        availabilityWindow,
      );

      const result = await service.createAvailabilityWindow(
        VEHICLE_ID,
        OWNER_ID,
        [UserRole.OWNER],
        {
          type: AvailabilityWindowType.AVAILABLE,
          startTime: '2026-05-25T08:00:00.000Z',
          endTime: '2026-05-25T18:00:00.000Z',
          note: 'Day rentals',
        },
      );

      expect(result.id).toBe('window-1');
      expect(mockVehicleAvailabilityWindowDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vehicleId: VEHICLE_ID,
            type: AvailabilityWindowType.AVAILABLE,
            recurrence: AvailabilityWindowRecurrence.ONCE,
            recurringWeekdays: [],
            startTime: new Date('2026-05-25T08:00:00.000Z'),
            endTime: new Date('2026-05-25T18:00:00.000Z'),
          }),
        }),
      );
    });

    it('should create a weekly recurring availability rule', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(
        createMockVehicle({ ownerId: OWNER_ID }),
      );
      const weeklyWindow = {
        ...availabilityWindow,
        id: 'weekly-window',
        recurrence: AvailabilityWindowRecurrence.WEEKLY,
        recurringWeekdays: [1, 3, 5],
        timezoneOffsetMinutes: 420,
        recurrenceEndsAt: new Date('2026-12-31T16:59:59.999Z'),
      };
      mockVehicleAvailabilityWindowDelegate.create.mockResolvedValue(
        weeklyWindow,
      );

      const result = await service.createAvailabilityWindow(
        VEHICLE_ID,
        OWNER_ID,
        [UserRole.OWNER],
        {
          type: AvailabilityWindowType.AVAILABLE,
          recurrence: AvailabilityWindowRecurrence.WEEKLY,
          recurringWeekdays: [1, 3, 5],
          timezoneOffsetMinutes: 420,
          recurrenceEndsAt: '2026-12-31T16:59:59.999Z',
          startTime: '2026-05-25T01:00:00.000Z',
          endTime: '2026-05-25T11:00:00.000Z',
        },
      );

      expect(result.id).toBe('weekly-window');
      expect(mockVehicleAvailabilityWindowDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recurrence: AvailabilityWindowRecurrence.WEEKLY,
            recurringWeekdays: [1, 3, 5],
            timezoneOffsetMinutes: 420,
            recurrenceEndsAt: new Date('2026-12-31T16:59:59.999Z'),
          }),
        }),
      );
    });

    it('should reject weekly rules without selected weekdays', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(
        createMockVehicle({ ownerId: OWNER_ID }),
      );

      await expect(
        service.createAvailabilityWindow(
          VEHICLE_ID,
          OWNER_ID,
          [UserRole.OWNER],
          {
            type: AvailabilityWindowType.AVAILABLE,
            recurrence: AvailabilityWindowRecurrence.WEEKLY,
            recurringWeekdays: [],
            timezoneOffsetMinutes: 420,
            startTime: '2026-05-25T01:00:00.000Z',
            endTime: '2026-05-25T11:00:00.000Z',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject availability windows with end before start', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(
        createMockVehicle({ ownerId: OWNER_ID }),
      );

      await expect(
        service.createAvailabilityWindow(
          VEHICLE_ID,
          OWNER_ID,
          [UserRole.OWNER],
          {
            type: AvailabilityWindowType.AVAILABLE,
            startTime: '2026-05-25T18:00:00.000Z',
            endTime: '2026-05-25T08:00:00.000Z',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject overlapping availability windows of the same type', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(
        createMockVehicle({ ownerId: OWNER_ID }),
      );
      mockVehicleAvailabilityWindowDelegate.findFirst.mockResolvedValue({
        id: 'window-existing',
      });

      await expect(
        service.createAvailabilityWindow(
          VEHICLE_ID,
          OWNER_ID,
          [UserRole.OWNER],
          {
            type: AvailabilityWindowType.AVAILABLE,
            startTime: '2026-05-25T10:00:00.000Z',
            endTime: '2026-05-25T12:00:00.000Z',
          },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(
        mockVehicleAvailabilityWindowDelegate.create,
      ).not.toHaveBeenCalled();
    });

    it('should update an owned weekly rule without conflicting with itself', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(
        createMockVehicle({ ownerId: OWNER_ID }),
      );
      mockVehicleAvailabilityWindowDelegate.findFirst.mockResolvedValue({
        id: 'weekly-window',
      });
      mockVehicleAvailabilityWindowDelegate.findMany.mockResolvedValue([]);
      const updatedWindow = {
        ...availabilityWindow,
        id: 'weekly-window',
        recurrence: AvailabilityWindowRecurrence.WEEKLY,
        recurringWeekdays: [2, 4],
        timezoneOffsetMinutes: 420,
        recurrenceEndsAt: new Date('2026-12-31T16:59:59.999Z'),
      };
      mockVehicleAvailabilityWindowDelegate.update.mockResolvedValue(
        updatedWindow,
      );

      const result = await service.updateAvailabilityWindow(
        VEHICLE_ID,
        'weekly-window',
        OWNER_ID,
        [UserRole.OWNER],
        {
          type: AvailabilityWindowType.AVAILABLE,
          recurrence: AvailabilityWindowRecurrence.WEEKLY,
          recurringWeekdays: [2, 4],
          timezoneOffsetMinutes: 420,
          recurrenceEndsAt: '2026-12-31T16:59:59.999Z',
          startTime: '2026-05-25T01:00:00.000Z',
          endTime: '2026-05-25T11:00:00.000Z',
        },
      );

      expect(result.id).toBe('weekly-window');
      expect(
        mockVehicleAvailabilityWindowDelegate.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: 'weekly-window' } }),
        }),
      );
      expect(mockVehicleAvailabilityWindowDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'weekly-window' },
          data: expect.objectContaining({
            recurringWeekdays: [2, 4],
            recurrence: AvailabilityWindowRecurrence.WEEKLY,
          }),
        }),
      );
    });

    it('should reject updates for missing availability windows', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(
        createMockVehicle({ ownerId: OWNER_ID }),
      );
      mockVehicleAvailabilityWindowDelegate.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAvailabilityWindow(
          VEHICLE_ID,
          'missing-window',
          OWNER_ID,
          [UserRole.OWNER],
          {
            type: AvailabilityWindowType.AVAILABLE,
            startTime: '2026-05-25T08:00:00.000Z',
            endTime: '2026-05-25T18:00:00.000Z',
          },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete an owned availability window', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(
        createMockVehicle({ ownerId: OWNER_ID }),
      );
      mockVehicleAvailabilityWindowDelegate.findFirst.mockResolvedValue({
        id: 'window-1',
      });
      mockVehicleAvailabilityWindowDelegate.delete.mockResolvedValue(
        availabilityWindow,
      );

      await service.deleteAvailabilityWindow(VEHICLE_ID, 'window-1', OWNER_ID, [
        UserRole.OWNER,
      ]);

      expect(mockVehicleAvailabilityWindowDelegate.delete).toHaveBeenCalledWith(
        {
          where: { id: 'window-1' },
        },
      );
    });
  });

  // ─── adminUpdateStatus ─────────────────────────────────────────────────────

  describe('adminUpdateStatus', () => {
    it('should update status when vehicle exists', async () => {
      const vehicle = createMockVehicle();
      const updated = createMockVehicle({ status: VehicleStatus.AVAILABLE });
      mockVehicleDelegate.findUnique.mockResolvedValue(vehicle);
      mockVehicleDelegate.update.mockResolvedValue(updated);

      const result = await service.adminUpdateStatus(
        VEHICLE_ID,
        VehicleStatus.AVAILABLE,
      );

      expect(result.status).toBe(VehicleStatus.AVAILABLE);
      expect(mockVehicleDelegate.update).toHaveBeenCalledWith({
        where: { id: VEHICLE_ID },
        data: { status: VehicleStatus.AVAILABLE },
      });
    });

    it('should throw NotFoundException when vehicle missing', async () => {
      mockVehicleDelegate.findUnique.mockResolvedValue(null);

      await expect(
        service.adminUpdateStatus(VEHICLE_ID, VehicleStatus.AVAILABLE),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
