import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePaymentDto } from './create-payment.dto';

describe('CreatePaymentDto', () => {
  const validData = {
    bookingId: '123e4567-e89b-12d3-a456-426614174000',
    method: 'CASH',
  };

  it('should pass validation with valid data', async () => {
    const dto = plainToInstance(CreatePaymentDto, validData);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when bookingId is missing', async () => {
    const dto = plainToInstance(CreatePaymentDto, { method: 'CASH' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'bookingId')).toBe(true);
  });

  it('should fail when bookingId is not a UUID', async () => {
    const dto = plainToInstance(CreatePaymentDto, {
      bookingId: 'not-a-uuid',
      method: 'CASH',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bookingId')).toBe(true);
  });

  it('should fail when method is missing', async () => {
    const dto = plainToInstance(CreatePaymentDto, {
      bookingId: validData.bookingId,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'method')).toBe(true);
  });

  it('should fail when method is invalid', async () => {
    const dto = plainToInstance(CreatePaymentDto, {
      bookingId: validData.bookingId,
      method: 'BITCOIN',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'method')).toBe(true);
  });

  it('should pass for each valid PaymentMethod', async () => {
    for (const method of ['PAYOS', 'MOMO', 'CREDIT_CARD', 'CASH']) {
      const dto = plainToInstance(CreatePaymentDto, {
        bookingId: validData.bookingId,
        method,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });
});
