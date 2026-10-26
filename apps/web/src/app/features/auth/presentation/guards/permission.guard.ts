import { SessionStore } from '@/features/auth/application/session-store';
import type { CurrentUser } from '@/features/auth/domain/auth-models';
import { authGuard } from '@/features/auth/presentation/guards/auth.guard';
import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { firstValueFrom, isObservable } from 'rxjs';

export function permissionGuard(policy: (user: CurrentUser) => boolean): CanActivateFn {
  return async (route, state) => {
    const session = inject(SessionStore);
    const router = inject(Router);

    const authentication = authGuard(route, state);
    const result = isObservable(authentication)
      ? await firstValueFrom(authentication)
      : await authentication;

    if (result !== true) {
      return result;
    }

    const snapshot = session.state();

    if (snapshot.status !== 'authenticated') {
      return router.createUrlTree(['/login']);
    }

    return policy(snapshot.user) ? true : router.createUrlTree(['/403']);
  };
}
