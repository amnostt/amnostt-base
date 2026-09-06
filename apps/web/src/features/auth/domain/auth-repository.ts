import type { LoginInput, Session } from './auth-models'

export interface AuthRepository {
  login(input: LoginInput): Promise<Session>
  restore(): Promise<Session>
  refresh(): Promise<string>
  logout(): Promise<void>
}
