/**
 * Unit tests for ReviewsController.
 * ReviewsService is fully mocked — each handler delegates to the right service
 * method with the right args, including the optional rating query branch.
 */
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

describe('ReviewsController', () => {
  let controller: ReviewsController;
  let service: jest.Mocked<ReviewsService>;

  beforeEach(() => {
    service = {
      getUserReviews: jest.fn().mockResolvedValue([{ id: 'review-1' }]),
      getTrustScoreBreakdown: jest.fn().mockResolvedValue({ score: 90 }),
      createReview: jest.fn().mockResolvedValue({ id: 'review-1' }),
      getBookingReviewStatus: jest
        .fn()
        .mockResolvedValue({ bookingId: 'booking-1' }),
      getVehicleReviews: jest.fn().mockResolvedValue([{ id: 'review-1' }]),
    } as unknown as jest.Mocked<ReviewsService>;

    controller = new ReviewsController(service);
  });

  it('GET /my-reviews delegates to ReviewsService.getUserReviews', async () => {
    await expect(controller.getMyReviews('user-1')).resolves.toEqual([
      { id: 'review-1' },
    ]);
    expect(service.getUserReviews).toHaveBeenCalledWith('user-1');
  });

  it('GET /trust-score requests the current user breakdown with private flag', async () => {
    await expect(controller.getTrustScoreBreakdown('user-1')).resolves.toEqual({
      score: 90,
    });
    expect(service.getTrustScoreBreakdown).toHaveBeenCalledWith('user-1', true);
  });

  it('GET /trust-score/:userId requests a public breakdown', async () => {
    await expect(controller.getUserTrustScore('user-2')).resolves.toEqual({
      score: 90,
    });
    expect(service.getTrustScoreBreakdown).toHaveBeenCalledWith('user-2');
  });

  it('POST / delegates to ReviewsService.createReview', async () => {
    const dto = { vehicleId: 'vehicle-1', rating: 5 } as any;

    await expect(controller.createReview('user-1', dto)).resolves.toEqual({
      id: 'review-1',
    });
    expect(service.createReview).toHaveBeenCalledWith('user-1', dto);
  });

  it('GET /bookings/:bookingId/status delegates to ReviewsService.getBookingReviewStatus', async () => {
    await expect(
      controller.getBookingReviewStatus('user-1', 'booking-1'),
    ).resolves.toEqual({ bookingId: 'booking-1' });
    expect(service.getBookingReviewStatus).toHaveBeenCalledWith(
      'user-1',
      'booking-1',
    );
  });

  it('GET /vehicle/:vehicleId parses the rating filter when provided', async () => {
    await expect(
      controller.getVehicleReviews('vehicle-1', '4'),
    ).resolves.toEqual([{ id: 'review-1' }]);
    expect(service.getVehicleReviews).toHaveBeenCalledWith('vehicle-1', 4);
  });

  it('GET /vehicle/:vehicleId passes undefined rating when omitted', async () => {
    await controller.getVehicleReviews('vehicle-1');
    expect(service.getVehicleReviews).toHaveBeenCalledWith(
      'vehicle-1',
      undefined,
    );
  });
});
