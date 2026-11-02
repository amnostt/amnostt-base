import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import type {
  CurrentUser,
  ForgotPasswordInput,
  ForgotPasswordResult,
  GoogleLinkChallenge,
  GoogleLoginInput,
  GoogleProviderConfig,
  LoginInput,
  ResetPasswordInput,
  Session,
} from '../domain/auth-models';

@Service()
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(input: LoginInput): Observable<Session> {
    return this.http
      .post<{ data: Session }>('/api/auth/login', input, { withCredentials: true })
      .pipe(map((response) => response.data));
  }

  googleConfig(): Observable<GoogleProviderConfig> {
    return this.http
      .get<{ data: GoogleProviderConfig }>('/api/auth/google/config', { withCredentials: true })
      .pipe(map((response) => response.data));
  }

  googleLoginChallenge(): Observable<GoogleLinkChallenge> {
    return this.http
      .post<{ data: GoogleLinkChallenge }>('/api/auth/google/login/challenge', null, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  googleLogin(input: GoogleLoginInput): Observable<Session> {
    return this.http
      .post<{ data: Session }>('/api/auth/google/login', input, { withCredentials: true })
      .pipe(map((response) => response.data));
  }

  forgotPassword(input: ForgotPasswordInput): Observable<ForgotPasswordResult> {
    return this.http
      .post<{ data: ForgotPasswordResult }>('/api/auth/forgot-password', input, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  resetPassword(input: ResetPasswordInput): Observable<void> {
    return this.http.post<void>('/api/auth/reset-password', input, {
      withCredentials: true,
    });
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
