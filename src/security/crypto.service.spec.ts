import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { CryptoService } from './crypto.service';

const makeConfig = (values: Record<string, string | undefined>) =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as ConfigService;

describe('CryptoService', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('encrypts and decrypts strings with AES-256-GCM', () => {
    const service = new CryptoService(
      makeConfig({ DATA_ENCRYPTION_KEY: 'a'.repeat(64) }),
    );

    const encrypted = service.encryptString('sensitive-value');

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toBe('sensitive-value');
    expect(service.decryptString(encrypted)).toBe('sensitive-value');
  });

  it('uses deterministic encryption for trimmed lookup values', () => {
    const service = new CryptoService(
      makeConfig({ DATA_ENCRYPTION_KEY: 'b'.repeat(64) }),
    );

    const first = service.encryptStringDeterministic(' 012345678901 ');
    const second = service.encryptStringDeterministic('012345678901');

    expect(first).toBe(second);
    expect(service.decryptString(first)).toBe('012345678901');
  });

  it('encrypts and decrypts JSON payloads', () => {
    const service = new CryptoService(
      makeConfig({ DATA_ENCRYPTION_KEY: 'c'.repeat(64) }),
    );

    const encrypted = service.encryptJson({
      gateway: 'payos',
      orderCode: 123,
    });

    expect(typeof encrypted).toBe('string');
    expect(service.tryDecryptJson(encrypted)).toEqual({
      gateway: 'payos',
      orderCode: 123,
    });
  });

  it('returns null when encrypting null or undefined JSON values', () => {
    const service = new CryptoService(
      makeConfig({ DATA_ENCRYPTION_KEY: 'c'.repeat(64) }),
    );

    expect(service.encryptJson(null)).toBeNull();
    expect(service.encryptJson(undefined)).toBeNull();
  });

  it('leaves plaintext values readable for backward compatibility', () => {
    const service = new CryptoService(
      makeConfig({ DATA_ENCRYPTION_KEY: 'd'.repeat(64) }),
    );

    expect(service.decryptString('legacy-value')).toBe('legacy-value');
    expect(service.tryDecryptJson({ status: 'legacy' })).toEqual({
      status: 'legacy',
    });
  });

  it('masks all but the final four characters', () => {
    const service = new CryptoService(
      makeConfig({ DATA_ENCRYPTION_KEY: 'e'.repeat(64) }),
    );

    expect(service.maskSensitive('123456789012')).toBe('********9012');
    expect(service.maskSensitive('123')).toBe('***');
    expect(service.maskSensitive(null)).toBeNull();
  });

  it('requires DATA_ENCRYPTION_KEY in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => {
      new CryptoService(makeConfig({ JWT_SECRET: 'fallback' }));
    }).toThrow('DATA_ENCRYPTION_KEY is required in production');
  });

  it('warns and derives a development key from the JWT secret fallback', () => {
    process.env.NODE_ENV = 'development';
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const service = new CryptoService(makeConfig({ JWT_SECRET: 'fallback' }));

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('DATA_ENCRYPTION_KEY is not configured'),
    );

    const encrypted = service.encryptString('secret');
    expect(service.decryptString(encrypted)).toBe('secret');
  });

  it('falls back to the built-in development secret when nothing is configured', () => {
    process.env.NODE_ENV = 'test';

    const service = new CryptoService(makeConfig({}));

    const encrypted = service.encryptString('value');
    expect(service.decryptString(encrypted)).toBe('value');
  });

  it('derives a 32-byte key from base64 secrets and arbitrary strings', () => {
    const base64Key = Buffer.alloc(32, 7).toString('base64');
    const base64Service = new CryptoService(
      makeConfig({ DATA_ENCRYPTION_KEY: base64Key }),
    );
    const fromBase64 = base64Service.encryptString('payload');
    expect(base64Service.decryptString(fromBase64)).toBe('payload');

    const shaService = new CryptoService(
      makeConfig({ DATA_ENCRYPTION_KEY: 'short-non-hex-secret' }),
    );
    const fromSha = shaService.encryptString('payload');
    expect(shaService.decryptString(fromSha)).toBe('payload');
  });

  it('returns null and the original value for undecryptable inputs', () => {
    const service = new CryptoService(
      makeConfig({ DATA_ENCRYPTION_KEY: 'f'.repeat(64) }),
    );

    expect(service.tryDecryptString(null)).toBeNull();
    expect(service.tryDecryptString(undefined)).toBeNull();

    // Looks encrypted but is corrupt, so decryption throws and we warn + return as-is
    const corrupt = 'enc:v1:aaaa:bbbb:cccc';
    expect(service.tryDecryptString(corrupt)).toBe(corrupt);
  });

  it('returns null when tryDecryptJson cannot recover a value', () => {
    const service = new CryptoService(
      makeConfig({ DATA_ENCRYPTION_KEY: 'a'.repeat(64) }),
    );
    jest.spyOn(service, 'tryDecryptString').mockReturnValue(null);

    expect(service.tryDecryptJson('enc:v1:aaaa:bbbb:cccc')).toBeNull();
  });

  it('returns the raw decrypted string when it is not valid JSON', () => {
    const service = new CryptoService(
      makeConfig({ DATA_ENCRYPTION_KEY: 'a'.repeat(64) }),
    );
    const encryptedPlain = service.encryptString('not-json');

    expect(service.tryDecryptJson(encryptedPlain)).toBe('not-json');
  });

  it('masks empty strings as null and short values entirely', () => {
    const service = new CryptoService(
      makeConfig({ DATA_ENCRYPTION_KEY: 'a'.repeat(64) }),
    );

    expect(service.maskSensitive('')).toBeNull();
    expect(service.maskSensitive('ab')).toBe('**');
  });
});
