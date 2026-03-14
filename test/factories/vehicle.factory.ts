/**
 * @module Vehicle Tests — Factory
 * @member Member A — Dương Hoàng Long
 * @coverage target ≥80%
 */
import {
  Prisma,
  VehicleBrand,
  VehicleFeature,
  VehicleStatus,
  VehicleType,
} from '@prisma/client';

// ─── Stable test UUIDs ────────────────────────────────────────────────────────
/** UUID for the vehicle owner used across tests */
export const OWNER_ID = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';

/** UUID for the default vehicle used across tests */
export const VEHICLE_ID = 'bbbbbbbb-1111-4000-8000-bbbbbbbbbbbb';

// ─── Factory ──────────────────────────────────────────────────────────────────
/** Shape of a full Prisma Vehicle record returned from the DB */
export type MockVehicle = {
  id: string;
  name: string | null;
  type: VehicleType;
  brand: VehicleBrand;
  model: string;
  year: number | null;
  licensePlate: string;
  description: string | null;
  images: string[];
  features: VehicleFeature[];
  batteryCapacity: number | null;
  batteryLevel: number;
  maxSpeed: number | null;
  range: number | null;
  pricePerHour: Prisma.Decimal;
  pricePerDay: Prisma.Decimal | null;
  deposit: number | null;
  status: VehicleStatus;
  isAvailable: boolean;
  latitude: number | null;
  longitude: number | null;
  address: string;
  licenseNumber: string | null;
  licenseFront: string | null;
  licenseBack: string | null;
  ownerId: string;
  totalTrips: number;
  totalRating: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Creates a valid Vehicle mock object.
 * @param overrides – any field you want to override from the defaults
 */
export function createMockVehicle(
  overrides: Partial<MockVehicle> = {},
): MockVehicle {
  return {
    id: VEHICLE_ID,
    name: 'VinFast Klara S 2024',
    type: VehicleType.ELECTRIC_SCOOTER,
    brand: VehicleBrand.VINFAST,
    model: 'Klara S',
    year: 2024,
    licensePlate: '59A-12345',
    description: 'Well-maintained electric scooter',
    images: ['https://example.com/image1.jpg'],
    features: [VehicleFeature.FAST_CHARGING],
    batteryCapacity: 2.5,
    batteryLevel: 100,
    maxSpeed: 60,
    range: 70,
    pricePerHour: new Prisma.Decimal(25000),
    pricePerDay: new Prisma.Decimal(300000),
    deposit: 500000,
    status: VehicleStatus.AVAILABLE,
    isAvailable: true,
    latitude: 10.7769,
    longitude: 106.7009,
    address: '123 Nguyen Trai, Quan 1, TP.HCM',
    licenseNumber: '987654321',
    licenseFront: 'https://example.com/license-front.jpg',
    licenseBack: 'https://example.com/license-back.jpg',
    ownerId: OWNER_ID,
    totalTrips: 0,
    totalRating: 5.0,
    reviewCount: 0,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Creates a CreateVehicleDto-compatible object for use in integration tests.
 */
export function createVehicleDto(
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
