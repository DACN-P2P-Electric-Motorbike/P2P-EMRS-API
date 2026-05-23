import { Test, TestingModule } from '@nestjs/testing';
import { PostTripChargeStatus, UserRole } from '@prisma/client';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';

describe('FinancialController', () => {
  let controller: FinancialController;
  const service = {
    getBookingFinancialSummary: jest.fn(),
    getAdminFinancialQueue: jest.fn(),
    recalculatePostTripChargesForBooking: jest.fn(),
    updateChargeStatus: jest.fn(),
    captureApprovedChargesFromDeposit: jest.fn(),
    releaseDeposit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialController],
      providers: [{ provide: FinancialService, useValue: service }],
    }).compile();

    controller = module.get(FinancialController);
  });

  it('delegates participant financial summary lookup', async () => {
    service.getBookingFinancialSummary.mockResolvedValue({ bookingId: 'b1' });

    await expect(
      controller.getBookingFinancialSummary('b1', 'renter-1', [
        UserRole.RENTER,
      ]),
    ).resolves.toEqual({ bookingId: 'b1' });
    expect(service.getBookingFinancialSummary).toHaveBeenCalledWith(
      'b1',
      'renter-1',
      [UserRole.RENTER],
    );
  });

  it('delegates admin financial queue lookup', async () => {
    service.getAdminFinancialQueue.mockResolvedValue({
      deposits: [],
      charges: [],
    });

    await expect(controller.getAdminFinancialQueue('20')).resolves.toEqual({
      status: 'success',
      data: { deposits: [], charges: [] },
    });
    expect(service.getAdminFinancialQueue).toHaveBeenCalledWith(20);
  });

  it('delegates admin recalculation', async () => {
    service.recalculatePostTripChargesForBooking.mockResolvedValue({
      bookingId: 'b1',
    });

    await controller.recalculatePostTripCharges('b1');

    expect(service.recalculatePostTripChargesForBooking).toHaveBeenCalledWith(
      'b1',
    );
  });

  it('delegates charge review with admin id', async () => {
    const dto = {
      status: PostTripChargeStatus.APPROVED,
      amount: 25000,
      notes: 'Approved',
    };
    service.updateChargeStatus.mockResolvedValue({ bookingId: 'b1' });

    await controller.updateChargeStatus('charge-1', 'admin-1', dto);

    expect(service.updateChargeStatus).toHaveBeenCalledWith(
      'charge-1',
      'admin-1',
      dto,
    );
  });

  it('delegates capture and release operations', async () => {
    service.captureApprovedChargesFromDeposit.mockResolvedValue({
      bookingId: 'b1',
    });
    service.releaseDeposit.mockResolvedValue({ bookingId: 'b1' });

    await controller.captureApprovedCharges('b1', 'admin-1');
    await controller.releaseDeposit('b1', 'admin-1');

    expect(service.captureApprovedChargesFromDeposit).toHaveBeenCalledWith(
      'b1',
      'admin-1',
    );
    expect(service.releaseDeposit).toHaveBeenCalledWith('b1', 'admin-1');
  });
});
