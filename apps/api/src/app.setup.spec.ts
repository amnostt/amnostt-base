import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { ApiResponseInterceptor } from './common/http/api-response.interceptor';
import { configureApp } from './app.setup';

describe('configureApp', () => {
  it('registers the API exception filter globally', () => {
    const useGlobalFilters = jest.fn();
    const useGlobalInterceptors = jest.fn();
    const app = {
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters,
      useGlobalInterceptors,
      enableCors: jest.fn(),
    } as unknown as INestApplication;
    const configService = {
      get: jest.fn().mockReturnValue('http://localhost:5173'),
    } as unknown as ConfigService;

    configureApp(app, configService);

    expect(useGlobalFilters).toHaveBeenCalledWith(
      expect.any(ApiExceptionFilter),
    );
    expect(useGlobalInterceptors).toHaveBeenCalledWith(
      expect.any(ApiResponseInterceptor),
    );
  });
});
