import type { AuthUser, SessionResponse } from '@bilhanah/contracts';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous'; reason?: 'signed-out' | 'expired' }
  | { status: 'authenticated'; accessToken: string; user: AuthUser };

/**
 * A non-secret hint that this browser signed in and has not signed out since. Without it there is
 * no refresh cookie worth trying, so signed-out pages skip the startup refresh (and its 401).
 */
const SIGNED_IN_HINT = 'bilhanah:signed-in:v1';

function writeHint(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_HINT, '1');
    else localStorage.removeItem(SIGNED_IN_HINT);
  } catch {
    // Storage is optional: without it the dashboard simply tries the refresh.
  }
}

/** False only when this browser is known to have no session (it never signed in, or signed out). */
export function mayHaveSession(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_HINT) === '1';
  } catch {
    return true;
  }
}

/** Pages for signed-out visitors and email links: none of them needs a session. */
const SIGNED_OUT_PAGES = new Set(['/login', '/register', '/forgot-password', '/check-email', '/reset-password', '/verify-email']);

/**
 * Whether the startup refresh can be skipped: on a signed-out page, in a browser that never signed in
 * (or signed out), there is no refresh cookie and asking for one would only log a 401.
 */
export function shouldSkipRefresh(pathname: string, hint: boolean): boolean {
  return !hint && SIGNED_OUT_PAGES.has(pathname.replace(/\/+$/, '') || '/');
}

/**
 * The signed-in session, kept in memory only. The access token is never written to
 * storage; after a reload the session is restored from the HttpOnly refresh cookie.
 */
export class SessionStore {
  private state: SessionState = { status: 'loading' };
  private readonly listeners = new Set<() => void>();

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  accessToken(): string | null {
    return this.state.status === 'authenticated' ? this.state.accessToken : null;
  }

  setSession(session: SessionResponse): void {
    writeHint(true);
    this.set({ status: 'authenticated', accessToken: session.accessToken, user: session.user });
  }

  updateUser(user: AuthUser): void {
    if (this.state.status === 'authenticated') this.set({ ...this.state, user });
  }

  clear(reason: 'signed-out' | 'expired' = 'signed-out'): void {
    writeHint(false);
    if (this.state.status === 'anonymous' && this.state.reason === reason) return;
    this.set({ status: 'anonymous', reason });
  }

  private set(state: SessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
