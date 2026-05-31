import { Logger } from '@nestjs/common';

// Mock the pg Pool and Prisma adapter so the PrismaService constructor does
// not open a real database connection.
const mockPoolEnd = jest.fn().mockResolvedValue(undefined);
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ end: mockPoolEnd })),
}));
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

// Mock PrismaClient so `super(...)` does not try to load the engine.
jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    $connect = jest.fn().mockResolvedValue(undefined);
    $disconnect = jest.fn().mockResolvedValue(undefined);
    $queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    user = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
    constructor(..._args: unknown[]) {}
  },
}));

// Import AFTER the mocks are registered.
import { PrismaService } from './prisma.service';
import { Pool } from 'pg';

describe('PrismaService', () => {
  const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL =
      'postgresql://user:pass@localhost:5432/emrs_db?schema=public';
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => {
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('throws when DATABASE_URL is not set', () => {
    delete process.env.DATABASE_URL;
    expect(() => new PrismaService()).toThrow(
      'DATABASE_URL environment variable is not set',
    );
  });

  it('disables SSL for a localhost connection string', () => {
    process.env.DATABASE_URL =
      'postgresql://user:pass@localhost:5432/emrs_db';
    new PrismaService();
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: undefined }),
    );
  });

  it('disables SSL when sslmode=disable is requested', () => {
    process.env.DATABASE_URL =
      'postgresql://user:pass@db.example.com:5432/emrs_db?sslmode=disable';
    new PrismaService();
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: undefined }),
    );
  });

  it('enables relaxed SSL for a remote host', () => {
    process.env.DATABASE_URL =
      'postgresql://user:pass@db.aivencloud.com:5432/emrs_db';
    new PrismaService();
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: false } }),
    );
  });

  it('enables SSL when the connection string cannot be parsed', () => {
    process.env.DATABASE_URL = 'not-a-valid-url';
    new PrismaService();
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: false } }),
    );
  });

  it('connects on module init', async () => {
    const service = new PrismaService();
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect((service as any).$connect).toHaveBeenCalled();
  });

  it('rethrows when the initial connection fails', async () => {
    const service = new PrismaService();
    (service as any).$connect.mockRejectedValueOnce(new Error('no db'));
    await expect(service.onModuleInit()).rejects.toThrow('no db');
  });

  it('disconnects and closes the pool on module destroy', async () => {
    const service = new PrismaService();
    await service.onModuleDestroy();
    expect((service as any).$disconnect).toHaveBeenCalled();
    expect(mockPoolEnd).toHaveBeenCalled();
  });

  it('cleans the database outside production', async () => {
    process.env.NODE_ENV = 'test';
    const service = new PrismaService();
    await service.cleanDatabase();
    expect((service as any).user.deleteMany).toHaveBeenCalled();
  });

  it('refuses to clean the database in production', async () => {
    process.env.NODE_ENV = 'production';
    const service = new PrismaService();
    await expect(service.cleanDatabase()).rejects.toThrow(
      'Cannot clean database in production environment',
    );
    expect((service as any).user.deleteMany).not.toHaveBeenCalled();
  });

  it('reports a healthy connection check', async () => {
    const service = new PrismaService();
    await expect(service.checkConnection()).resolves.toBe(true);
  });

  it('reports an unhealthy connection check on query failure', async () => {
    const service = new PrismaService();
    (service as any).$queryRaw.mockRejectedValueOnce(new Error('down'));
    await expect(service.checkConnection()).resolves.toBe(false);
  });
});
