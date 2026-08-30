import type { ApiClient } from './api-client'
import type { CurrentUser, LoginResponse, MeResponse, RefreshResponse } from './auth-types'
export interface AuthApi {
  login(input: { email: string; password: string }): Promise<LoginResponse>
  me(token: string): Promise<CurrentUser>
  refresh(): Promise<RefreshResponse>
  logout(): Promise<void>
}
export function createAuthApi(client: ApiClient): AuthApi {
  return {
    login: (input) => client.request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' } }),
    me: async (token) => (await client.request<MeResponse>('/auth/me', { method: 'GET', headers: { Authorization: `Bearer ${token}` } })).currentUser,
    refresh: () => client.request<RefreshResponse>('/auth/refresh', { method: 'POST' }),
    logout: () => client.request<void>('/auth/logout', { method: 'POST' }),
  }
}
