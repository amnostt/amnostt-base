import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGalleryVerticalEnd } from '@ng-icons/lucide';
import { ZardButtonComponent } from '@/shared/zard/components/button/button.component';
import { ZardFieldImports } from '@/shared/zard/components/field/field.imports';
import { ZardInputComponent } from '@/shared/zard/components/input/input.component';
import { SessionStore } from '../../application/session-store';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    ZardButtonComponent,
    ZardInputComponent,
    ...ZardFieldImports,
  ],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideGalleryVerticalEnd })],
})
export class Login {
  private readonly sessionStore = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected readonly isLoading = computed(
    () => this.sessionStore.state().status === 'login-submitting',
  );
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly passwordResetNotice = this.readPasswordResetNotice();
  protected readonly loginForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

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
