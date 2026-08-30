export interface CurrentUser {
  id: string
  email: string
  name: string
  role: string
  permissions: string[]
}
export interface LoginResponse { accessToken: string; currentUser: CurrentUser }
export interface MeResponse { currentUser: CurrentUser }
export interface RefreshResponse { accessToken: string }
export type SessionState =
  | { status: 'bootstrap-loading' }
  | { status: 'unauthenticated'; notice?: 'session-expired' }
  | { status: 'login-submitting'; email: string }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'request-refreshing' }
  | { status: 'logout-pending' }
