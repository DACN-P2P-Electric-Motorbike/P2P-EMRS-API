import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KycStatus, KycVerification } from '@prisma/client';
import { Expose } from 'class-transformer';

export class KycVerificationEntity implements KycVerification {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty()
  @Expose()
  selfieUrl: string;

  @ApiProperty()
  @Expose()
  idCardFrontUrl: string;

  @ApiProperty()
  @Expose()
  idCardBackUrl: string;

  @ApiProperty({ enum: KycStatus })
  @Expose()
  status: KycStatus;

  @ApiPropertyOptional()
  @Expose()
  rejectionReason: string | null;

  @ApiPropertyOptional()
  @Expose()
  reviewedBy: string | null;

  @ApiPropertyOptional()
  @Expose()
  reviewedAt: Date | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Applicant details included in admin responses',
  })
  @Expose()
  user?: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    trustScore: number;
  };

  constructor(partial: Partial<KycVerificationEntity>) {
    Object.assign(this, partial);
  }

  static fromPrisma(
    verification: KycVerification & {
      user?: {
        id: string;
        fullName: string;
        email: string;
        phone: string;
        trustScore: number;
      };
    },
  ): KycVerificationEntity {
    return new KycVerificationEntity(verification);
  }
}

export type KycStatusResponse =
  | {
      status: 'NOT_SUBMITTED';
      verification: null;
    }
  | {
      status: KycStatus;
      verification: KycVerificationEntity;
    };
