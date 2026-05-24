/**
 * @module Vehicle Tests — Controller
 * @member Member A — Dương Hoàng Long
 * @coverage target ≥80%
 * @testCount 12
 *
 * Unit tests for VehiclesController.
 * VehiclesService is fully mocked — no DB, no HTTP server.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { VehicleStatus, VehicleBrand, UserRole } from '@prisma/client';
import { AvailabilityWindowType } from '@prisma/client';

import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleEntity } from './entities/vehicle.entity';
import { UserEntity } from '../auth/entities/user.entity';
import {
  createMockVehicle,
  OWNER_ID,
  VEHICLE_ID,
} from '../../test/factories/vehicle.factory';

// ─── Mock Service ─────────────────────────────────────────────────────────────
const mockVehiclesService = {
  registerVehicle: jest.fn(),
  getMyVehicles: jest.fn(),
  getAvailableVehicles: jest.fn(),
  getVehicleById: jest.fn(),
  getAvailabilityWindows: jest.fn(),
  createAvailabilityWindow: jest.fn(),
  deleteAvailabilityWindow: jest.fn(),
  updateVehicle: jest.fn(),
  toggleAvailability: jest.fn(),
  deleteVehicle: jest.fn(),
};

// ─── Mock User object injected by JwtAuthGuard via @CurrentUser() ─────────────
function createMockUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: OWNER_ID,
    email: 'owner@test.com',
    fullName: 'Test Owner',
    phone: '0901234567',
    avatarUrl: null,
    roles: [UserRole.OWNER],
    status: 'ACTIVE' as any,
    trustScore: 100,
    idCardNum: null,
    address: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    hasRole: () => true,
    isRenter: false,
    isOwner: true,
    isAdmin: false,
    hasMultipleRoles: false,
    ...overrides,
  } as UserEntity;
}

// ─── Test suite ───────────────────────────────────────────────────────────────
describe('VehiclesController', () => {
  let controller: VehiclesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [
        {
          provide: VehiclesService,
          useValue: mockVehiclesService,
        },
      ],
    }).compile();

    controller = module.get<VehiclesController>(VehiclesController);

    jest.clearAllMocks();
  });

  // ─── registerVehicle ────────────────────────────────────────────────────────
  describe('POST / (registerVehicle)', () => {
    it('should delegate to VehiclesService.registerVehicle and return its result', async () => {
      // Arrange
      const vehicle = VehicleEntity.fromPrisma(
        createMockVehicle({ status: VehicleStatus.PENDING_APPROVAL }),
      );
      mockVehiclesService.registerVehicle.mockResolvedValue(vehicle);

      const user = createMockUser();
      const dto = {
        licensePlate: '59A-12345',
        model: 'Klara S',
        brand: VehicleBrand.VINFAST,
        pricePerHour: 25000,
        address: '123 Nguyen Trai',
        images: [],
      } as any;

      // Act
      const result = await controller.registerVehicle(user, dto);

      // Assert
      expect(result.status).toBe(VehicleStatus.PENDING_APPROVAL);
      expect(mockVehiclesService.registerVehicle).toHaveBeenCalledWith(
        user.id,
        user.roles,
        dto,
      );
    });

    it('should propagate ForbiddenException when service throws it (renter trying to register)', async () => {
      // Arrange
      mockVehiclesService.registerVehicle.mockRejectedValue(
        new ForbiddenException(
          'Only users with OWNER role can register vehicles',
        ),
      );
      const user = createMockUser({ roles: [UserRole.RENTER] });

      // Act & Assert
      await expect(controller.registerVehicle(user, {} as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should propagate ConflictException when service throws it (duplicate plate)', async () => {
      // Arrange
      mockVehiclesService.registerVehicle.mockRejectedValue(
        new ConflictException(
          'A vehicle with this license plate already exists',
        ),
      );
      const user = createMockUser();

      // Act & Assert
      await expect(controller.registerVehicle(user, {} as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── getMyVehicles ──────────────────────────────────────────────────────────
  describe('GET /my-vehicles', () => {
    it('should return a list of vehicles for the current user', async () => {
      // Arrange
      const vehicles = [
        VehicleEntity.fromPrisma(createMockVehicle({ id: 'v1' })),
        VehicleEntity.fromPrisma(createMockVehicle({ id: 'v2' })),
      ];
      mockVehiclesService.getMyVehicles.mockResolvedValue(vehicles);
      const user = createMockUser();

      // Act
      const result = await controller.getMyVehicles(user);

      // Assert
      expect(result).toHaveLength(2);
      expect(mockVehiclesService.getMyVehicles).toHaveBeenCalledWith(user.id);
    });
  });

  // ─── getAvailableVehicles ────────────────────────────────────────────────────
  describe('GET /available', () => {
    it('should call service with parsed query params and return result', async () => {
      // Arrange
      const mockResponse = { vehicles: [], total: 0 };
      mockVehiclesService.getAvailableVehicles.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.getAvailableVehicles(
        'ELECTRIC_SCOOTER',
        '10000',
        '50000',
        '10',
        '0',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      // Assert
      expect(mockVehiclesService.getAvailableVehicles).toHaveBeenCalledWith({
        type: 'ELECTRIC_SCOOTER',
        minPrice: 10000,
        maxPrice: 50000,
        limit: 10,
        offset: 0,
        startTime: undefined,
        endTime: undefined,
        latitude: undefined,
        longitude: undefined,
        radiusKm: undefined,
        instantBook: undefined,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should parse instantBook query param as boolean', async () => {
      const mockResponse = { vehicles: [], total: 0 };
      mockVehiclesService.getAvailableVehicles.mockResolvedValue(mockResponse);

      await controller.getAvailableVehicles(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'true',
      );

      expect(mockVehiclesService.getAvailableVehicles).toHaveBeenCalledWith(
        expect.objectContaining({ instantBook: true }),
      );
    });
  });

  // ─── availability calendar ─────────────────────────────────────────────────
  describe('availability calendar endpoints', () => {
    it('should delegate availability listing to service', async () => {
      const user = createMockUser();
      const windows = [
        {
          id: 'window-1',
          vehicleId: VEHICLE_ID,
          type: AvailabilityWindowType.AVAILABLE,
          startTime: new Date('2026-05-25T08:00:00.000Z'),
          endTime: new Date('2026-05-25T18:00:00.000Z'),
          note: null,
          createdAt: new Date('2026-05-22T00:00:00.000Z'),
          updatedAt: new Date('2026-05-22T00:00:00.000Z'),
        },
      ];
      mockVehiclesService.getAvailabilityWindows.mockResolvedValue(windows);

      const result = await controller.getAvailabilityWindows(
        VEHICLE_ID,
        user,
        '2026-05-25T00:00:00.000Z',
        '2026-05-26T00:00:00.000Z',
      );

      expect(result).toEqual(windows);
      expect(mockVehiclesService.getAvailabilityWindows).toHaveBeenCalledWith(
        VEHICLE_ID,
        user.id,
        user.roles,
        '2026-05-25T00:00:00.000Z',
        '2026-05-26T00:00:00.000Z',
      );
    });

    it('should delegate availability creation to service', async () => {
      const user = createMockUser();
      const dto = {
        type: AvailabilityWindowType.BLOCKED,
        startTime: '2026-05-25T12:00:00.000Z',
        endTime: '2026-05-25T14:00:00.000Z',
      };
      mockVehiclesService.createAvailabilityWindow.mockResolvedValue({
        id: 'window-1',
        vehicleId: VEHICLE_ID,
        ...dto,
      });

      await controller.createAvailabilityWindow(VEHICLE_ID, user, dto);

      expect(mockVehiclesService.createAvailabilityWindow).toHaveBeenCalledWith(
        VEHICLE_ID,
        user.id,
        user.roles,
        dto,
      );
    });

    it('should delegate availability deletion to service', async () => {
      const user = createMockUser();
      mockVehiclesService.deleteAvailabilityWindow.mockResolvedValue(undefined);

      await controller.deleteAvailabilityWindow(VEHICLE_ID, 'window-1', user);

      expect(mockVehiclesService.deleteAvailabilityWindow).toHaveBeenCalledWith(
        VEHICLE_ID,
        'window-1',
        user.id,
        user.roles,
      );
    });
  });

  // ─── getVehicleById ─────────────────────────────────────────────────────────
  describe('GET /:id', () => {
    it('should return vehicle when ID exists', async () => {
      // Arrange
      const vehicle = VehicleEntity.fromPrisma(createMockVehicle());
      mockVehiclesService.getVehicleById.mockResolvedValue(vehicle);

      // Act
      const result = await controller.getVehicleById(VEHICLE_ID);

      // Assert
      expect(result.id).toBe(VEHICLE_ID);
      expect(mockVehiclesService.getVehicleById).toHaveBeenCalledWith(
        VEHICLE_ID,
      );
    });

    it('should propagate NotFoundException when service throws it', async () => {
      // Arrange
      mockVehiclesService.getVehicleById.mockRejectedValue(
        new NotFoundException('Vehicle not found'),
      );

      // Act & Assert
      await expect(controller.getVehicleById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.getVehicleById('nonexistent')).rejects.toThrow(
        'Vehicle not found',
      );
    });
  });

  // ─── updateVehicle ──────────────────────────────────────────────────────────
  describe('PATCH /:id', () => {
    it('should delegate to service.updateVehicle and return updated vehicle', async () => {
      // Arrange
      const updated = VehicleEntity.fromPrisma(
        createMockVehicle({ model: 'Updated Model' }),
      );
      mockVehiclesService.updateVehicle.mockResolvedValue(updated);
      const user = createMockUser();

      // Act
      const result = await controller.updateVehicle(VEHICLE_ID, user, {
        model: 'Updated Model',
      } as any);

      // Assert
      expect(result.model).toBe('Updated Model');
      expect(mockVehiclesService.updateVehicle).toHaveBeenCalledWith(
        VEHICLE_ID,
        user.id,
        user.roles,
        { model: 'Updated Model' },
      );
    });
  });

  // ─── deleteVehicle ──────────────────────────────────────────────────────────
  describe('DELETE /:id', () => {
    it('should call service.deleteVehicle and return void', async () => {
      // Arrange
      mockVehiclesService.deleteVehicle.mockResolvedValue(undefined);
      const user = createMockUser();

      // Act
      await controller.deleteVehicle(VEHICLE_ID, user);

      // Assert
      expect(mockVehiclesService.deleteVehicle).toHaveBeenCalledWith(
        VEHICLE_ID,
        user.id,
        user.roles,
      );
    });

    it('should propagate BadRequestException when vehicle is rented', async () => {
      // Arrange
      mockVehiclesService.deleteVehicle.mockRejectedValue(
        new BadRequestException(
          'Cannot delete a vehicle that is currently being rented',
        ),
      );
      const user = createMockUser();

      // Act & Assert
      await expect(controller.deleteVehicle(VEHICLE_ID, user)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
