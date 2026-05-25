import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  BookingStatus,
  DepositLedger,
  DepositLedgerStatus,
  HandoverType,
  IncidentStatus,
  OwnerPayout,
  PayoutStatus,
  PaymentStatus,
  PostTripCharge,
  PostTripChargeSource,
  PostTripChargeStatus,
  PostTripChargeType,
  NotificationType,
  Prisma,
  TripStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationGateway } from '../notification/notification.gateway';
import { NotificationService } from '../notification/notification.service';
import { CreatePostTripChargeDto } from './dto/create-post-trip-charge.dto';
import { DisputePostTripChargeDto } from './dto/dispute-post-trip-charge.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';
import { UpdatePayoutStatusDto } from './dto/update-payout-status.dto';
import {
  DepositLedgerEntity,
  FinancialSummaryEntity,
  OwnerPayoutEntity,
  PostTripChargeEntity,
} from './entities/financial.entity';

type FinancialBooking = Prisma.BookingGetPayload<{
  include: {
    payment: true;
    trip: true;
    depositLedger: true;
    postTripCharges: true;
    ownerPayout: true;
    handovers: true;
    vehicle: {
      select: {
        pricePerHour: true;
        dailyKmLimit: true;
        excessKmPrice: true;
        batteryReturnMin: true;
      };
    };
  };
}>;

type ComputedCharge = {
  type: PostTripChargeType;
  amount: number;
  quantity?: number;
  unitPrice?: number;
  description: string;
  evidence: Prisma.InputJsonValue;
};

type FinancialNotificationRecipient = 'renter' | 'owner';

@Injectable()
export class FinancialService {
  private readonly logger = new Logger(FinancialService.name);
  private readonly LATE_RETURN_GRACE_MINUTES = 15;
  private readonly DEFAULT_LOW_BATTERY_FEE_PER_PERCENT = 5000;
  private readonly ROADSIDE_SUPPORT_CREDIT_AMOUNT = 200_000;
  private readonly RELEASE_REVIEW_HOURS = 24;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly notificationService?: NotificationService,
    @Optional()
    private readonly notificationGateway?: NotificationGateway,
  ) {}

  async recordPaymentCompleted(
    bookingId: string,
    paymentId: string,
  ): Promise<DepositLedgerEntity | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        depositLedger: true,
        payment: true,
      },
    });

    if (!booking) {
      this.logger.warn(
        `Cannot create deposit ledger: booking ${bookingId} was not found`,
      );
      return null;
    }

    if (booking.payment?.status !== PaymentStatus.COMPLETED) {
      this.logger.warn(
        `Skipping deposit ledger for booking ${bookingId}: payment is not completed`,
      );
      return null;
    }

    const heldAmount = Math.max(0, booking.deposit ?? 0);
    const now = new Date();
    const baseData = {
      paymentId,
      heldAmount,
      heldAt: heldAmount > 0 ? now : null,
      notes:
        heldAmount > 0
          ? 'Deposit recorded from completed booking payment'
          : 'No deposit required for this booking',
    };

    if (!booking.depositLedger) {
      const created = await this.prisma.depositLedger.create({
        data: {
          bookingId,
          status:
            heldAmount > 0
              ? DepositLedgerStatus.HELD
              : DepositLedgerStatus.NOT_HELD,
          pendingChargeAmount: 0,
          capturedAmount: 0,
          releasedAmount: 0,
          refundedAmount: 0,
          ...baseData,
        },
      });
      await this.notifyDepositUpdated({
        booking,
        depositLedger: created,
        transition: 'HELD',
        title: 'Tiền cọc đã được giữ',
        message: `Tiền cọc ${this.formatMoney(created.heldAmount)} VND đã được ghi nhận cho booking của bạn.`,
        recipients: ['renter'],
      });
      return DepositLedgerEntity.fromPrisma(created);
    }

    const nextStatus =
      booking.depositLedger.status === DepositLedgerStatus.NOT_HELD &&
      heldAmount > 0
        ? DepositLedgerStatus.HELD
        : booking.depositLedger.status;

    const shouldNotifyHold =
      heldAmount > 0 &&
      (booking.depositLedger.status !== nextStatus ||
        booking.depositLedger.heldAmount !== heldAmount ||
        !booking.depositLedger.heldAt);

    const updated = await this.prisma.depositLedger.update({
      where: { id: booking.depositLedger.id },
      data: {
        paymentId,
        heldAmount,
        status: nextStatus,
        heldAt: booking.depositLedger.heldAt ?? baseData.heldAt,
        notes: booking.depositLedger.notes ?? baseData.notes,
      },
    });

    if (shouldNotifyHold) {
      await this.notifyDepositUpdated({
        booking,
        depositLedger: updated,
        transition: 'HELD',
        title: 'Tiền cọc đã được giữ',
        message: `Tiền cọc ${this.formatMoney(updated.heldAmount)} VND đã được ghi nhận cho booking của bạn.`,
        recipients: ['renter'],
      });
    }

    return DepositLedgerEntity.fromPrisma(updated);
  }

  async getBookingFinancialSummary(
    bookingId: string,
    userId: string,
    roles: UserRole[] = [],
  ): Promise<FinancialSummaryEntity> {
    const booking = await this.findBookingWithFinancials(bookingId);

    if (!booking || !this.canViewBooking(booking, userId, roles)) {
      throw new NotFoundException('Booking not found');
    }

    return this.toSummary(booking);
  }

  async getAdminFinancialQueue(limit = 50): Promise<{
    deposits: Array<
      DepositLedger & {
        booking: {
          id: string;
          renterId: string;
          ownerId: string;
          vehicleId: string;
        };
      }
    >;
    charges: Array<
      PostTripCharge & {
        booking: {
          id: string;
          renterId: string;
          ownerId: string;
          vehicleId: string;
        };
      }
    >;
    payouts: Array<
      OwnerPayout & {
        booking: {
          id: string;
          renterId: string;
          ownerId: string;
          vehicleId: string;
        };
      }
    >;
  }> {
    const take = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
    const [deposits, charges, payouts] = await Promise.all([
      this.prisma.depositLedger.findMany({
        where: {
          status: {
            in: [
              DepositLedgerStatus.HELD,
              DepositLedgerStatus.PENDING_CHARGES,
              DepositLedgerStatus.PARTIALLY_CAPTURED,
              DepositLedgerStatus.RELEASE_PENDING,
              DepositLedgerStatus.DISPUTED,
            ],
          },
        },
        include: {
          booking: {
            select: {
              id: true,
              renterId: true,
              ownerId: true,
              vehicleId: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take,
      }),
      this.prisma.postTripCharge.findMany({
        where: {
          status: {
            in: [
              PostTripChargeStatus.PENDING_REVIEW,
              PostTripChargeStatus.APPROVED,
              PostTripChargeStatus.DISPUTED,
            ],
          },
        },
        include: {
          booking: {
            select: {
              id: true,
              renterId: true,
              ownerId: true,
              vehicleId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.ownerPayout.findMany({
        where: {
          status: {
            in: [
              PayoutStatus.PENDING,
              PayoutStatus.ON_HOLD,
              PayoutStatus.PROCESSING,
              PayoutStatus.FAILED,
            ],
          },
        },
        include: {
          booking: {
            select: {
              id: true,
              renterId: true,
              ownerId: true,
              vehicleId: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take,
      }),
    ]);

    return { deposits, charges, payouts };
  }

  async recalculatePostTripChargesForBooking(
    bookingId: string,
  ): Promise<FinancialSummaryEntity> {
    const booking = await this.findBookingWithFinancials(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (
      booking.status !== BookingStatus.COMPLETED ||
      booking.trip?.status !== TripStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Post-trip charges can only be calculated after the trip is completed',
      );
    }

    if (
      !booking.depositLedger &&
      booking.payment?.status === PaymentStatus.COMPLETED
    ) {
      await this.recordPaymentCompleted(booking.id, booking.payment.id);
    }

    const computedCharges = this.computeSystemCharges(booking);
    const computedTypes = new Set(computedCharges.map((charge) => charge.type));
    const existingSystemCharges = booking.postTripCharges.filter(
      (charge) => charge.source === PostTripChargeSource.SYSTEM,
    );

    for (const computed of computedCharges) {
      const existing = existingSystemCharges.find(
        (charge) => charge.type === computed.type,
      );
      if (existing) {
        if (existing.status === PostTripChargeStatus.PENDING_REVIEW) {
          await this.prisma.postTripCharge.update({
            where: { id: existing.id },
            data: computed,
          });
        }
        continue;
      }

      await this.prisma.postTripCharge.create({
        data: {
          bookingId: booking.id,
          tripId: booking.trip?.id,
          source: PostTripChargeSource.SYSTEM,
          status: PostTripChargeStatus.PENDING_REVIEW,
          ...computed,
        },
      });
    }

    const obsoleteCharges = existingSystemCharges.filter(
      (charge) =>
        charge.status === PostTripChargeStatus.PENDING_REVIEW &&
        !computedTypes.has(charge.type),
    );
    for (const obsolete of obsoleteCharges) {
      await this.prisma.postTripCharge.update({
        where: { id: obsolete.id },
        data: {
          status: PostTripChargeStatus.CANCELLED,
          reviewedAt: new Date(),
        },
      });
    }

    await this.syncDepositForBooking(booking.id);
    const updated = await this.findBookingWithFinancials(booking.id);
    if (!updated) throw new NotFoundException('Booking not found');
    return this.toSummary(updated);
  }

  async createManualPostTripCharge(
    bookingId: string,
    userId: string,
    roles: UserRole[] = [],
    dto: CreatePostTripChargeDto,
  ): Promise<FinancialSummaryEntity> {
    const booking = await this.findBookingWithFinancials(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const isAdmin = roles.includes(UserRole.ADMIN);
    const isOwner = booking.ownerId === userId;
    if (!isAdmin && !isOwner) {
      throw new NotFoundException('Booking not found');
    }

    if (
      booking.status !== BookingStatus.COMPLETED ||
      booking.trip?.status !== TripStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Manual post-trip charges can only be added after trip completion',
      );
    }

    const allowedTypes: PostTripChargeType[] = [
      PostTripChargeType.CLEANING,
      PostTripChargeType.DAMAGE,
      PostTripChargeType.ROADSIDE_ASSISTANCE,
      PostTripChargeType.OTHER,
    ];
    if (!allowedTypes.includes(dto.type)) {
      throw new BadRequestException('Unsupported manual post-trip charge type');
    }

    const finalizedDepositStatuses: DepositLedgerStatus[] = [
      DepositLedgerStatus.CAPTURED,
      DepositLedgerStatus.RELEASED,
      DepositLedgerStatus.REFUNDED,
    ];
    if (
      booking.depositLedger &&
      finalizedDepositStatuses.includes(booking.depositLedger.status)
    ) {
      throw new BadRequestException(
        'Cannot add manual charges after the deposit is finalized',
      );
    }

    const now = new Date();
    const roadsideAdjustment = this.applyRoadsideSupportCredit(
      booking,
      dto.type,
      this.roundMoney(dto.amount),
    );
    const isFullyCoveredByRoadsideSupport =
      roadsideAdjustment.appliedAmount > 0 && roadsideAdjustment.amount === 0;
    const status = isFullyCoveredByRoadsideSupport
      ? PostTripChargeStatus.WAIVED
      : isAdmin
        ? PostTripChargeStatus.APPROVED
        : PostTripChargeStatus.PENDING_REVIEW;

    const createdCharge = await this.prisma.postTripCharge.create({
      data: {
        bookingId: booking.id,
        tripId: booking.trip?.id,
        type: dto.type,
        source: isAdmin
          ? PostTripChargeSource.ADMIN
          : PostTripChargeSource.OWNER,
        status,
        amount: roadsideAdjustment.amount,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        description: dto.description.trim(),
        reviewedBy: isAdmin || isFullyCoveredByRoadsideSupport ? userId : null,
        reviewedAt: isAdmin || isFullyCoveredByRoadsideSupport ? now : null,
        evidence: {
          manual: {
            createdBy: userId,
            createdRole: isAdmin ? UserRole.ADMIN : UserRole.OWNER,
            createdAt: now.toISOString(),
            evidenceUrls: dto.evidenceUrls ?? [],
            ...(roadsideAdjustment.appliedAmount > 0
              ? {
                  requestedAmount: roadsideAdjustment.requestedAmount,
                  roadsideSupport: {
                    creditAmount: roadsideAdjustment.creditAmount,
                    creditUsedBefore: roadsideAdjustment.creditUsedBefore,
                    creditAppliedAmount: roadsideAdjustment.appliedAmount,
                    billableAmount: roadsideAdjustment.amount,
                  },
                }
              : {}),
          },
        },
      },
    });

    await this.syncDepositForBooking(booking.id);
    const updated = await this.findBookingWithFinancials(booking.id);
    if (!updated) throw new NotFoundException('Booking not found');
    await this.notifyPostTripChargeUpdated({
      booking: updated,
      charge: createdCharge,
      senderId: userId,
      transition: 'CREATED',
      title: 'Phí sau chuyến mới',
      message: `Phí ${createdCharge.type} ${this.formatMoney(createdCharge.amount)} VND đã được ghi nhận và đang chờ xử lý.`,
      recipients: isAdmin ? ['renter', 'owner'] : ['renter'],
    });
    return this.toSummary(updated);
  }

  async updateChargeStatus(
    chargeId: string,
    adminId: string,
    dto: UpdateChargeStatusDto,
  ): Promise<FinancialSummaryEntity> {
    const charge = await this.prisma.postTripCharge.findUnique({
      where: { id: chargeId },
    });

    if (!charge) {
      throw new NotFoundException('Post-trip charge not found');
    }

    if (
      ![
        PostTripChargeStatus.APPROVED,
        PostTripChargeStatus.WAIVED,
        PostTripChargeStatus.DISPUTED,
        PostTripChargeStatus.CANCELLED,
      ].includes(dto.status)
    ) {
      throw new BadRequestException('Unsupported charge review status');
    }

    if (
      (
        [
          PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
          PostTripChargeStatus.PAID,
        ] as PostTripChargeStatus[]
      ).includes(charge.status)
    ) {
      throw new BadRequestException('Finalized charges cannot be changed');
    }

    const nextAmount =
      dto.status === PostTripChargeStatus.APPROVED && dto.amount != null
        ? dto.amount
        : charge.amount;

    const reviewedCharge = await this.prisma.postTripCharge.update({
      where: { id: chargeId },
      data: {
        status: dto.status,
        amount: nextAmount,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        evidence: this.mergeEvidence(charge.evidence, 'review', {
          reviewNotes: dto.notes?.trim() || undefined,
          reviewedBy: adminId,
          reviewedAt: new Date().toISOString(),
        }),
      },
    });

    await this.syncDepositForBooking(charge.bookingId);
    const booking = await this.findBookingWithFinancials(charge.bookingId);
    if (!booking) throw new NotFoundException('Booking not found');
    await this.notifyPostTripChargeUpdated({
      booking,
      charge: reviewedCharge,
      senderId: adminId,
      transition: dto.status,
      title: 'Phí sau chuyến đã được xử lý',
      message: `Phí ${reviewedCharge.type} hiện ở trạng thái ${dto.status}.`,
      recipients: ['renter', 'owner'],
    });
    return this.toSummary(booking);
  }

  async disputePostTripCharge(
    chargeId: string,
    renterId: string,
    dto: DisputePostTripChargeDto,
  ): Promise<FinancialSummaryEntity> {
    const charge = await this.prisma.postTripCharge.findUnique({
      where: { id: chargeId },
    });

    if (!charge) {
      throw new NotFoundException('Post-trip charge not found');
    }

    const booking = await this.findBookingWithFinancials(charge.bookingId);
    if (!booking || booking.renterId !== renterId) {
      throw new NotFoundException('Post-trip charge not found');
    }

    if (
      !(
        [
          PostTripChargeStatus.PENDING_REVIEW,
          PostTripChargeStatus.APPROVED,
        ] as PostTripChargeStatus[]
      ).includes(charge.status)
    ) {
      throw new BadRequestException(
        'Only pending or approved charges can be disputed',
      );
    }

    const now = new Date();
    const disputedCharge = await this.prisma.postTripCharge.update({
      where: { id: chargeId },
      data: {
        status: PostTripChargeStatus.DISPUTED,
        evidence: this.mergeEvidence(charge.evidence, 'dispute', {
          reason: dto.reason.trim(),
          disputedBy: renterId,
          disputedAt: now.toISOString(),
          evidenceUrls: dto.evidenceUrls ?? [],
        }),
      },
    });

    await this.syncDepositForBooking(charge.bookingId);
    const updated = await this.findBookingWithFinancials(charge.bookingId);
    if (!updated) throw new NotFoundException('Booking not found');
    await this.notifyPostTripChargeUpdated({
      booking: updated,
      charge: disputedCharge,
      senderId: renterId,
      transition: 'DISPUTED',
      title: 'Phí sau chuyến bị tranh chấp',
      message: `Người thuê đã tranh chấp phí ${disputedCharge.type}. Admin cần xem xét trước khi xử lý cọc.`,
      recipients: ['owner'],
    });
    return this.toSummary(updated);
  }

  async captureApprovedChargesFromDeposit(
    bookingId: string,
    adminId: string,
  ): Promise<FinancialSummaryEntity> {
    const booking = await this.findBookingWithFinancials(bookingId);

    if (!booking) throw new NotFoundException('Booking not found');
    if (!booking.depositLedger) {
      throw new BadRequestException('Deposit ledger has not been created');
    }

    const approvedCharges = booking.postTripCharges.filter(
      (charge) => charge.status === PostTripChargeStatus.APPROVED,
    );
    const totalApproved = this.sumCharges(approvedCharges);
    if (totalApproved <= 0) {
      throw new BadRequestException('No approved charges to capture');
    }

    const availableDeposit =
      booking.depositLedger.heldAmount - booking.depositLedger.capturedAmount;
    if (totalApproved > availableDeposit) {
      throw new BadRequestException(
        'Approved charges exceed the available deposit balance',
      );
    }

    const now = new Date();
    const nextCaptured = booking.depositLedger.capturedAmount + totalApproved;
    const nextReleased = Math.max(
      0,
      booking.depositLedger.heldAmount - nextCaptured,
    );
    const nextStatus =
      nextReleased === 0
        ? DepositLedgerStatus.CAPTURED
        : DepositLedgerStatus.PARTIALLY_CAPTURED;

    await this.prisma.$transaction([
      this.prisma.postTripCharge.updateMany({
        where: {
          id: { in: approvedCharges.map((charge) => charge.id) },
        },
        data: {
          status: PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
          reviewedBy: adminId,
          reviewedAt: now,
        },
      }),
      this.prisma.depositLedger.update({
        where: { id: booking.depositLedger.id },
        data: {
          status: nextStatus,
          capturedAmount: nextCaptured,
          pendingChargeAmount: 0,
          releasedAmount: nextReleased,
          notes: `Approved charges captured from deposit by admin ${adminId}`,
        },
      }),
    ]);

    const updated = await this.findBookingWithFinancials(bookingId);
    if (!updated) throw new NotFoundException('Booking not found');
    await this.notifyDepositUpdated({
      booking: updated,
      depositLedger: updated.depositLedger,
      senderId: adminId,
      transition: nextStatus,
      title: 'Tiền cọc đã được khấu trừ',
      message: `Admin đã khấu trừ ${this.formatMoney(totalApproved)} VND phí đã duyệt từ tiền cọc.`,
      recipients: ['renter', 'owner'],
      data: {
        capturedAmount: totalApproved,
      },
    });
    return this.toSummary(updated);
  }

  async releaseDeposit(
    bookingId: string,
    adminId: string,
  ): Promise<FinancialSummaryEntity> {
    const booking = await this.findBookingWithFinancials(bookingId);

    if (!booking) throw new NotFoundException('Booking not found');
    if (!booking.depositLedger) {
      throw new BadRequestException('Deposit ledger has not been created');
    }

    const blockingCharge = booking.postTripCharges.find((charge) =>
      (
        [
          PostTripChargeStatus.PENDING_REVIEW,
          PostTripChargeStatus.APPROVED,
          PostTripChargeStatus.DISPUTED,
        ] as PostTripChargeStatus[]
      ).includes(charge.status),
    );
    if (blockingCharge) {
      throw new BadRequestException(
        'Cannot release deposit while charges are pending, approved, or disputed',
      );
    }

    const blockingIncident = await this.prisma.incidentReport.findFirst({
      where: {
        bookingId,
        status: {
          in: [IncidentStatus.OPEN, IncidentStatus.UNDER_REVIEW],
        },
      },
      select: { id: true },
    });
    if (blockingIncident) {
      throw new BadRequestException(
        'Cannot release deposit while incident reports are open or under review',
      );
    }

    const releasableAmount = Math.max(
      0,
      booking.depositLedger.heldAmount - booking.depositLedger.capturedAmount,
    );
    await this.prisma.depositLedger.update({
      where: { id: booking.depositLedger.id },
      data: {
        status:
          releasableAmount > 0
            ? DepositLedgerStatus.RELEASED
            : DepositLedgerStatus.CAPTURED,
        pendingChargeAmount: 0,
        releasedAmount: releasableAmount,
        releasedAt: new Date(),
        notes: `Deposit release recorded by admin ${adminId}`,
      },
    });
    await this.createOrRefreshOwnerPayout(bookingId, adminId);

    const updated = await this.findBookingWithFinancials(bookingId);
    if (!updated) throw new NotFoundException('Booking not found');
    await this.notifyDepositUpdated({
      booking: updated,
      depositLedger: updated.depositLedger,
      senderId: adminId,
      transition: releasableAmount > 0 ? 'RELEASED' : 'CAPTURED',
      title:
        releasableAmount > 0
          ? 'Tiền cọc đã được hoàn'
          : 'Tiền cọc đã được chốt',
      message:
        releasableAmount > 0
          ? `Admin đã ghi nhận hoàn ${this.formatMoney(releasableAmount)} VND tiền cọc còn lại.`
          : 'Không còn tiền cọc để hoàn sau khi đối soát các khoản phí.',
      recipients: ['renter'],
      data: {
        releasedAmount: releasableAmount,
      },
    });
    return this.toSummary(updated);
  }

  async createOrRefreshOwnerPayout(
    bookingId: string,
    adminId: string,
  ): Promise<OwnerPayoutEntity> {
    const booking = await this.findBookingWithFinancials(bookingId);

    if (!booking) throw new NotFoundException('Booking not found');

    if (
      booking.ownerPayout &&
      (
        [PayoutStatus.COMPLETED, PayoutStatus.CANCELLED] as PayoutStatus[]
      ).includes(booking.ownerPayout.status)
    ) {
      return OwnerPayoutEntity.fromPrisma(booking.ownerPayout);
    }

    const holdReason = await this.getPayoutHoldReason(booking);
    const finalChargeAmount = this.sumCharges(
      booking.postTripCharges.filter((charge) =>
        (
          [
            PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
            PostTripChargeStatus.PAID,
          ] as PostTripChargeStatus[]
        ).includes(charge.status),
      ),
    );
    const payment = booking.payment;
    const grossRentalAmount = this.roundMoney(booking.totalPrice);
    const platformFee = this.roundMoney(payment?.platformFee ?? 0);
    const ownerRentalAmount = this.roundMoney(payment?.ownerAmount ?? 0);
    const payoutAmount = this.roundMoney(ownerRentalAmount + finalChargeAmount);
    const existingStatus = booking.ownerPayout?.status;
    const nextStatus = holdReason
      ? PayoutStatus.ON_HOLD
      : existingStatus &&
          existingStatus !== PayoutStatus.ON_HOLD &&
          existingStatus !== PayoutStatus.PENDING
        ? existingStatus
        : PayoutStatus.PENDING;

    const payout = await this.prisma.ownerPayout.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        ownerId: booking.ownerId,
        paymentId: payment?.id ?? null,
        status: nextStatus,
        grossRentalAmount,
        platformFee,
        ownerRentalAmount,
        postTripChargeAmount: finalChargeAmount,
        payoutAmount,
        holdReason,
        createdBy: adminId,
        notes: holdReason
          ? `Payout held: ${holdReason}`
          : 'Payout ready for admin processing',
      },
      update: {
        ownerId: booking.ownerId,
        paymentId: payment?.id ?? null,
        status: nextStatus,
        grossRentalAmount,
        platformFee,
        ownerRentalAmount,
        postTripChargeAmount: finalChargeAmount,
        payoutAmount,
        holdReason,
        notes: holdReason
          ? `Payout held: ${holdReason}`
          : (booking.ownerPayout?.notes ?? 'Payout ready for admin processing'),
      },
    });

    if (!existingStatus || existingStatus !== payout.status) {
      await this.notifyPayoutUpdated({
        booking,
        payout,
        senderId: adminId,
        transition: payout.status,
        title:
          payout.status === PayoutStatus.ON_HOLD
            ? 'Payout đang bị giữ'
            : 'Payout đã sẵn sàng',
        message:
          payout.status === PayoutStatus.ON_HOLD
            ? `Payout owner đang bị giữ: ${payout.holdReason}`
            : `Payout ${this.formatMoney(payout.payoutAmount)} VND đã sẵn sàng để xử lý.`,
      });
    }

    return OwnerPayoutEntity.fromPrisma(payout);
  }

  async updateOwnerPayoutStatus(
    payoutId: string,
    adminId: string,
    dto: UpdatePayoutStatusDto,
  ): Promise<OwnerPayoutEntity> {
    const payout = await this.prisma.ownerPayout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) throw new NotFoundException('Owner payout not found');

    if (
      !(
        [
          PayoutStatus.PROCESSING,
          PayoutStatus.COMPLETED,
          PayoutStatus.FAILED,
          PayoutStatus.CANCELLED,
        ] as PayoutStatus[]
      ).includes(dto.status)
    ) {
      throw new BadRequestException('Unsupported payout status');
    }

    if (
      (
        [PayoutStatus.PROCESSING, PayoutStatus.COMPLETED] as PayoutStatus[]
      ).includes(dto.status)
    ) {
      const booking = await this.findBookingWithFinancials(payout.bookingId);
      if (!booking) throw new NotFoundException('Booking not found');

      const holdReason = await this.getPayoutHoldReason(booking);
      if (holdReason) {
        throw new BadRequestException(
          `Cannot process payout while ${holdReason}`,
        );
      }

      if (payout.payoutAmount <= 0) {
        throw new BadRequestException(
          'Payout amount must be greater than zero',
        );
      }
    }

    const now = new Date();
    const updated = await this.prisma.ownerPayout.update({
      where: { id: payout.id },
      data: {
        status: dto.status,
        externalReference:
          dto.externalReference?.trim() || payout.externalReference,
        notes: dto.notes?.trim() || payout.notes,
        processedBy: adminId,
        processedAt:
          dto.status === PayoutStatus.PROCESSING ||
          dto.status === PayoutStatus.COMPLETED
            ? now
            : (payout.processedAt ?? now),
        completedAt: dto.status === PayoutStatus.COMPLETED ? now : null,
        holdReason:
          dto.status === PayoutStatus.PROCESSING ||
          dto.status === PayoutStatus.COMPLETED
            ? null
            : payout.holdReason,
      },
    });

    const booking = await this.findBookingWithFinancials(updated.bookingId);
    if (booking) {
      await this.notifyPayoutUpdated({
        booking,
        payout: updated,
        senderId: adminId,
        transition: updated.status,
        title: 'Trạng thái payout đã cập nhật',
        message: `Payout owner hiện ở trạng thái ${updated.status}.`,
      });
    }

    return OwnerPayoutEntity.fromPrisma(updated);
  }

  private async notifyDepositUpdated(input: {
    booking: { id: string; renterId: string; ownerId: string };
    depositLedger: DepositLedger | null;
    senderId?: string;
    transition: string;
    title: string;
    message: string;
    recipients: FinancialNotificationRecipient[];
    data?: Record<string, unknown>;
  }): Promise<void> {
    if (!input.depositLedger) return;

    await this.notifyFinancialParticipants({
      booking: input.booking,
      senderId: input.senderId,
      type: NotificationType.DEPOSIT_UPDATED,
      socketEvent: 'deposit_updated',
      title: input.title,
      message: input.message,
      recipients: input.recipients,
      data: {
        transition: input.transition,
        depositLedgerId: input.depositLedger.id,
        status: input.depositLedger.status,
        heldAmount: input.depositLedger.heldAmount,
        capturedAmount: input.depositLedger.capturedAmount,
        releasedAmount: input.depositLedger.releasedAmount,
        ...input.data,
      },
    });
  }

  private async notifyPostTripChargeUpdated(input: {
    booking: { id: string; renterId: string; ownerId: string };
    charge: PostTripCharge;
    senderId?: string;
    transition: string;
    title: string;
    message: string;
    recipients: FinancialNotificationRecipient[];
  }): Promise<void> {
    await this.notifyFinancialParticipants({
      booking: input.booking,
      senderId: input.senderId,
      type: NotificationType.POST_TRIP_CHARGE_UPDATED,
      socketEvent: 'post_trip_charge_updated',
      title: input.title,
      message: input.message,
      recipients: input.recipients,
      data: {
        transition: input.transition,
        chargeId: input.charge.id,
        chargeType: input.charge.type,
        status: input.charge.status,
        amount: input.charge.amount,
      },
    });
  }

  private async notifyPayoutUpdated(input: {
    booking: { id: string; renterId: string; ownerId: string };
    payout: OwnerPayout;
    senderId?: string;
    transition: string;
    title: string;
    message: string;
  }): Promise<void> {
    await this.notifyFinancialParticipants({
      booking: input.booking,
      senderId: input.senderId,
      type: NotificationType.PAYOUT_UPDATED,
      socketEvent: 'payout_updated',
      title: input.title,
      message: input.message,
      recipients: ['owner'],
      data: {
        transition: input.transition,
        payoutId: input.payout.id,
        status: input.payout.status,
        payoutAmount: input.payout.payoutAmount,
      },
    });
  }

  private async notifyFinancialParticipants(input: {
    booking: { id: string; renterId: string; ownerId: string };
    senderId?: string;
    type: NotificationType;
    socketEvent: string;
    title: string;
    message: string;
    recipients: FinancialNotificationRecipient[];
    data?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.notificationService) return;

    const receivers = input.recipients.reduce<
      Array<{ id: string; role: FinancialNotificationRecipient }>
    >((acc, recipient) => {
      const id =
        recipient === 'renter' ? input.booking.renterId : input.booking.ownerId;
      if (!acc.some((receiver) => receiver.id === id)) {
        acc.push({ id, role: recipient });
      }
      return acc;
    }, []);
    const baseData = this.stringifyNotificationData({
      bookingId: input.booking.id,
      ...input.data,
    });

    try {
      for (const receiver of receivers) {
        const data = {
          ...baseData,
          recipientRole: receiver.role,
        };
        const notification = await this.notificationService.createNotification({
          receiverId: receiver.id,
          senderId: input.senderId,
          type: input.type,
          title: input.title,
          message: input.message,
          bookingId: input.booking.id,
          data,
        });

        if (this.notificationGateway?.isUserOnline(receiver.id)) {
          this.notificationGateway.sendToUser(receiver.id, input.socketEvent, {
            notification,
            bookingId: input.booking.id,
            ...data,
          });
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to send ${input.type} notification for booking ${input.booking.id}: ${(err as Error).message}`,
      );
    }
  }

  private stringifyNotificationData(
    data: Record<string, unknown>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]),
    );
  }

  private formatMoney(amount: number): string {
    return new Intl.NumberFormat('vi-VN').format(this.roundMoney(amount));
  }

  private async findBookingWithFinancials(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payment: true,
        trip: true,
        depositLedger: true,
        ownerPayout: true,
        postTripCharges: {
          orderBy: { createdAt: 'asc' },
        },
        handovers: {
          orderBy: { createdAt: 'asc' },
        },
        vehicle: {
          select: {
            pricePerHour: true,
            dailyKmLimit: true,
            excessKmPrice: true,
            batteryReturnMin: true,
          },
        },
      },
    });
  }

  private canViewBooking(
    booking: { renterId: string; ownerId: string },
    userId: string,
    roles: UserRole[],
  ): boolean {
    return (
      roles.includes(UserRole.ADMIN) ||
      booking.renterId === userId ||
      booking.ownerId === userId
    );
  }

  private computeSystemCharges(booking: FinancialBooking): ComputedCharge[] {
    const charges: ComputedCharge[] = [];
    const trip = booking.trip;
    if (!trip) return charges;

    const checkIn = booking.handovers.find(
      (handover) => handover.type === HandoverType.CHECK_IN,
    );
    const checkOut = booking.handovers.find(
      (handover) => handover.type === HandoverType.CHECK_OUT,
    );

    const actualEndTime = checkOut?.createdAt ?? trip.completedAt;
    if (actualEndTime) {
      const lateMinutes = Math.ceil(
        (actualEndTime.getTime() - booking.endTime.getTime()) / 60_000,
      );
      if (lateMinutes > this.LATE_RETURN_GRACE_MINUTES) {
        const billableHours = Math.ceil(
          (lateMinutes - this.LATE_RETURN_GRACE_MINUTES) / 60,
        );
        const hourlyPrice = this.asNumber(booking.vehicle.pricePerHour);
        charges.push({
          type: PostTripChargeType.LATE_RETURN,
          amount: this.roundMoney(billableHours * hourlyPrice),
          quantity: billableHours,
          unitPrice: hourlyPrice,
          description: `Late return by ${lateMinutes} minutes`,
          evidence: {
            plannedEndTime: booking.endTime.toISOString(),
            actualEndTime: actualEndTime.toISOString(),
            graceMinutes: this.LATE_RETURN_GRACE_MINUTES,
          },
        });
      }
    }

    const kmDriven = this.getKmDriven(booking, checkIn, checkOut);
    if (
      kmDriven != null &&
      booking.vehicle.dailyKmLimit != null &&
      booking.vehicle.excessKmPrice != null
    ) {
      const rentalDays = Math.max(
        1,
        Math.ceil(
          (booking.endTime.getTime() - booking.startTime.getTime()) /
            (24 * 60 * 60 * 1000),
        ),
      );
      const allowedKm = rentalDays * booking.vehicle.dailyKmLimit;
      const excessKm = Math.max(0, kmDriven - allowedKm);
      if (excessKm > 0) {
        charges.push({
          type: PostTripChargeType.EXCESS_DISTANCE,
          amount: this.roundMoney(excessKm * booking.vehicle.excessKmPrice),
          quantity: Number(excessKm.toFixed(2)),
          unitPrice: booking.vehicle.excessKmPrice,
          description: `Exceeded distance allowance by ${excessKm.toFixed(2)} km`,
          evidence: {
            kmDriven,
            allowedKm,
            rentalDays,
            dailyKmLimit: booking.vehicle.dailyKmLimit,
          },
        });
      }
    }

    const returnBattery = checkOut?.batteryLevel ?? trip.endBattery;
    if (
      returnBattery != null &&
      booking.vehicle.batteryReturnMin != null &&
      returnBattery < booking.vehicle.batteryReturnMin
    ) {
      const shortByPercent = booking.vehicle.batteryReturnMin - returnBattery;
      const prepaidCreditPercent = booking.prepaidCharging
        ? Math.max(0, booking.prepaidChargingCreditPercent ?? 0)
        : 0;
      const billableShortfallPercent = Math.max(
        0,
        shortByPercent - prepaidCreditPercent,
      );
      const unitPrice = this.lowBatteryFeePerPercent();
      if (billableShortfallPercent > 0) {
        charges.push({
          type: PostTripChargeType.LOW_BATTERY,
          amount: this.roundMoney(billableShortfallPercent * unitPrice),
          quantity: billableShortfallPercent,
          unitPrice,
          description:
            prepaidCreditPercent > 0
              ? `Returned battery ${billableShortfallPercent}% beyond prepaid charging credit`
              : `Returned battery ${billableShortfallPercent}% below minimum`,
          evidence: {
            returnBattery,
            batteryReturnMin: booking.vehicle.batteryReturnMin,
            shortByPercent,
            prepaidCharging: booking.prepaidCharging,
            prepaidCreditPercent,
            billableShortfallPercent,
          },
        });
      }
    }

    return charges.filter((charge) => charge.amount > 0);
  }

  private getKmDriven(
    booking: FinancialBooking,
    checkIn: FinancialBooking['handovers'][number] | undefined,
    checkOut: FinancialBooking['handovers'][number] | undefined,
  ): number | null {
    if (
      checkIn?.odometerReading != null &&
      checkOut?.odometerReading != null &&
      checkOut.odometerReading >= checkIn.odometerReading
    ) {
      return checkOut.odometerReading - checkIn.odometerReading;
    }

    return booking.trip?.distanceTraveled ?? null;
  }

  private applyRoadsideSupportCredit(
    booking: FinancialBooking,
    type: PostTripChargeType,
    requestedAmount: number,
  ): {
    requestedAmount: number;
    amount: number;
    creditAmount: number;
    creditUsedBefore: number;
    appliedAmount: number;
  } {
    const creditAmount =
      type === PostTripChargeType.ROADSIDE_ASSISTANCE &&
      booking.roadsideSupport
        ? Math.max(
            0,
            booking.roadsideSupportCreditAmount ??
              this.ROADSIDE_SUPPORT_CREDIT_AMOUNT,
          )
        : 0;
    const creditUsedBefore =
      creditAmount > 0 ? this.roadsideSupportCreditUsed(booking) : 0;
    const remainingCredit = Math.max(0, creditAmount - creditUsedBefore);
    const appliedAmount = Math.min(requestedAmount, remainingCredit);

    return {
      requestedAmount,
      amount: this.roundMoney(requestedAmount - appliedAmount),
      creditAmount,
      creditUsedBefore,
      appliedAmount,
    };
  }

  private roadsideSupportCreditUsed(booking: FinancialBooking): number {
    return booking.postTripCharges
      .filter((charge) => charge.status !== PostTripChargeStatus.CANCELLED)
      .reduce(
        (total, charge) =>
          total + this.extractRoadsideSupportCreditApplied(charge.evidence),
        0,
      );
  }

  private extractRoadsideSupportCreditApplied(
    evidence: Prisma.JsonValue | null,
  ): number {
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
      return 0;
    }

    const manual = (evidence as Record<string, unknown>).manual;
    if (!manual || typeof manual !== 'object' || Array.isArray(manual)) {
      return 0;
    }

    const roadsideSupport = (manual as Record<string, unknown>).roadsideSupport;
    if (
      !roadsideSupport ||
      typeof roadsideSupport !== 'object' ||
      Array.isArray(roadsideSupport)
    ) {
      return 0;
    }

    const applied = (roadsideSupport as Record<string, unknown>)
      .creditAppliedAmount;
    return typeof applied === 'number' && Number.isFinite(applied)
      ? this.roundMoney(applied)
      : 0;
  }

  private async syncDepositForBooking(
    bookingId: string,
  ): Promise<DepositLedger | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        depositLedger: true,
        postTripCharges: true,
      },
    });

    if (!booking?.depositLedger) return null;

    const activeCharges = booking.postTripCharges.filter((charge) =>
      (
        [
          PostTripChargeStatus.PENDING_REVIEW,
          PostTripChargeStatus.APPROVED,
          PostTripChargeStatus.DISPUTED,
        ] as PostTripChargeStatus[]
      ).includes(charge.status),
    );
    const capturedCharges = booking.postTripCharges.filter((charge) =>
      (
        [
          PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
          PostTripChargeStatus.PAID,
        ] as PostTripChargeStatus[]
      ).includes(charge.status),
    );
    const pendingChargeAmount = this.sumCharges(activeCharges);
    const capturedAmount = this.sumCharges(capturedCharges);
    const releasableAmount = Math.max(
      0,
      booking.depositLedger.heldAmount - pendingChargeAmount - capturedAmount,
    );
    const finalStatuses: DepositLedgerStatus[] = [
      DepositLedgerStatus.RELEASED,
      DepositLedgerStatus.REFUNDED,
      DepositLedgerStatus.CAPTURED,
    ];
    const hasDisputedCharge = activeCharges.some(
      (charge) => charge.status === PostTripChargeStatus.DISPUTED,
    );
    const nextStatus =
      booking.depositLedger.heldAmount <= 0
        ? DepositLedgerStatus.NOT_HELD
        : finalStatuses.includes(booking.depositLedger.status)
          ? booking.depositLedger.status
          : hasDisputedCharge
            ? DepositLedgerStatus.DISPUTED
            : pendingChargeAmount > 0
              ? DepositLedgerStatus.PENDING_CHARGES
              : DepositLedgerStatus.RELEASE_PENDING;

    return this.prisma.depositLedger.update({
      where: { id: booking.depositLedger.id },
      data: {
        status: nextStatus,
        pendingChargeAmount,
        capturedAmount,
        releasedAmount: releasableAmount,
        releaseDueAt:
          pendingChargeAmount === 0
            ? this.addHours(new Date(), this.RELEASE_REVIEW_HOURS)
            : null,
        disputedAt: hasDisputedCharge
          ? (booking.depositLedger.disputedAt ?? new Date())
          : booking.depositLedger.disputedAt,
      },
    });
  }

  private toSummary(booking: {
    id: string;
    depositLedger: DepositLedger | null;
    postTripCharges: PostTripCharge[];
    ownerPayout?: OwnerPayout | null;
  }): FinancialSummaryEntity {
    const charges = booking.postTripCharges.map(
      PostTripChargeEntity.fromPrisma,
    );
    const totalPendingCharges = this.sumCharges(
      booking.postTripCharges.filter(
        (charge) => charge.status === PostTripChargeStatus.PENDING_REVIEW,
      ),
    );
    const totalApprovedCharges = this.sumCharges(
      booking.postTripCharges.filter(
        (charge) => charge.status === PostTripChargeStatus.APPROVED,
      ),
    );
    const totalDisputedCharges = this.sumCharges(
      booking.postTripCharges.filter(
        (charge) => charge.status === PostTripChargeStatus.DISPUTED,
      ),
    );
    const totalCapturedCharges = this.sumCharges(
      booking.postTripCharges.filter((charge) =>
        (
          [
            PostTripChargeStatus.DEDUCTED_FROM_DEPOSIT,
            PostTripChargeStatus.PAID,
          ] as PostTripChargeStatus[]
        ).includes(charge.status),
      ),
    );
    const heldAmount = booking.depositLedger?.heldAmount ?? 0;
    const ledgerCaptured = booking.depositLedger?.capturedAmount ?? 0;
    const releasableDeposit = Math.max(
      0,
      heldAmount -
        ledgerCaptured -
        totalPendingCharges -
        totalApprovedCharges -
        totalDisputedCharges,
    );

    return new FinancialSummaryEntity({
      bookingId: booking.id,
      deposit: booking.depositLedger
        ? DepositLedgerEntity.fromPrisma(booking.depositLedger)
        : null,
      charges,
      totalPendingCharges,
      totalApprovedCharges,
      totalCapturedCharges,
      releasableDeposit,
      ownerPayout: booking.ownerPayout
        ? OwnerPayoutEntity.fromPrisma(booking.ownerPayout)
        : null,
    });
  }

  private async getPayoutHoldReason(
    booking: FinancialBooking,
  ): Promise<string | null> {
    if (booking.status !== BookingStatus.COMPLETED) {
      return 'booking is not completed';
    }
    if (booking.trip?.status !== TripStatus.COMPLETED) {
      return 'trip is not completed';
    }
    if (booking.payment?.status !== PaymentStatus.COMPLETED) {
      return 'payment is not completed';
    }

    const unresolvedCharge = booking.postTripCharges.find((charge) =>
      (
        [
          PostTripChargeStatus.PENDING_REVIEW,
          PostTripChargeStatus.APPROVED,
          PostTripChargeStatus.DISPUTED,
        ] as PostTripChargeStatus[]
      ).includes(charge.status),
    );
    if (unresolvedCharge) {
      return `post-trip charge ${unresolvedCharge.id} is unresolved`;
    }

    if ((booking.deposit ?? 0) > 0) {
      if (!booking.depositLedger) {
        return 'deposit ledger has not been created';
      }

      if (
        (
          [
            DepositLedgerStatus.HELD,
            DepositLedgerStatus.PENDING_CHARGES,
            DepositLedgerStatus.PARTIALLY_CAPTURED,
            DepositLedgerStatus.RELEASE_PENDING,
            DepositLedgerStatus.DISPUTED,
          ] as DepositLedgerStatus[]
        ).includes(booking.depositLedger.status)
      ) {
        return `deposit is ${booking.depositLedger.status}`;
      }
    }

    const blockingIncident = await this.prisma.incidentReport.findFirst({
      where: {
        bookingId: booking.id,
        status: {
          in: [IncidentStatus.OPEN, IncidentStatus.UNDER_REVIEW],
        },
      },
      select: { id: true },
    });
    if (blockingIncident) {
      return `incident ${blockingIncident.id} is open`;
    }

    return null;
  }

  private sumCharges(charges: Array<{ amount: number }>): number {
    return this.roundMoney(
      charges.reduce((total, charge) => total + charge.amount, 0),
    );
  }

  private lowBatteryFeePerPercent(): number {
    const configured = Number(process.env.LOW_BATTERY_FEE_PER_PERCENT);
    return Number.isFinite(configured) && configured >= 0
      ? configured
      : this.DEFAULT_LOW_BATTERY_FEE_PER_PERCENT;
  }

  private asNumber(value: Prisma.Decimal | number): number {
    if (typeof value === 'number') return value;
    return value.toNumber();
  }

  private roundMoney(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
  }

  private addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }

  private mergeEvidence(
    existing: Prisma.JsonValue | null,
    key: 'review' | 'dispute',
    patch: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    return {
      ...base,
      [key]: Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ),
    } as Prisma.InputJsonValue;
  }
}
