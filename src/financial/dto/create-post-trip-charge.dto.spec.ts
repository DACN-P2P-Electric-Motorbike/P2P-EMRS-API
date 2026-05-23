import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PostTripChargeType } from '@prisma/client';
import { CreatePostTripChargeDto } from './create-post-trip-charge.dto';

describe('CreatePostTripChargeDto', () => {
  const validData = {
    type: PostTripChargeType.DAMAGE,
    amount: 50000,
    description: 'Rear panel scratch found during check-out',
  };

  it('passes validation with valid manual charge data', async () => {
    const dto = plainToInstance(CreatePostTripChargeDto, validData);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts only manual owner/admin charge types', async () => {
    for (const type of [
      PostTripChargeType.CLEANING,
      PostTripChargeType.DAMAGE,
      PostTripChargeType.ROADSIDE_ASSISTANCE,
      PostTripChargeType.OTHER,
    ]) {
      const dto = plainToInstance(CreatePostTripChargeDto, {
        ...validData,
        type,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects system-calculated charge types', async () => {
    for (const type of [
      PostTripChargeType.LATE_RETURN,
      PostTripChargeType.EXCESS_DISTANCE,
      PostTripChargeType.LOW_BATTERY,
    ]) {
      const dto = plainToInstance(CreatePostTripChargeDto, {
        ...validData,
        type,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'type')).toBe(true);
    }
  });

  it('rejects non-positive charge amounts', async () => {
    const dto = plainToInstance(CreatePostTripChargeDto, {
      ...validData,
      amount: 0,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejects missing descriptions and too many evidence URLs', async () => {
    const dto = plainToInstance(CreatePostTripChargeDto, {
      ...validData,
      description: '',
      evidenceUrls: Array.from(
        { length: 11 },
        (_, index) => `https://example.com/evidence-${index}.jpg`,
      ),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'description')).toBe(true);
    expect(errors.some((e) => e.property === 'evidenceUrls')).toBe(true);
  });
});
