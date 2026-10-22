import { SessionStore } from '@/features/auth/application/session-store';
import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

@Service()
export class AuthenticatedApiClient {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionStore);

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
      throw new Error('Only API-relative paths are allowed');
    }
    return this.session.withAuthenticatedSession((token) =>
      firstValueFrom(
        this.http.request<T>(method, `/api${path}`, {
          body,
          withCredentials: true,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ),
    );
  }
}
