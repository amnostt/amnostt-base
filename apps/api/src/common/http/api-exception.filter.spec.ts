import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import { ApiExceptionFilter } from './api-exception.filter';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; code: string }>;
  };
}

function createHost(): {
  host: ArgumentsHost;
  status: jest.Mock;
  body: () => ErrorBody;
} {
  let capturedBody: ErrorBody | undefined;
  const json = jest.fn((body: ErrorBody) => {
    capturedBody = body;
  });
  const status = jest.fn().mockReturnValue({ json });
  const response = {
    status,
  } as unknown as Response;
  const httpContext = {
    getResponse: () => response,
  };

  return {
    host: {
      switchToHttp: () => httpContext,
    } as unknown as ArgumentsHost,
    status,
    body: () => capturedBody as ErrorBody,
  };
}

describe('ApiExceptionFilter', () => {
  it.each([
    [new BadRequestException('invalid request'), 'BAD_REQUEST'],
    [new UnauthorizedException('not authorized'), 'UNAUTHORIZED'],
    [new ForbiddenException('forbidden'), 'FORBIDDEN'],
    [new NotFoundException('missing'), 'NOT_FOUND'],
    [new ConflictException('conflict'), 'CONFLICT'],
  ])('maps HTTP exceptions to stable code %s', (exception, code) => {
    const filter = new ApiExceptionFilter();
    const { host, status, body } = createHost();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(exception.getStatus());
    const responseBody = body();
    expect(responseBody.error.code).toBe(code);
    expect(responseBody.error.message.trim()).not.toBe('');
    expect(responseBody.error).not.toHaveProperty('details');
  });

  it('maps validation errors to field-level stable codes', () => {
    const filter = new ApiExceptionFilter();
    const { host, body } = createHost();
    const exception = new BadRequestException([
      { property: 'email', constraints: { isEmail: 'invalid email' } },
      {
        property: 'password',
        constraints: {
          isNotEmpty: 'password is required',
          maxLength: 'password is too long',
        },
      },
    ]);

    filter.catch(exception, host);

    const responseBody = body();
    expect(responseBody.error.code).toBe('VALIDATION_FAILED');
    expect(responseBody.error.message.trim()).not.toBe('');
    expect(responseBody.error.details).toEqual([
      { field: 'email', code: 'INVALID_EMAIL' },
      { field: 'password', code: 'REQUIRED' },
      { field: 'password', code: 'TOO_LONG' },
    ]);
    for (const detail of responseBody.error.details ?? []) {
      expect(Object.keys(detail).sort()).toEqual(['code', 'field']);
    }
  });

  it('uses a safe internal error envelope and logs unexpected exceptions', () => {
    const logger = jest.spyOn(Logger, 'error').mockImplementation();
    const filter = new ApiExceptionFilter();
    const { host, status, body } = createHost();

    filter.catch(new Error('database password leaked'), host);

    expect(status).toHaveBeenCalledWith(500);
    const responseBody = body();
    expect(responseBody.error.code).toBe('INTERNAL_ERROR');
    expect(responseBody.error.message.trim()).not.toBe('');
    expect(responseBody.error.message).not.toContain(
      'database password leaked',
    );
    expect(responseBody.error).not.toHaveProperty('details');
    expect(logger).toHaveBeenCalledWith(
      'Unhandled HTTP exception',
      expect.any(String),
      ApiExceptionFilter.name,
    );
    logger.mockRestore();
  });

  it('uses HTTP_ERROR for an unmapped HTTP status', () => {
    const filter = new ApiExceptionFilter();
    const { host, status, body } = createHost();

    filter.catch(new HttpException('unusual failure', 418), host);

    expect(status).toHaveBeenCalledWith(418);
    const responseBody = body();
    expect(responseBody.error.code).toBe('HTTP_ERROR');
    expect(responseBody.error.message.trim()).not.toBe('');
    expect(responseBody.error).not.toHaveProperty('details');
  });
});
