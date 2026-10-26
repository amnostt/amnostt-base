import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import { provideHttpClient } from '@angular/common/http';
import { SessionStore } from './features/auth/application/session-store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideZard(),
    provideAppInitializer(() => inject(SessionStore).bootstrap()),
  ],
};
