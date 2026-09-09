import type { CurrentUser } from '../domain/auth-models';

export interface LoginResponse {
  accessToken: string;
  currentUser: CurrentUser;
}

export type RegisterResponse = LoginResponse;

export interface MeResponse {
  currentUser: CurrentUser;
}

export interface RefreshResponse {
  accessToken: string;
}
