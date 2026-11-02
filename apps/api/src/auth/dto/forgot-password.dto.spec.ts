import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ForgotPasswordDto } from './forgot-password.dto';

describe('ForgotPasswordDto', () => {
  it('normalizes a valid email before the request reaches the service', async () => {
    const dto = plainToInstance(ForgotPasswordDto, {
      email: ' Recovery@Example.com ',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.email).toBe('recovery@example.com');
  });

  it.each([
    { email: 'not-an-email', description: 'an invalid email' },
    {
      email: 'a'.repeat(255) + '@example.com',
      description: 'an oversized email',
    },
    { email: 123, description: 'a non-string email' },
  ])('rejects $description without a recovery request', async ({ email }) => {
    const dto = plainToInstance(ForgotPasswordDto, { email });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('email');
  });
});
