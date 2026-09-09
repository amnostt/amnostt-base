import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { ApiError } from '../../../core/http/api-client';
import type { ApiResponse } from '../../../core/http/api-client';
import type { AuthRepository } from '../domain/auth-repository';
import type {
  CurrentUser,
  LoginInput,
  RegisterInput,
  SessionState,
} from '../domain/auth-models';
import type { SessionStore } from './session-state';

type Requester = <T>(path: string, init?: RequestInit) => Promise<T>;
type ResponseRequester = <T>(
  path: string,
  init?: RequestInit,
) => Promise<ApiResponse<T>>;

export type SessionStoreApi = StoreApi<SessionStore>;

export function createSessionStore(
  auth: AuthRepository,
  request: Requester = defaultRequest,
  requestResponse: ResponseRequester = defaultRequestResponse,
): SessionStoreApi {
  let token: string | undefined;
  let currentUser: CurrentUser | undefined;
  let epoch = 0;
  let bootstrapPromise: Promise<void> | undefined;
  let refreshPromise: Promise<string> | undefined;

  return createStore<SessionStore>((set, get) => {
    const publish = (snapshot: SessionState) => set({ snapshot });
    const clearSession = (notice?: 'session-expired') => {
      token = undefined;
      currentUser = undefined;
      epoch += 1;
      publish(
        notice
          ? { status: 'unauthenticated', notice }
          : { status: 'unauthenticated' },
      );
    };

    const bootstrap = (): Promise<void> => {
      if (bootstrapPromise) return bootstrapPromise;
      const startEpoch = epoch;
      bootstrapPromise = auth
        .restore()
        .then((session) => {
          if (startEpoch !== epoch) return;
          token = session.accessToken;
          currentUser = session.currentUser;
          publish({ status: 'authenticated', user: session.currentUser });
        })
        .catch(() => {
          if (startEpoch === epoch) clearSession();
        })
        .finally(() => {
          bootstrapPromise = undefined;
        });
      return bootstrapPromise;
    };

    const login = async (input: LoginInput) => {
      if (
        get().snapshot.status === 'login-submitting' ||
        get().snapshot.status === 'register-submitting' ||
        get().snapshot.status === 'logout-pending'
      )
        return;
      const loginEpoch = ++epoch;
      publish({ status: 'login-submitting', email: input.email });
      try {
        const session = await auth.login(input);
        if (loginEpoch !== epoch) return;
        token = session.accessToken;
        currentUser = session.currentUser;
        publish({ status: 'authenticated', user: session.currentUser });
      } catch {
        if (loginEpoch === epoch) publish({ status: 'unauthenticated' });
        throw new ApiError(0);
      }
    };

    const register = async (input: RegisterInput) => {
      if (
        get().snapshot.status === 'login-submitting' ||
        get().snapshot.status === 'register-submitting' ||
        get().snapshot.status === 'logout-pending'
      )
        return;
      const registerEpoch = ++epoch;
      publish({ status: 'register-submitting', email: input.email });
      try {
        const session = await auth.register(input);
        if (registerEpoch !== epoch) return;
        token = session.accessToken;
        currentUser = session.currentUser;
        publish({ status: 'authenticated', user: session.currentUser });
      } catch (error) {
        if (registerEpoch === epoch) publish({ status: 'unauthenticated' });
        if (error instanceof ApiError) throw error;
        throw new ApiError(0);
      }
    };

    const logout = async () => {
      if (get().snapshot.status === 'logout-pending') return;
      publish({ status: 'logout-pending' });
      token = undefined;
      currentUser = undefined;
      epoch += 1;
      refreshPromise = undefined;
      try {
        await auth.logout();
      } catch {
        // Local cleanup is authoritative.
      }
      publish({ status: 'unauthenticated' });
    };

    const refresh = async (
      sentToken: string,
      sentEpoch = epoch,
    ): Promise<string> => {
      if (sentEpoch !== epoch) return token ?? '';
      if (token !== sentToken || !sentToken) return token ?? '';
      if (!refreshPromise) {
        const refreshEpoch = epoch;
        publish({ status: 'request-refreshing' });
        const promise = auth
          .refresh()
          .then((accessToken) => {
            if (refreshEpoch !== epoch || token !== sentToken)
              return token ?? '';
            token = accessToken;
            if (currentUser)
              publish({ status: 'authenticated', user: currentUser });
            return accessToken;
          })
          .catch((error) => {
            if (refreshEpoch === epoch) clearSession('session-expired');
            throw error;
          });
        const coordinated = promise.finally(() => {
          if (refreshPromise === coordinated) refreshPromise = undefined;
        });
        refreshPromise = coordinated;
      }
      return refreshPromise;
    };

    const requestWithRefresh = async <T>(
      requester: Requester,
      path: string,
      init: RequestInit = {},
    ): Promise<T> => {
      const sentToken = token;
      const sentEpoch = epoch;
      const send = (value: string | undefined): Promise<T> =>
        requester<T>(path, {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init.headers)),
            ...(value ? { Authorization: `Bearer ${value}` } : {}),
          },
        });
      try {
        return await send(sentToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401 || !sentToken)
          throw error;
        await refresh(sentToken, sentEpoch);
        if (!token) throw error;
        return send(token);
      }
    };

    const requestData = <T>(path: string, init?: RequestInit) =>
      requestWithRefresh<T>(request, path, init);
    const requestEnvelope = <T>(path: string, init?: RequestInit) =>
      requestWithRefresh(requestResponse as Requester, path, init) as Promise<
        ApiResponse<T>
      >;

    return {
      snapshot: { status: 'bootstrap-loading' },
      bootstrap,
      login,
      register,
      logout,
      request: requestData,
      requestResponse: requestEnvelope,
    };
  });
}

const defaultRequest: Requester = async <T>(
  path: string,
  init?: RequestInit,
) => {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) throw new ApiError(response.status);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

const defaultRequestResponse: ResponseRequester = async <T>(
  path: string,
  init?: RequestInit,
) => {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) throw new ApiError(response.status);
  if (response.status === 204) return { data: undefined as T };
  return response.json() as Promise<ApiResponse<T>>;
};
