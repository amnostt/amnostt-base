import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import type { CurrentUser, LoginInput, Session } from '../domain/auth-models';

@Service()
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(input: LoginInput): Observable<Session> {
    return this.http
      .post<{ data: Session }>('/api/auth/login', input, { withCredentials: true })
      .pipe(map((response) => response.data));
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', null, { withCredentials: true });
  }

  restore(): Observable<Session> {
    return this.http
      .post<{ data: { accessToken: string } }>('/api/auth/refresh', null, { withCredentials: true })
      .pipe(
        switchMap((response) => {
          const accessToken = response.data.accessToken;

          return this.http
            .get<{ data: { currentUser: CurrentUser } }>('/api/auth/me', {
              withCredentials: true,
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            })
            .pipe(
              map((userResponse) => ({
                accessToken,
                currentUser: userResponse.data.currentUser,
              })),
            );
        }),
      );
  }
}
