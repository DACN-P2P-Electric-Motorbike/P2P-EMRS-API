import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateReviewDto } from './create-review.dto';

describe('CreateReviewDto', () => {
  const validData = {
    vehicleId: '123e4567-e89b-12d3-a456-426614174000',
    rating: 5,
    comment: 'Great bike!',
  };

  it('should pass validation with valid data', async () => {
    const dto = plainToInstance(CreateReviewDto, validData);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass without optional fields', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      vehicleId: validData.vehicleId,
      rating: 3,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when vehicleId is missing', async () => {
    const dto = plainToInstance(CreateReviewDto, { rating: 5 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'vehicleId')).toBe(true);
  });

  it('should fail when vehicleId is not a UUID', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      vehicleId: 'bad-id',
      rating: 5,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'vehicleId')).toBe(true);
  });

  it('should fail when rating is missing', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      vehicleId: validData.vehicleId,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'rating')).toBe(true);
  });

  it('should fail when rating is below 1', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      vehicleId: validData.vehicleId,
      rating: 0,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'rating')).toBe(true);
  });

  it('should fail when rating is above 5', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      vehicleId: validData.vehicleId,
      rating: 6,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'rating')).toBe(true);
  });

  it('should fail when rating is not an integer', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      vehicleId: validData.vehicleId,
      rating: 3.5,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'rating')).toBe(true);
  });

  it('should accept each valid rating (1-5)', async () => {
    for (let rating = 1; rating <= 5; rating++) {
      const dto = plainToInstance(CreateReviewDto, {
        vehicleId: validData.vehicleId,
        rating,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('should accept optional bookingId as UUID', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      ...validData,
      bookingId: '123e4567-e89b-12d3-a456-426614174000',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when bookingId is not a UUID', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      ...validData,
      bookingId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bookingId')).toBe(true);
  });
});
