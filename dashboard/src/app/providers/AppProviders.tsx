import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { ApiError } from '../../lib/api';
import { LanguageProvider, useLanguage } from '../../lib/language';
import { sessionStore, useSession } from '../../lib/session';
import { SessionBootstrap } from './SessionBootstrap';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Client errors (4xx) will not fix themselves; network and server errors get two more tries.
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

/** Applies the account's preferred language unless the visitor already chose one on this device. */
function AccountLanguage() {
  const session = useSession();
  const { hasPreference, setLanguage } = useLanguage();
  const preferred = session.status === 'authenticated' ? session.user.preferredLanguage : null;
  useEffect(() => { if (preferred && !hasPreference) setLanguage(preferred); }, [preferred, hasPreference, setLanguage]);
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  // Nothing from one account may be shown to the next one signing in on this device.
  useEffect(() => sessionStore.subscribe(() => {
    if (sessionStore.getState().status === 'anonymous') queryClient.clear();
  }), [queryClient]);
  return <LanguageProvider>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AccountLanguage />
        <SessionBootstrap>{children}</SessionBootstrap>
      </ToastProvider>
    </QueryClientProvider>
  </LanguageProvider>;
}
