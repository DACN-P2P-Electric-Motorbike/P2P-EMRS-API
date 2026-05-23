import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DisputePostTripChargeDto } from './dispute-post-trip-charge.dto';

describe('DisputePostTripChargeDto', () => {
  it('passes validation with a reason and evidence URLs', async () => {
    const dto = plainToInstance(DisputePostTripChargeDto, {
      reason: 'The damage was already present at check-in',
      evidenceUrls: ['https://example.com/check-in-photo.jpg'],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects missing reason and too many evidence URLs', async () => {
    const dto = plainToInstance(DisputePostTripChargeDto, {
      reason: '',
      evidenceUrls: Array.from(
        { length: 11 },
        (_, index) => `https://example.com/evidence-${index}.jpg`,
      ),
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'reason')).toBe(true);
    expect(errors.some((e) => e.property === 'evidenceUrls')).toBe(true);
  });
});
