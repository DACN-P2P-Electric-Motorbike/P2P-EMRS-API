import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly prefix = 'enc:v1';
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const configuredKey = this.configService.get<string>('DATA_ENCRYPTION_KEY');
    const fallbackSecret =
      this.configService.get<string>('JWT_SECRET') ??
      'dreamride-local-development-encryption-key';

    if (!configuredKey && process.env.NODE_ENV === 'production') {
      throw new Error(
        'DATA_ENCRYPTION_KEY is required in production for AES-256 at-rest encryption',
      );
    }

    if (!configuredKey) {
      this.logger.warn(
        'DATA_ENCRYPTION_KEY is not configured; deriving a development-only key from JWT_SECRET/fallback',
      );
    }

    this.key = this.normalizeKey(configuredKey ?? fallbackSecret);
  }

  encryptString(value: string): string {
    return this.encryptWithIv(value, crypto.randomBytes(12));
  }

  encryptStringDeterministic(value: string): string {
    const normalized = value.trim();
    const iv = crypto
      .createHmac('sha256', this.key)
      .update(normalized)
      .digest()
      .subarray(0, 12);

    return this.encryptWithIv(normalized, iv);
  }

  decryptString(value: string): string {
    if (!this.isEncryptedString(value)) return value;

    const [, , ivB64, tagB64, cipherB64] = value.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(ivB64, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(cipherB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  tryDecryptString(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return this.decryptString(value);
    } catch (error) {
      this.logger.warn(`Unable to decrypt value: ${(error as Error).message}`);
      return value;
    }
  }

  encryptJson(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return this.encryptString(JSON.stringify(value));
  }

  tryDecryptJson(value: unknown): unknown {
    if (typeof value !== 'string' || !this.isEncryptedString(value)) {
      return value;
    }

    const decrypted = this.tryDecryptString(value);
    if (!decrypted) return null;

    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  }

  maskSensitive(value: string | null | undefined): string | null {
    if (!value) return null;
    if (value.length <= 4) return '*'.repeat(value.length);
    return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
  }

  isEncryptedString(value: string): boolean {
    return value.startsWith(`${this.prefix}:`);
  }

  private encryptWithIv(value: string, iv: Buffer): string {
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      this.prefix,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  private normalizeKey(value: string): Buffer {
    if (/^[a-fA-F0-9]{64}$/.test(value)) {
      return Buffer.from(value, 'hex');
    }

    const base64 = Buffer.from(value, 'base64');
    if (base64.length === 32) return base64;

    return crypto.createHash('sha256').update(value).digest();
  }
}
