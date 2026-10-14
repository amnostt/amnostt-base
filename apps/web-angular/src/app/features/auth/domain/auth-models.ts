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

export interface Session {
  accessToken: string;
  currentUser: CurrentUser;
}

export type SessionState =
  | { status: 'bootstrap-loading' }
  | { status: 'unauthenticated'; notice?: 'session-expired' }
  | { status: 'login-submitting'; email: string }
  | { status: 'register-submitting'; email: string }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'request-refreshing' }
  | { status: 'logout-pending' };
