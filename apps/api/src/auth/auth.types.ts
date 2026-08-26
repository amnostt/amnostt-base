export type AuthTokenType = 'access' | 'refresh';

export interface AuthTokenPayload {
  sub: string;
  sid: string;
  type: AuthTokenType;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends AuthTokenPair {
  currentUser: CurrentUser;
}
