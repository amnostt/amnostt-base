import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';

describe('ChangePasswordDto', () => {
  it.each([12, 128])(
    'accepts a %s-character replacement without composition rules',
    async (length) => {
      const dto = plainToInstance(ChangePasswordDto, {
        currentPassword: 'current-password',
        newPassword: 'a'.repeat(length),
      });

      await expect(validate(dto)).resolves.toEqual([]);
    },
  );

  it.each([
    { password: 'a'.repeat(11), description: 'an 11-character password' },
    { password: 'a'.repeat(129), description: 'a 129-character password' },
    { password: 123456789012, description: 'a non-string password' },
  ])('rejects $description before writes', async ({ password }) => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'current-password',
      newPassword: password,
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('newPassword');
  });
});
