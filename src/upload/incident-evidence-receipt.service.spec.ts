import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { IncidentEvidenceReceiptService } from './incident-evidence-receipt.service';

const makeConfig = (values: Record<string, string | undefined>) =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as ConfigService;

/** Builds a structurally-valid, correctly-signed receipt for an arbitrary payload. */
const signReceipt = (secret: string, encodedPayload: string): string => {
  const signedValue = `incident-upload:v1:${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedValue)
    .digest('base64url');
  return `${signedValue}:${signature}`;
};

describe('IncidentEvidenceReceiptService', () => {
  const uploaderId = 'renter-uuid';
  const url = 'https://cdn.example.com/incidents/photo.jpg';
  const uploadedAt = new Date('2026-05-25T03:00:00.000Z');

  it('issues and verifies a server upload receipt', () => {
    const service = new IncidentEvidenceReceiptService(
      makeConfig({
        INCIDENT_EVIDENCE_RECEIPT_SECRET: '',
        JWT_SECRET: 'receipt-secret',
      }),
    );

    const receipt = service.issue(uploaderId, url, uploadedAt);

    expect(service.verify(receipt, uploaderId, url)).toEqual({
      url,
      uploadedAt: uploadedAt.toISOString(),
    });
  });

  it('rejects a receipt used for another uploader or URL', () => {
    const service = new IncidentEvidenceReceiptService(
      makeConfig({ JWT_SECRET: 'receipt-secret' }),
    );
    const receipt = service.issue(uploaderId, url, uploadedAt);

    expect(() => service.verify(receipt, 'other-user', url)).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.verify(receipt, uploaderId, `${url}?modified=1`),
    ).toThrow(BadRequestException);
  });

  it('rejects tampered receipts and requires a configured signing secret', () => {
    const service = new IncidentEvidenceReceiptService(
      makeConfig({ JWT_SECRET: 'receipt-secret' }),
    );
    const receipt = service.issue(uploaderId, url, uploadedAt);

    expect(() => service.verify(`${receipt}x`, uploaderId, url)).toThrow(
      BadRequestException,
    );
    expect(() => new IncidentEvidenceReceiptService(makeConfig({}))).toThrow(
      'JWT_SECRET is required',
    );
  });

  it('rejects receipts with a malformed structure', () => {
    const service = new IncidentEvidenceReceiptService(
      makeConfig({ JWT_SECRET: 'receipt-secret' }),
    );

    expect(() => service.verify('only:two', uploaderId, url)).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.verify('wrong:prefix:payload:signature', uploaderId, url),
    ).toThrow(BadRequestException);
    expect(() =>
      service.verify('incident-upload:v1::signature', uploaderId, url),
    ).toThrow(BadRequestException);
  });

  it('rejects a correctly-signed receipt whose payload is not valid JSON', () => {
    const secret = 'receipt-secret';
    const service = new IncidentEvidenceReceiptService(
      makeConfig({ JWT_SECRET: secret }),
    );
    const encodedPayload = Buffer.from('not-json').toString('base64url');

    expect(() =>
      service.verify(signReceipt(secret, encodedPayload), uploaderId, url),
    ).toThrow(BadRequestException);
  });
});
