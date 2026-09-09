import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  Session,
} from './auth-models';

export interface AuthRepository {
  login(input: LoginInput): Promise<Session>;
  register(input: RegisterInput): Promise<Session>;
  restore(): Promise<Session>;
  refresh(): Promise<string>;
  changePassword(input: ChangePasswordInput): Promise<void>;
  logout(): Promise<void>;
}
