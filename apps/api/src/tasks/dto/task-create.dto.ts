import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
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

export class TaskCreateDto {
  @Transform(({ value }: TransformFnParams) => {
    const input: unknown = value as unknown;
    return typeof input === 'string' ? input.trim() : input;
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status: TaskStatus = TaskStatus.pending;

  @IsOptional()
  @IsString()
  @Validate(CalendarDateValidator)
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}
