import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { TaskStatus } from '../../generated/prisma/client';
import { isValidTaskCalendarDate } from '../task-query';

@ValidatorConstraint({ name: 'isCalendarDate' })
class CalendarDateValidator implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidTaskCalendarDate(value);
  }

  defaultMessage(): string {
    return 'dueDate must be a valid YYYY-MM-DD calendar date';
  }
}

export class TaskUpdateDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => {
    const input: unknown = value as unknown;
    return typeof input === 'string' ? input.trim() : input;
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  @Validate(CalendarDateValidator)
  dueDate?: string | null;
}
