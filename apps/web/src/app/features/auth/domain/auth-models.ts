export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface GoogleLoginInput {
  challengeId: string;
  credential: string;
}

export interface GoogleProviderConfig {
  provider: 'google';
  enabled: boolean;
  clientId: string | null;
}

export interface GoogleLinkStatus extends GoogleProviderConfig {
  linked: boolean;
}

export interface GoogleLinkChallenge {
  challengeId: string;
  nonce: string;
  expiresAt: string;
}

export interface GoogleLinkResult {
  provider: 'google';
  linked: true;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ForgotPasswordResult {
  message: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface Session {
  accessToken: string;
  currentUser: CurrentUser;
}

export type SessionState =
  | { status: 'bootstrap-loading' }
  | { status: 'unauthenticated'; notice?: 'session-expired' }
  | { status: 'login-submitting'; email: string }
  | { status: 'google-login-submitting' }
  | { status: 'register-submitting'; email: string }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'request-refreshing' }
  | { status: 'logout-pending' };
