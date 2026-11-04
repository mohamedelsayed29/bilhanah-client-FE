import { useSyncExternalStore } from 'react';
import { SessionStore, type SessionState } from './session-store';

export { mayHaveSession, SessionStore, shouldSkipRefresh } from './session-store';
export type { SessionState } from './session-store';

export const sessionStore = new SessionStore();

export function useSession(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState);
}
