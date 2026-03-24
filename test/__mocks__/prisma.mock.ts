/**
 * @module Prisma Mock
 * @member Member A — Dương Hoàng Long
 *
 * Provides a fully typed mock of PrismaService for unit tests.
 * Each model method is a jest.fn() so tests can use mockResolvedValue / mockRejectedValue, etc.
 */

/** Helper type: wraps all methods of T with jest.Mock */
type MockedMethods<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? jest.Mock : T[K];
};

/** Partial Prisma delegate with the operations we use in tests */
export type PrismaModelMock = MockedMethods<{
  findUnique: (...args: any[]) => Promise<any>;
  findMany: (...args: any[]) => Promise<any[]>;
  findFirst: (...args: any[]) => Promise<any>;
  create: (...args: any[]) => Promise<any>;
  update: (...args: any[]) => Promise<any>;
  delete: (...args: any[]) => Promise<any>;
  count: (...args: any[]) => Promise<number>;
  upsert: (...args: any[]) => Promise<any>;
  updateMany: (...args: any[]) => Promise<any>;
}>;

/** Creates a fresh Prisma model delegate mock */
function createModelMock(): PrismaModelMock {
  return {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  };
}

/** Full PrismaService mock with vehicle, booking, and user delegates */
export const prismaMock = {
  vehicle: createModelMock(),
  booking: createModelMock(),
  user: createModelMock(),
  // Raw query support (used by some services)
  $queryRaw: jest.fn(),
  $queryRawUnsafe: jest.fn(),
  $executeRaw: jest.fn(),
  $transaction: jest
    .fn()
    .mockImplementation((fn: (prisma: any) => any) => fn(prismaMock)),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

/** Resets all mocks on prismaMock — call this in beforeEach */
export function resetPrismaMock(): void {
  (Object.keys(prismaMock) as Array<keyof typeof prismaMock>).forEach(
    (modelKey) => {
      const delegate = prismaMock[modelKey];
      if (delegate && typeof delegate === 'object') {
        (Object.keys(delegate) as Array<keyof typeof delegate>).forEach(
          (methodKey) => {
            const method = delegate[methodKey];
            if (typeof method === 'function' && 'mockReset' in method) {
              method.mockReset();
            }
          },
        );
      }
    },
  );
  // Re-setup $transaction so it still delegates by default
  prismaMock.$transaction.mockImplementation((fn: (prisma: any) => any) =>
    fn(prismaMock),
  );
}
