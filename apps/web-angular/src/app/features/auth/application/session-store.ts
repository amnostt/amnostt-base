import { inject, Service, signal } from '@angular/core';
import { LoginInput, SessionState } from '../domain/auth-models';
import { AuthApi } from '../infrastructure/auth-api';
import { firstValueFrom } from 'rxjs';

@Service()
export class SessionStore {
  private readonly auth = inject(AuthApi);

  private readonly sessionState = signal<SessionState>({
    status: 'bootstrap-loading',
  });

  private readonly accessToken = signal<string | undefined>(undefined);
  private bootstrapPromise: Promise<void> | undefined;
  private sessionRevision = 0;

  readonly state = this.sessionState.asReadonly();

  bootstrap(): Promise<void> {
    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }

    if (this.isAuthOperationPending()) {
      return Promise.resolve();
    }

    const revision = this.sessionRevision;

    this.bootstrapPromise = this.restoreSession(revision).finally(() => {
      this.bootstrapPromise = undefined;
    });

    return this.bootstrapPromise;
  }

  async login(input: LoginInput): Promise<void> {
    if (this.isAuthOperationPending()) {
      return;
    }

    const revision = ++this.sessionRevision;

    this.sessionState.set({
      status: 'login-submitting',
      email: input.email,
    });

    try {
      const session = await firstValueFrom(this.auth.login(input));

      if (revision !== this.sessionRevision) {
        return;
      }

      this.accessToken.set(session.accessToken);
      this.sessionState.set({
        status: 'authenticated',
        user: session.currentUser,
      });
    } catch (error) {
      if (revision === this.sessionRevision) {
        this.accessToken.set(undefined);
        this.sessionState.set({ status: 'unauthenticated' });
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    if (this.sessionState().status === 'logout-pending') {
      return;
    }

    ++this.sessionRevision;
    this.accessToken.set(undefined);
    this.sessionState.set({ status: 'logout-pending' });

    try {
      await firstValueFrom(this.auth.logout());
    } finally {
      this.sessionState.set({ status: 'unauthenticated' });
    }
  }

  private async restoreSession(revision: number): Promise<void> {
    try {
      const session = await firstValueFrom(this.auth.restore());

      if (revision !== this.sessionRevision) {
        return;
      }

      this.accessToken.set(session.accessToken);
      this.sessionState.set({
        status: 'authenticated',
        user: session.currentUser,
      });
    } catch {
      if (revision !== this.sessionRevision) {
        return;
      }

      this.accessToken.set(undefined);
      this.sessionState.set({ status: 'unauthenticated' });
    }
  }

  private isAuthOperationPending(): boolean {
    const status = this.sessionState().status;

    return (
      status === 'login-submitting' ||
      status === 'register-submitting' ||
      status === 'logout-pending'
    );
  }
}
