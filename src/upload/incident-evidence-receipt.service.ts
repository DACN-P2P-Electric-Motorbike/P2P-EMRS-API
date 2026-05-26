import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';

interface IncidentEvidenceReceiptPayload {
  version: 1;
  uploaderId: string;
  url: string;
  uploadedAt: string;
}

export interface VerifiedIncidentEvidenceUpload {
  url: string;
  uploadedAt: string;
}

@Injectable()
export class IncidentEvidenceReceiptService {
  private readonly prefix = 'incident-upload:v1';
  private readonly secret: string;

  constructor(private readonly configService: ConfigService) {
    const secret =
      this.configService
        .get<string>('INCIDENT_EVIDENCE_RECEIPT_SECRET')
        ?.trim() || this.configService.get<string>('JWT_SECRET')?.trim();

    if (!secret) {
      throw new Error(
        'INCIDENT_EVIDENCE_RECEIPT_SECRET or JWT_SECRET is required for incident evidence receipts',
      );
    }

    this.secret = secret;
  }

  issue(uploaderId: string, url: string, uploadedAt = new Date()): string {
    const payload: IncidentEvidenceReceiptPayload = {
      version: 1,
      uploaderId,
      url,
      uploadedAt: uploadedAt.toISOString(),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signedValue = `${this.prefix}:${encodedPayload}`;

    return `${signedValue}:${this.sign(signedValue)}`;
  }

  verify(
    receipt: string,
    uploaderId: string,
    url: string,
  ): VerifiedIncidentEvidenceUpload {
    const parts = receipt.split(':');
    if (
      parts.length !== 4 ||
      `${parts[0]}:${parts[1]}` !== this.prefix ||
      !parts[2] ||
      !parts[3]
    ) {
      throw this.invalidReceipt();
    }

    const signedValue = `${this.prefix}:${parts[2]}`;
    const expectedSignature = Buffer.from(this.sign(signedValue), 'base64url');
    const actualSignature = Buffer.from(parts[3], 'base64url');

    if (
      expectedSignature.length !== actualSignature.length ||
      !crypto.timingSafeEqual(expectedSignature, actualSignature)
    ) {
      throw this.invalidReceipt();
    }

    let payload: IncidentEvidenceReceiptPayload;
    try {
      payload = JSON.parse(
        Buffer.from(parts[2], 'base64url').toString('utf8'),
      ) as IncidentEvidenceReceiptPayload;
    } catch {
      throw this.invalidReceipt();
    }

    if (
      payload.version !== 1 ||
      payload.uploaderId !== uploaderId ||
      payload.url !== url ||
      Number.isNaN(Date.parse(payload.uploadedAt))
    ) {
      throw this.invalidReceipt();
    }

    return {
      url: payload.url,
      uploadedAt: payload.uploadedAt,
    };
  }

  private sign(value: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(value)
      .digest('base64url');
  }

  private invalidReceipt(): BadRequestException {
    return new BadRequestException('Incident evidence receipt is invalid');
  }
}
