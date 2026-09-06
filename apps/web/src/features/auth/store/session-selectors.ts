import type { SessionStore } from './session-state'

export const selectSessionSnapshot = (state: SessionStore) => state.snapshot
export const selectBootstrap = (state: SessionStore) => state.bootstrap
export const selectLogin = (state: SessionStore) => state.login
export const selectLogout = (state: SessionStore) => state.logout
