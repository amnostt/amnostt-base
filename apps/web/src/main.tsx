import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { createApiClient } from './core/http/api-client';
import { HttpAuthRepository } from './features/auth/infrastructure/http-auth-repository';
import { SessionProvider } from './features/auth/components/session-provider';
import { createSessionStore } from './features/auth/store/session-store';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
const apiClient = createApiClient(apiUrl);
const authRepository = new HttpAuthRepository(apiClient);
const sessionStore = createSessionStore(
  authRepository,
  apiClient.request,
  apiClient.requestResponse,
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider store={sessionStore}>
      <App />
    </SessionProvider>
  </StrictMode>,
);
