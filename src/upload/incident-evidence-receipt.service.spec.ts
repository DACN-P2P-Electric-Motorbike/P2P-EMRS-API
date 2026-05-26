import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IncidentEvidenceReceiptService } from './incident-evidence-receipt.service';

const makeConfig = (values: Record<string, string | undefined>) =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as ConfigService;

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
});
