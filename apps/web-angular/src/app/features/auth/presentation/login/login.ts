import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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

  protected readonly isLoading = computed(
    () => this.sessionStore.state().status === 'login-submitting',
  );
  protected readonly errorMessage = signal<string | null>(null);
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
      }
    } catch {
      this.errorMessage.set('No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.');
    }
  }
}
