import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGalleryVerticalEnd } from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { ZardButtonComponent } from '@/shared/zard/components/button/button.component';
import { ZardFieldImports } from '@/shared/zard/components/field/field.imports';
import { ZardInputComponent } from '@/shared/zard/components/input/input.component';
import { AuthApi } from '../../infrastructure/auth-api';

const SUCCESS_MESSAGE =
  'Si existe una cuenta activa con ese correo, recibirás instrucciones para recuperar el acceso.';
const RATE_LIMIT_MESSAGE = 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.';
const GENERIC_ERROR_MESSAGE = 'No pudimos procesar la solicitud. Inténtalo de nuevo.';

type RequestStatus = 'idle' | 'pending' | 'success' | 'error';

type RequestError = 'rate-limit' | 'generic' | null;

@Component({
  selector: 'app-forgot-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    ZardButtonComponent,
    ZardInputComponent,
    ...ZardFieldImports,
  ],
  templateUrl: './forgot-password.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideGalleryVerticalEnd })],
})
export class ForgotPassword {
  private readonly authApi = inject(AuthApi);
  private readonly requestStatus = signal<RequestStatus>('idle');
  private readonly requestError = signal<RequestError>(null);

  protected readonly forgotForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
  });
  protected readonly isLoading = computed(() => this.requestStatus() === 'pending');
  protected readonly successMessage = computed(() =>
    this.requestStatus() === 'success' ? SUCCESS_MESSAGE : null,
  );
  protected readonly errorMessage = computed(() => {
    if (this.requestStatus() !== 'error') return null;

    return this.requestError() === 'rate-limit' ? RATE_LIMIT_MESSAGE : GENERIC_ERROR_MESSAGE;
  });

  protected async onSubmit(): Promise<void> {
    if (this.isLoading()) return;

    const email = this.forgotForm.controls.email.value.trim().toLowerCase();
    this.forgotForm.controls.email.setValue(email);

    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    this.requestStatus.set('pending');
    this.requestError.set(null);

    try {
      await firstValueFrom(this.authApi.forgotPassword({ email }));
      this.requestStatus.set('success');
    } catch (error: unknown) {
      this.requestError.set(this.isRateLimitError(error) ? 'rate-limit' : 'generic');
      this.requestStatus.set('error');
    }
  }

  private isRateLimitError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'status' in error && error.status === 429;
  }
}
