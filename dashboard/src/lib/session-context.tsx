import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthUser, LoginRequest, SessionResponse } from '@bilhanah/contracts';
import { api, onSessionEnded, refreshSession, setAccessToken } from './api-client';
import { hasLanguagePreference, setLanguage } from './i18n';
import { SESSION_ROUTES } from './config';

type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: AuthUser };

type SessionValue = {
  session: SessionState;
  login: (credentials: LoginRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  const authenticate = useCallback((response: SessionResponse) => {
    setAccessToken(response.accessToken);
    // Use the account's language unless the person picked one in this browser.
    if (!hasLanguagePreference()) setLanguage(response.user.preferredLanguage, { remember: false });
    setSession({ status: 'authenticated', user: response.user });
    return response.user;
  }, []);

  const endSession = useCallback(() => {
    setAccessToken(null);
    queryClient.clear();
    setSession({ status: 'anonymous' });
  }, [queryClient]);

  // Restore the session from the refresh cookie on load.
  useEffect(() => {
    let active = true;
    refreshSession()
      .then((response) => {
        if (!active) return;
        if (response) authenticate(response);
        else setSession({ status: 'anonymous' });
      })
      .catch(() => active && setSession({ status: 'anonymous' }));
    return () => {
      active = false;
    };
  }, [authenticate]);

  useEffect(() => onSessionEnded(endSession), [endSession]);

  const login = useCallback(
    async (credentials: LoginRequest) =>
      authenticate(
        await api<SessionResponse>('/v1/auth/login', { method: 'POST', body: credentials, authenticated: false }),
      ),
    [authenticate],
  );

  const logout = useCallback(async () => {
    try {
      await api(SESSION_ROUTES.logout, { method: 'POST', authenticated: false });
    } finally {
      endSession();
    }
  }, [endSession]);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider is required');
  return context;
}

export function useCurrentUser(): AuthUser {
  const { session } = useSession();
  if (session.status !== 'authenticated') throw new Error('useCurrentUser requires an authenticated session');
  return session.user;
}
