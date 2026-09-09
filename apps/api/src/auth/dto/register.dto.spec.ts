import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

describe('RegisterDto', () => {
  it.each([12, 128])(
    'accepts a %s-character password without composition rules',
    async (length) => {
      const dto = plainToInstance(RegisterDto, {
        email: ' New@Example.com ',
        password: 'a'.repeat(length),
      });

      await expect(validate(dto)).resolves.toEqual([]);
      expect(dto.email).toBe('new@example.com');
    },
  );

  it.each([
    { password: 'a'.repeat(11), description: 'an 11-character password' },
    { password: 'a'.repeat(129), description: 'a 129-character password' },
    { password: 123456789012, description: 'a non-string password' },
  ])('rejects $description before writes', async ({ password }) => {
    const dto = plainToInstance(RegisterDto, {
      email: 'new@example.com',
      password,
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('password');
  });
});
