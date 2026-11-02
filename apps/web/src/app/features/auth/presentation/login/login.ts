import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGalleryVerticalEnd } from '@ng-icons/lucide';
import { ZardButtonComponent } from '@/shared/zard/components/button/button.component';
import { ZardFieldImports } from '@/shared/zard/components/field/field.imports';
import { ZardInputComponent } from '@/shared/zard/components/input/input.component';
import { SessionStore } from '../../application/session-store';
import { AuthApi } from '../../infrastructure/auth-api';
import { firstValueFrom } from 'rxjs';
import { GoogleSignInButton, GoogleSignInRequest } from '../google-sign-in/google-sign-in';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    ZardButtonComponent,
    ZardInputComponent,
    GoogleSignInButton,
    ...ZardFieldImports,
  ],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideGalleryVerticalEnd })],
})
export class Login {
  private readonly sessionStore = inject(SessionStore);
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private googleRevision = 0;
  private googleChallengeId = '';
  private googleSessionRevision = 0;
  private readonly location = inject(Location);

  protected readonly isLoading = computed(
    () =>
      this.sessionStore.state().status === 'login-submitting' ||
      this.sessionStore.state().status === 'google-login-submitting',
  );
  protected readonly googleState = signal<
    'loading' | 'waiting' | 'submitting' | 'unavailable' | 'error' | 'idle'
  >('loading');
  protected readonly googleRequest = signal<GoogleSignInRequest | null>(null);
  protected readonly googleError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly passwordResetNotice = this.readPasswordResetNotice();
  protected readonly loginForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.googleRevision++;
      this.googleRequest.set(null);
    });
    effect(() => {
      const sessionRevision = this.sessionStore.revision();
      if (this.googleState() === 'waiting' && sessionRevision !== this.googleSessionRevision) {
        this.invalidateGoogle();
      }
    });
    void this.prepareGoogle();
  }

  protected async onSubmit(): Promise<void> {
    if (this.isLoading()) return;

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);

    try {
      await this.sessionStore.login(this.loginForm.getRawValue());

      if (this.sessionStore.state().status === 'authenticated') {
        this.loginForm.controls.password.reset();
        await this.router.navigateByUrl('/', { replaceUrl: true });
      }
    } catch {
      this.errorMessage.set('No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.');
    }
  }

  protected async retryGoogle(): Promise<void> {
    await this.prepareGoogle();
  }

  protected cancelGoogle(): void {
    this.invalidateGoogle();
  }

  protected async onGoogleCredential(credential: string): Promise<void> {
    const revision = this.googleRevision;
    const challengeId = this.googleChallengeId;
    const sessionRevision = this.sessionStore.revision();
    if (
      !challengeId ||
      this.googleState() !== 'waiting' ||
      sessionRevision !== this.googleSessionRevision
    ) {
      if (sessionRevision !== this.googleSessionRevision) this.invalidateGoogle();
      return;
    }

    const expectedSessionRevision = sessionRevision + 1;
    this.googleState.set('submitting');
    this.googleError.set(null);
    try {
      await this.sessionStore.loginWithGoogle({ challengeId, credential });
      if (
        revision !== this.googleRevision ||
        this.sessionStore.revision() !== expectedSessionRevision
      ) {
        return;
      }
      if (this.sessionStore.state().status === 'authenticated') {
        this.googleChallengeId = '';
        this.googleRequest.set(null);
        await this.router.navigateByUrl('/', { replaceUrl: true });
      }
    } catch (error) {
      if (
        revision !== this.googleRevision ||
        this.sessionStore.revision() !== expectedSessionRevision
      ) {
        return;
      }
      this.googleRequest.set(null);
      this.googleState.set('error');
      this.googleError.set(this.googleErrorMessage(error));
    }
  }

  protected onGoogleSdkFailure(): void {
    if (this.googleState() !== 'submitting') {
      this.googleState.set('error');
      this.googleError.set('No pudimos cargar Google. Puedes reintentar.');
    }
  }

  private async prepareGoogle(): Promise<void> {
    const revision = ++this.googleRevision;
    const sessionRevision = this.sessionStore.revision();
    this.googleState.set('loading');
    this.googleError.set(null);
    this.googleRequest.set(null);

    try {
      const config = await firstValueFrom(this.authApi.googleConfig());
      if (!this.isGoogleCurrent(revision)) return;
      if (this.sessionStore.revision() !== sessionRevision) {
        this.invalidateGoogle();
        return;
      }
      if (!config.enabled || !config.clientId) {
        this.googleState.set('unavailable');
        return;
      }

      const challenge = await firstValueFrom(this.authApi.googleLoginChallenge());
      if (!this.isGoogleCurrent(revision)) return;
      if (this.sessionStore.revision() !== sessionRevision) {
        this.invalidateGoogle();
        return;
      }
      this.googleSessionRevision = sessionRevision;
      this.googleChallengeId = challenge.challengeId;
      this.googleRequest.set({
        clientId: config.clientId,
        nonce: challenge.nonce,
        text: 'signin_with',
      });
      this.googleState.set('waiting');
    } catch (error) {
      if (!this.isGoogleCurrent(revision)) return;
      if (this.sessionStore.revision() !== sessionRevision) {
        this.invalidateGoogle();
        return;
      }
      this.googleState.set('error');
      this.googleError.set(this.googleErrorMessage(error));
    }
  }

  private invalidateGoogle(): void {
    this.googleRevision++;
    this.googleChallengeId = '';
    this.googleRequest.set(null);
    this.googleState.set('idle');
    this.googleError.set(null);
  }

  private isGoogleCurrent(revision: number): boolean {
    return revision === this.googleRevision;
  }

  private googleErrorMessage(error: unknown): string {
    const status = (error as { status?: number } | null)?.status;
    if (status === 401)
      return 'No pudimos iniciar sesión con Google. Revisa tu cuenta e inténtalo de nuevo.';
    if (status === 429)
      return 'Has realizado demasiados intentos. Espera un momento y vuelve a intentarlo.';
    if (status === 503) return 'Google no está disponible en este momento.';
    return 'No pudimos preparar Google. Puedes reintentar.';
  }

  private readPasswordResetNotice(): string | null {
    const navigationState = this.router.currentNavigation()?.extras.state;
    if (navigationState?.['notice'] === 'password-reset-success') {
      return 'Tu contraseña se restableció. Inicia sesión con tu nueva contraseña.';
    }

    const locationState = this.location.getState();
    if (
      typeof locationState === 'object' &&
      locationState !== null &&
      'notice' in locationState &&
      locationState.notice === 'password-reset-success'
    ) {
      return 'Tu contraseña se restableció. Inicia sesión con tu nueva contraseña.';
    }

    return null;
  }
}
