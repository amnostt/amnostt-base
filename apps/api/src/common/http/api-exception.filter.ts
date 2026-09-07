import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

interface ValidationDetail {
  field: string;
  code: string;
}

interface ErrorResponse {
  code: string;
  message: string;
  details?: ValidationDetail[];
}

const HTTP_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
};

const CONSTRAINT_CODES: Record<string, string> = {
  isNotEmpty: 'REQUIRED',
  isEmail: 'INVALID_EMAIL',
  minLength: 'TOO_SHORT',
  maxLength: 'TOO_LONG',
  isCalendarDate: 'INVALID_DATE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const error = this.normalize(exception, status);

    response.status(status).json({ error });
  }

  private normalize(exception: unknown, status: number): ErrorResponse {
    if (!(exception instanceof HttpException)) {
      return {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      };
    }

    const exceptionResponse = exception.getResponse();
    const details =
      status === 400 ? getValidationDetails(exceptionResponse) : undefined;

    if (details?.length) {
      return {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details,
      };
    }

    return {
      code: HTTP_CODES[status] ?? 'HTTP_ERROR',
      message: getExceptionMessage(exceptionResponse),
    };
  }
}

function getExceptionMessage(exceptionResponse: unknown): string {
  if (typeof exceptionResponse === 'string' && exceptionResponse.trim()) {
    return exceptionResponse;
  }

  if (
    isRecord(exceptionResponse) &&
    typeof exceptionResponse.message === 'string'
  ) {
    const message = exceptionResponse.message.trim();
    if (message) return message;
  }

  return 'Request failed';
}

function getValidationDetails(
  exceptionResponse: unknown,
): ValidationDetail[] | undefined {
  const errors = getValidationErrors(exceptionResponse);
  if (!errors) return undefined;

  const details = flattenValidationErrors(errors);
  return details.length ? details : undefined;
}

function getValidationErrors(
  exceptionResponse: unknown,
): unknown[] | undefined {
  if (Array.isArray(exceptionResponse)) {
    return exceptionResponse as unknown[];
  }
  if (isRecord(exceptionResponse) && Array.isArray(exceptionResponse.message)) {
    return exceptionResponse.message as unknown[];
  }
  return undefined;
}

function flattenValidationErrors(
  errors: unknown[],
  parentField = '',
): ValidationDetail[] {
  const details: ValidationDetail[] = [];

  for (const error of errors) {
    if (!isRecord(error)) continue;

    const property = typeof error.property === 'string' ? error.property : '';
    const field =
      parentField && property
        ? `${parentField}.${property}`
        : property || parentField;
    if (field && isRecord(error.constraints)) {
      for (const constraint of Object.keys(error.constraints)) {
        details.push({
          field,
          code: CONSTRAINT_CODES[constraint] ?? 'INVALID',
        });
      }
    }

    if (Array.isArray(error.children)) {
      details.push(...flattenValidationErrors(error.children, field));
    }
  }

  return details;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
