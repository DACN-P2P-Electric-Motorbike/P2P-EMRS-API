import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, TrustScoreEventType, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, PoolConfig } from 'pg';

const DEFAULT_EMAIL = 'nhutlong20112004@gmail.com';
const DEFAULT_SCORE = 150;

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg?.slice(prefix.length);
}

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

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env'));

  const email = parseArg('email') ?? DEFAULT_EMAIL;
  const scoreRaw = parseArg('score');
  const targetScore = scoreRaw === undefined ? DEFAULT_SCORE : Number(scoreRaw);

  if (!Number.isFinite(targetScore) || targetScore < 0 || targetScore > 150) {
    throw new Error('Score must be a number between 0 and 150');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required. Set it in the environment or .env',
    );
  }

  const poolConfig: PoolConfig = {
    connectionString,
    ssl: shouldUseDatabaseSsl(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  };
  const pool = new Pool(poolConfig);
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool, { schema: 'public' }),
  });

  try {
    const user =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      }));
    if (!user) {
      throw new Error(`User not found for email ${email}`);
    }

    const nextStatus =
      user.status === UserStatus.RESTRICTED ? UserStatus.ACTIVE : user.status;

    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          trustScore: targetScore,
          status: nextStatus,
        },
      }),
      prisma.trustScoreEvent.create({
        data: {
          userId: user.id,
          type: TrustScoreEventType.MANUAL_ADJUSTMENT,
          delta: targetScore - user.trustScore,
          scoreBefore: user.trustScore,
          scoreAfter: targetScore,
          reason: 'Local support reset to maximum trust score for booking QA',
          metadata: {
            script: 'scripts/set-trust-score.ts',
            email,
            previousStatus: user.status,
            nextStatus,
          },
        },
      }),
    ]);

    console.log(
      `Updated ${email}: trustScore ${user.trustScore} -> ${updated.trustScore}, status ${user.status} -> ${updated.status}`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
