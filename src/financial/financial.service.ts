import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  DepositLedger,
  DepositLedgerStatus,
  HandoverType,
  PaymentStatus,
  PostTripCharge,
  PostTripChargeSource,
  PostTripChargeStatus,
  PostTripChargeType,
  Prisma,
  TripStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreatePostTripChargeDto } from './dto/create-post-trip-charge.dto';
import { DisputePostTripChargeDto } from './dto/dispute-post-trip-charge.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';
import {
  DepositLedgerEntity,
  FinancialSummaryEntity,
  PostTripChargeEntity,
} from './entities/financial.entity';

type FinancialBooking = Prisma.BookingGetPayload<{
  include: {
    payment: true;
    trip: true;
    depositLedger: true;
    postTripCharges: true;
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

@Injectable()
export class FinancialService {
  private readonly logger = new Logger(FinancialService.name);
  private readonly LATE_RETURN_GRACE_MINUTES = 15;
  private readonly DEFAULT_LOW_BATTERY_FEE_PER_PERCENT = 5000;
  private readonly RELEASE_REVIEW_HOURS = 24;

  constructor(private readonly prisma: PrismaService) {}

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
      return DepositLedgerEntity.fromPrisma(created);
    }

    const nextStatus =
      booking.depositLedger.status === DepositLedgerStatus.NOT_HELD &&
      heldAmount > 0
        ? DepositLedgerStatus.HELD
        : booking.depositLedger.status;

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
  }> {
    const take = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
    const [deposits, charges] = await Promise.all([
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
    ]);

    return { deposits, charges };
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
    const status = isAdmin
      ? PostTripChargeStatus.APPROVED
      : PostTripChargeStatus.PENDING_REVIEW;

    await this.prisma.postTripCharge.create({
      data: {
        bookingId: booking.id,
        tripId: booking.trip?.id,
        type: dto.type,
        source: isAdmin
          ? PostTripChargeSource.ADMIN
          : PostTripChargeSource.OWNER,
        status,
        amount: this.roundMoney(dto.amount),
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        description: dto.description.trim(),
        reviewedBy: isAdmin ? userId : null,
        reviewedAt: isAdmin ? now : null,
        evidence: {
          manual: {
            createdBy: userId,
            createdRole: isAdmin ? UserRole.ADMIN : UserRole.OWNER,
            createdAt: now.toISOString(),
            evidenceUrls: dto.evidenceUrls ?? [],
          },
        },
      },
    });

    await this.syncDepositForBooking(booking.id);
    const updated = await this.findBookingWithFinancials(booking.id);
    if (!updated) throw new NotFoundException('Booking not found');
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

    await this.prisma.postTripCharge.update({
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
    await this.prisma.postTripCharge.update({
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

    const updated = await this.findBookingWithFinancials(bookingId);
    if (!updated) throw new NotFoundException('Booking not found');
    return this.toSummary(updated);
  }

  private async findBookingWithFinancials(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payment: true,
        trip: true,
        depositLedger: true,
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
      const unitPrice = this.lowBatteryFeePerPercent();
      charges.push({
        type: PostTripChargeType.LOW_BATTERY,
        amount: this.roundMoney(shortByPercent * unitPrice),
        quantity: shortByPercent,
        unitPrice,
        description: `Returned battery ${shortByPercent}% below minimum`,
        evidence: {
          returnBattery,
          batteryReturnMin: booking.vehicle.batteryReturnMin,
        },
      });
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
    });
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
