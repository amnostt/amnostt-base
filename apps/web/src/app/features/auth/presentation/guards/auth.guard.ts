import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from '../../application/session-store';

export const authGuard: CanActivateFn = async () => {
  const sessionStore = inject(SessionStore);
  const router = inject(Router);

  if (sessionStore.state().status === 'bootstrap-loading') {
    await sessionStore.bootstrap();
  }

  return sessionStore.state().status === 'authenticated' ? true : router.createUrlTree(['/login']);
};
