import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
  Validate,
} from 'class-validator';
import { TaskStatus } from '../../generated/prisma/client';
import { isValidTaskCalendarDate, TASK_SORT_FIELDS } from '../task-query';

class CalendarDateValidator {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidTaskCalendarDate(value);
  }

  defaultMessage(): string {
    return 'dueDate must be a valid YYYY-MM-DD calendar date';
  }
}

export class TaskQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsString()
  @Validate(CalendarDateValidator)
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsIn(TASK_SORT_FIELDS.flatMap((field) => [field, `-${field}`]))
  sort = '-createdAt';
}
