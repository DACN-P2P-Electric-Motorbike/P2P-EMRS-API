import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, PoolConfig } from 'pg';

// Disable TLS verification for self-signed certificates (Aiven)
// This should only be used in development/staging
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function shouldUseDatabaseSsl(connectionString: string): boolean {
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode');
    if (sslMode === 'disable') return false;
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return false;
    return true;
  } catch {
    return true;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    const poolConfig: PoolConfig = {
      connectionString,
      ssl: shouldUseDatabaseSsl(connectionString)
        ? { rejectUnauthorized: false }
        : undefined,
    };

    const pool = new Pool(poolConfig);

    const adapter = new PrismaPg(pool, {
      schema: 'public',
    });

    super({
      adapter,
      log:
        process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      errorFormat: 'colorless',
    });

    this.pool = pool;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Successfully connected to Aiven PostgreSQL database');
    } catch (error) {
      this.logger.error('❌ Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('🔌 Disconnected from database');
  }

  // Helper method to clean database (for testing only)
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production environment');
    }

    this.logger.warn('🧹 Cleaning database...');

    // Delete in correct order (considering foreign keys)
    await this.user.deleteMany();

    this.logger.log('✅ Database cleaned');
  }

  // Helper method to check database connection
  async checkConnection(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database connection check failed', error);
      return false;
    }
  }
}
