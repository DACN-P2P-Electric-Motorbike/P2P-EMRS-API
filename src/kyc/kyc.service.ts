import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus, TrustScoreEventType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TrustScoreService } from '../trust-score/trust-score.service';
import { QueryKycDto, ReviewKycDto, SubmitKycDto } from './dto';
import {
  KycStatusResponse,
  KycVerificationEntity,
} from './entities/kyc-verification.entity';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trustScoreService: TrustScoreService,
  ) {}

  async submit(
    userId: string,
    dto: SubmitKycDto,
  ): Promise<KycVerificationEntity> {
    const existing = await this.prisma.kycVerification.findUnique({
      where: { userId },
    });

    if (existing?.status === KycStatus.APPROVED) {
      throw new BadRequestException('KYC verification is already approved');
    }

    const verification = await this.prisma.kycVerification.upsert({
      where: { userId },
      create: {
        userId,
        selfieUrl: dto.selfieUrl,
        idCardFrontUrl: dto.idCardFrontUrl,
        idCardBackUrl: dto.idCardBackUrl,
      },
      update: {
        selfieUrl: dto.selfieUrl,
        idCardFrontUrl: dto.idCardFrontUrl,
        idCardBackUrl: dto.idCardBackUrl,
        status: KycStatus.PENDING,
        rejectionReason: null,
        reviewedBy: null,
        reviewedAt: null,
      },
    });

    this.logger.log(`KYC submitted for user ${userId}`);
    return KycVerificationEntity.fromPrisma(verification);
  }

  async getStatus(userId: string): Promise<KycStatusResponse> {
    const verification = await this.prisma.kycVerification.findUnique({
      where: { userId },
    });

    if (!verification) {
      return { status: 'NOT_SUBMITTED', verification: null };
    }

    return {
      status: verification.status,
      verification: KycVerificationEntity.fromPrisma(verification),
    };
  }

  async listForAdmin(query: QueryKycDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = query.status ? { status: query.status } : {};

    const [items, total] = await Promise.all([
      this.prisma.kycVerification.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              trustScore: true,
            },
          },
        },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.kycVerification.count({ where }),
    ]);

    return {
      data: items.map((item) => KycVerificationEntity.fromPrisma(item)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async review(
    verificationId: string,
    dto: ReviewKycDto,
    adminId: string,
  ): Promise<KycVerificationEntity> {
    if (dto.status === KycStatus.PENDING) {
      throw new BadRequestException('Admin review must approve or reject KYC');
    }

    const rejectionReason = dto.rejectionReason?.trim();
    if (dto.status === KycStatus.REJECTED && !rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId },
    });

    if (!verification) {
      throw new NotFoundException('KYC verification not found');
    }

    const wasApproved = verification.status === KycStatus.APPROVED;
    const reviewed = await this.prisma.kycVerification.update({
      where: { id: verificationId },
      data: {
        status: dto.status,
        rejectionReason:
          dto.status === KycStatus.REJECTED ? rejectionReason : null,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            trustScore: true,
          },
        },
      },
    });

    if (dto.status === KycStatus.APPROVED && !wasApproved) {
      await this.trustScoreService.recordPositiveEvent(
        verification.userId,
        TrustScoreEventType.KYC_VERIFIED,
        5,
        'KYC verification approved',
        { verificationId, adminId },
      );
    }

    this.logger.log(
      `Admin ${adminId} reviewed KYC ${verificationId}: ${dto.status}`,
    );
    return KycVerificationEntity.fromPrisma(reviewed);
  }

  async assertApproved(userId: string, action: 'booking' | 'vehicle') {
    const approved = await this.prisma.kycVerification.findFirst({
      where: {
        userId,
        status: KycStatus.APPROVED,
      },
      select: { id: true },
    });

    if (approved) return;

    const actionLabel =
      action === 'booking' ? 'create a booking' : 'register a vehicle';
    throw new ForbiddenException(
      `KYC verification is required before you can ${actionLabel}. Please submit your selfie and ID card for review.`,
    );
  }
}
