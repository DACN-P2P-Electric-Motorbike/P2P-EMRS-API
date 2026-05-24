import { Injectable, NotFoundException } from '@nestjs/common';
import { PrivacyRequestStatus, PrivacyRequestType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PrivacyService {
  private readonly requestSlaHours = 72;

  constructor(private readonly prisma: PrismaService) {}

  async exportPersonalData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        avatarUrl: true,
        roles: true,
        status: true,
        trustScore: true,
        address: true,
        createdAt: true,
        updatedAt: true,
        bookingsAsRenter: {
          select: {
            id: true,
            vehicleId: true,
            status: true,
            startTime: true,
            endTime: true,
            totalPrice: true,
            deposit: true,
            createdAt: true,
          },
        },
        bookingsAsOwner: {
          select: {
            id: true,
            vehicleId: true,
            status: true,
            startTime: true,
            endTime: true,
            totalPrice: true,
            deposit: true,
            createdAt: true,
          },
        },
        paymentsAsPayer: {
          select: {
            id: true,
            bookingId: true,
            amount: true,
            method: true,
            status: true,
            paidAt: true,
            createdAt: true,
          },
        },
        paymentsAsReceiver: {
          select: {
            id: true,
            bookingId: true,
            amount: true,
            ownerAmount: true,
            method: true,
            status: true,
            paidAt: true,
            createdAt: true,
          },
        },
        trips: {
          select: {
            id: true,
            bookingId: true,
            vehicleId: true,
            status: true,
            distanceTraveled: true,
            duration: true,
            hasIssues: true,
            startedAt: true,
            completedAt: true,
          },
        },
        reviews: {
          select: {
            id: true,
            vehicleId: true,
            tripId: true,
            rating: true,
            comment: true,
            createdAt: true,
          },
        },
        incidentReportsFiled: {
          select: {
            id: true,
            bookingId: true,
            tripId: true,
            postTripChargeId: true,
            category: true,
            severity: true,
            status: true,
            description: true,
            evidence: true,
            adminNotes: true,
            reviewedAt: true,
            resolvedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      generatedAt: new Date().toISOString(),
      user,
    };
  }

  async requestAccountDeletion(userId: string) {
    const dueAt = new Date(Date.now() + this.requestSlaHours * 60 * 60 * 1000);

    return this.prisma.privacyRequest.create({
      data: {
        userId,
        type: PrivacyRequestType.DELETE_ACCOUNT,
        status: PrivacyRequestStatus.PENDING,
        dueAt,
      },
    });
  }

  async getMyRequests(userId: string) {
    return this.prisma.privacyRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
