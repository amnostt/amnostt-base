import type { ApiClient } from '../../../core/http/api-client';
import type { AuthRepository } from '../domain/auth-repository';
import type { LoginInput, RegisterInput, Session } from '../domain/auth-models';
import type {
  LoginResponse,
  MeResponse,
  RefreshResponse,
  RegisterResponse,
} from './auth-dtos';

export class HttpAuthRepository implements AuthRepository {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  async login(input: LoginInput): Promise<Session> {
    const response = await this.client.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
    return {
      accessToken: response.accessToken,
      currentUser: response.currentUser,
    };
  }

  async register(input: RegisterInput): Promise<Session> {
    const response = await this.client.request<RegisterResponse>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    return {
      accessToken: response.accessToken,
      currentUser: response.currentUser,
    };
  }

  async restore(): Promise<Session> {
    const accessToken = await this.refresh();
    const { currentUser } = await this.me(accessToken);
    return { accessToken, currentUser };
  }

  async refresh(): Promise<string> {
    const { accessToken } = await this.client.request<RefreshResponse>(
      '/auth/refresh',
      {
        method: 'POST',
      },
    );
    return accessToken;
  }

  async logout(): Promise<void> {
    await this.client.request<void>('/auth/logout', { method: 'POST' });
  }

  private me(token: string): Promise<MeResponse> {
    return this.client.request<MeResponse>('/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}
