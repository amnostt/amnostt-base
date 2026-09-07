import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ApiResponseInterceptor } from './api-response.interceptor';

function handler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe('ApiResponseInterceptor', () => {
  it('wraps a defined response body under data', async () => {
    const interceptor = new ApiResponseInterceptor();

    await expect(
      lastValueFrom(
        interceptor.intercept(
          {} as ExecutionContext,
          handler({ status: 'ok' }),
        ),
      ),
    ).resolves.toEqual({ data: { status: 'ok' } });
  });

  it('preserves collection metadata when the body is already an envelope', async () => {
    const interceptor = new ApiResponseInterceptor();
    const response = { data: [{ id: 'task-1' }], meta: { page: 1 } };

    await expect(
      lastValueFrom(
        interceptor.intercept({} as ExecutionContext, handler(response)),
      ),
    ).resolves.toEqual(response);
  });

  it('passes an undefined response through for empty responses', async () => {
    const interceptor = new ApiResponseInterceptor();

    await expect(
      lastValueFrom(
        interceptor.intercept({} as ExecutionContext, handler(undefined)),
      ),
    ).resolves.toBeUndefined();
  });
});
