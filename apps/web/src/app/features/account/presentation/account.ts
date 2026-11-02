import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ZardAvatarComponent } from '@/shared/zard/components/avatar/avatar.component';
import { ZardBadgeComponent } from '@/shared/zard/components/badge/badge.component';
import { ZardButtonComponent } from '@/shared/zard/components/button/button.component';
import { ZardSeparatorComponent } from '@/shared/zard/components/separator/separator.component';
import { SessionStore } from '@/features/auth/application/session-store';
import type { CurrentUser, GoogleLinkStatus } from '@/features/auth/domain/auth-models';
import {
  GoogleSignInButton,
  GoogleSignInRequest,
} from '@/features/auth/presentation/google-sign-in/google-sign-in';
import { AccountApi } from '../infrastructure/account-api';

type AccountStatus = 'loading' | 'ready' | 'unavailable' | 'linked' | 'error';
type LinkStatus = 'idle' | 'preparing' | 'waiting' | 'submitting' | 'linked' | 'error';

@Component({
  selector: 'app-account',
  imports: [
    ZardAvatarComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardSeparatorComponent,
    GoogleSignInButton,
  ],
  templateUrl: './account.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Account {
  private readonly accountApi = inject(AccountApi);
  private readonly sessionStore = inject(SessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private requestRevision = 0;
  private linkSessionRevision = 0;
  private destroyed = false;

  protected readonly accountStatus = signal<AccountStatus>('loading');
  protected readonly linkStatus = signal<LinkStatus>('idle');
  protected readonly googleStatus = signal<GoogleLinkStatus | null>(null);
  protected readonly googleRequest = signal<GoogleSignInRequest | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly linkError = signal<string | null>(null);
  protected readonly user = computed<CurrentUser | null>(() => {
    const state = this.sessionStore.state();
    return state.status === 'authenticated' ? state.user : null;
  });
  protected readonly initials = computed(() => {
    const user = this.user();
    if (!user) return '';
    return (
      user.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join('')
        .toUpperCase() || user.email.charAt(0).toUpperCase()
    );
  });
  protected readonly isLinking = computed(
    () => this.linkStatus() === 'preparing' || this.linkStatus() === 'submitting',
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.requestRevision++;
      this.googleRequest.set(null);
    });
    effect(() => {
      const sessionRevision = this.sessionStore.revision();
      if (this.linkStatus() === 'waiting' && sessionRevision !== this.linkSessionRevision) {
        this.invalidateLinkFlow();
      }
    });
    void this.loadStatus();
  }

  protected async loadStatus(): Promise<void> {
    const revision = ++this.requestRevision;
    this.accountStatus.set('loading');
    this.errorMessage.set(null);

    try {
      const status = await this.accountApi.googleStatus();
      if (!this.isCurrent(revision)) return;

      this.googleStatus.set(status);
      this.accountStatus.set(status.linked ? 'linked' : status.enabled ? 'ready' : 'unavailable');
    } catch {
      if (!this.isCurrent(revision)) return;
      this.accountStatus.set('error');
      this.errorMessage.set('No pudimos consultar el estado de Google. Inténtalo de nuevo.');
    }
  }

  protected async startGoogleLink(): Promise<void> {
    const status = this.googleStatus();
    const user = this.user();
    if (!status?.enabled || status.linked || !status.clientId || !user || this.isLinking()) return;

    const revision = ++this.requestRevision;
    const sessionRevision = this.sessionStore.revision();
    this.linkStatus.set('preparing');
    this.linkError.set(null);
    this.googleRequest.set(null);

    try {
      const challenge = await this.accountApi.createGoogleLinkChallenge();
      if (!this.isCurrent(revision)) return;
      if (this.sessionStore.revision() !== sessionRevision) {
        this.invalidateLinkFlow();
        return;
      }

      this.linkSessionRevision = sessionRevision;
      this.challengeId = challenge.challengeId;
      this.googleRequest.set({
        clientId: status.clientId,
        nonce: challenge.nonce,
        text: 'continue_with',
      });
      this.linkStatus.set('waiting');
    } catch (error) {
      if (!this.isCurrent(revision)) return;
      if (this.sessionStore.revision() !== sessionRevision) {
        this.invalidateLinkFlow();
        return;
      }
      this.linkStatus.set('error');
      this.linkError.set(this.googleErrorMessage(error, 'No pudimos preparar la vinculación.'));
    }
  }

  protected cancelGoogleLink(): void {
    this.invalidateLinkFlow();
  }

  protected async onGoogleCredential(credential: string): Promise<void> {
    const request = this.googleRequest();
    if (!request || this.linkStatus() !== 'waiting') return;

    const sessionRevision = this.sessionStore.revision();
    if (sessionRevision !== this.linkSessionRevision) {
      this.invalidateLinkFlow();
      return;
    }

    const revision = this.requestRevision;
    this.linkStatus.set('submitting');
    this.linkError.set(null);

    try {
      await this.accountApi.linkGoogle({ challengeId: this.challengeId, credential });
      if (!this.isCurrent(revision) || this.sessionStore.revision() !== sessionRevision) return;

      this.challengeId = '';
      this.googleRequest.set(null);
      this.linkStatus.set('linked');
      this.accountStatus.set('linked');
      this.googleStatus.update((status) => (status ? { ...status, linked: true } : status));
    } catch (error) {
      if (!this.isCurrent(revision)) return;
      if (this.sessionStore.revision() !== sessionRevision) {
        this.invalidateLinkFlow();
        return;
      }
      this.linkStatus.set('error');
      this.linkError.set(this.googleErrorMessage(error, 'No pudimos vincular Google.'));
    }
  }

  protected onGoogleSdkFailure(): void {
    if (this.linkStatus() === 'waiting') {
      this.linkStatus.set('error');
      this.linkError.set('No pudimos cargar Google. Puedes reintentar.');
    }
  }

  private invalidateLinkFlow(): void {
    this.requestRevision++;
    this.challengeId = '';
    this.googleRequest.set(null);
    this.linkStatus.set('idle');
    this.linkError.set(null);
  }

  // The challenge ID is kept only for this mounted flow and never rendered.
  private challengeId = '';

  private isCurrent(revision: number): boolean {
    return !this.destroyed && revision === this.requestRevision;
  }

  private googleErrorMessage(error: unknown, fallback: string): string {
    const status = (error as { status?: number } | null)?.status;
    if (status === 401) {
      return 'La vinculación requiere una cuenta Google con el mismo correo verificado. Revisa la cuenta elegida e inténtalo de nuevo.';
    }
    if (status === 409) return 'Esta cuenta de Google ya está vinculada.';
    if (status === 503) return 'Google no está disponible en este momento.';
    if (status === 429)
      return 'Has realizado demasiados intentos. Espera un momento y vuelve a intentarlo.';
    return fallback;
  }
}
