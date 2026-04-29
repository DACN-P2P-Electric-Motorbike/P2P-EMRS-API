import { ConfigService } from '@nestjs/config';
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
});
