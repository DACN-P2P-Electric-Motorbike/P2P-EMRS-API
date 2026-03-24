/**
 * @module Vehicle Tests
 * @member Member A — Dương Hoàng Long
 * @coverage target ≥80%
 * @testCount 23
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
  VehicleStatus,
  VehicleType,
  VehicleBrand,
  UserRole,
  Prisma,
} from '@prisma/client';

import { VehiclesService } from './vehicles.service';
import { PrismaService } from '../database/prisma.service';
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
  const mockUserDelegate = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };
  const mockEventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        {
          provide: PrismaService,
          useValue: {
            vehicle: mockVehicleDelegate,
            user: mockUserDelegate,
          },
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<VehiclesService>(VehiclesService);

    // Clear all mocks before each test
    jest.clearAllMocks();
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
          where: expect.objectContaining({ status: VehicleStatus.AVAILABLE }),
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
    });
  });
});
