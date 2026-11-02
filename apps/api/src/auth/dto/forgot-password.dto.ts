import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @Transform(({ value }: TransformFnParams) => {
    const input: unknown = value as unknown;
    return typeof input === 'string' ? input.trim().toLowerCase() : input;
  })
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
