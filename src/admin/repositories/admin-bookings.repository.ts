import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BookingStatus } from '@prisma/client';
import { QueryBookingsDto } from '../dto/query-bookings.dto';

@Injectable()
export class AdminBookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(query: QueryBookingsDto) {
    const {
      status,
      userId,
      vehicleId,
      startDate,
      endDate,
      page = 1,
      limit = 10,
    } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (vehicleId) where.vehicleId = vehicleId;
    if (userId) {
      where.OR = [{ renterId: userId }, { ownerId: userId }];
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate)
        where.createdAt.lte = new Date(
          new Date(endDate).setHours(23, 59, 59, 999),
        );
    }

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: {
          renter: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
          owner: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          vehicle: {
            select: {
              id: true,
              model: true,
              brand: true,
              licensePlate: true,
            },
          },
          payment: {
            select: {
              id: true,
              amount: true,
              status: true,
              method: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { bookings, total };
  }

  async findById(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        renter: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        owner: { select: { id: true, fullName: true, email: true } },
        vehicle: {
          select: { id: true, model: true, brand: true, licensePlate: true },
        },
        payment: true,
      },
    });
  }

  async updateStatus(bookingId: string, status: BookingStatus) {
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status },
    });
  }
}
