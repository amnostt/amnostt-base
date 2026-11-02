import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGalleryVerticalEnd } from '@ng-icons/lucide';
import { ZardButtonComponent } from '@/shared/zard/components/button/button.component';
import { ZardFieldImports } from '@/shared/zard/components/field/field.imports';
import { ZardInputComponent } from '@/shared/zard/components/input/input.component';
import { SessionStore } from '../../application/session-store';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const INVALID_LINK_MESSAGE = 'El enlace de recuperación no es válido o ha expirado.';
const RATE_LIMIT_MESSAGE = 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.';
const GENERIC_ERROR_MESSAGE = 'No pudimos restablecer tu contraseña. Inténtalo de nuevo.';

const PASSWORD_ERROR_MESSAGE = 'La contraseña debe tener entre 12 y 128 caracteres.';

type ResetStatus = 'ready' | 'pending' | 'invalid-link' | 'error';
type ResetError = 'rate-limit' | 'generic' | null;

@Component({
  selector: 'app-reset-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    ZardButtonComponent,
    ZardInputComponent,
    ...ZardFieldImports,
  ],
  templateUrl: './reset-password.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideGalleryVerticalEnd })],
})
export class ResetPassword {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sessionStore = inject(SessionStore);
  private readonly token: string | null;
  private readonly resetStatus = signal<ResetStatus>('ready');
  private readonly resetError = signal<ResetError>(null);

  protected readonly resetForm = new FormGroup({
    newPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(12), Validators.maxLength(128)],
    }),
  });
  protected readonly isLoading = computed(() => this.resetStatus() === 'pending');
  protected readonly isInvalidLink = computed(() => this.resetStatus() === 'invalid-link');
  protected readonly errorMessage = computed(() => {
    if (this.resetStatus() === 'invalid-link') return INVALID_LINK_MESSAGE;
    if (this.resetStatus() !== 'error') return null;

    return this.resetError() === 'rate-limit' ? RATE_LIMIT_MESSAGE : GENERIC_ERROR_MESSAGE;
  });

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token');
    this.token = token && TOKEN_PATTERN.test(token) ? token : null;

    if (!this.token) {
      this.resetStatus.set('invalid-link');
    }
  }

  protected async onSubmit(): Promise<void> {
    if (this.isLoading() || this.isInvalidLink()) return;

    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.resetStatus.set('pending');
    this.resetError.set(null);

    try {
      await this.sessionStore.resetPassword({
        token: this.token!,
        newPassword: this.resetForm.controls.newPassword.value,
      });
      this.resetForm.controls.newPassword.reset();
      await this.router.navigateByUrl('/login', {
        replaceUrl: true,
        state: { notice: 'password-reset-success' },
      });
    } catch (error: unknown) {
      if (this.isUnauthorizedError(error)) {
        this.resetStatus.set('invalid-link');
        return;
      }

      this.resetError.set(this.isRateLimitError(error) ? 'rate-limit' : 'generic');
      this.resetStatus.set('error');
    }
  }

  protected readonly passwordErrorMessage = PASSWORD_ERROR_MESSAGE;

  private isUnauthorizedError(error: unknown): boolean {
    return this.hasStatus(error, 401);
  }

  private isRateLimitError(error: unknown): boolean {
    return this.hasStatus(error, 429);
  }

  private hasStatus(error: unknown, status: number): boolean {
    return (
      typeof error === 'object' && error !== null && 'status' in error && error.status === status
    );
  }
}
