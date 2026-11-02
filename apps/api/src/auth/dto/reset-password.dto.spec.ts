import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResetPasswordDto } from './reset-password.dto';

describe('ResetPasswordDto', () => {
  it.each([12, 128])(
    'accepts a %s-character replacement and a non-empty token',
    async (length) => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(43),
        newPassword: 'b'.repeat(length),
      });

      await expect(validate(dto)).resolves.toEqual([]);
    },
  );

  it.each([11, 129])(
    'rejects a %s-character replacement before persistence',
    async (length) => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(43),
        newPassword: 'b'.repeat(length),
      });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('newPassword');
    },
  );

  it('rejects a missing or non-string token before persistence', async () => {
    for (const token of ['', 123]) {
      const dto = plainToInstance(ResetPasswordDto, {
        token,
        newPassword: 'b'.repeat(12),
      });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('token');
    }
  });
});
