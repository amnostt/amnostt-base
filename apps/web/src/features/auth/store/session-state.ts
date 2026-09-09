import type { LoginInput, RegisterInput, SessionState } from '../domain/auth-models';

export interface SessionStore {
  snapshot: SessionState;
  bootstrap(): Promise<void>;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  requestResponse<T>(
    path: string,
    init?: RequestInit,
  ): Promise<import('../../../core/http/api-client').ApiResponse<T>>;
}
