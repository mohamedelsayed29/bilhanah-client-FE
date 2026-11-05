import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowClockwiseIcon, WifiSlashIcon } from '@phosphor-icons/react';
import { Button } from '../../components/Button';
import { apiClient } from '../../lib/api';
import { useLanguage } from '../../lib/language';
import { mayHaveSession, sessionStore, shouldSkipRefresh } from '../../lib/session';

let startup: Promise<boolean> | null = null;
/** Restores the session from the refresh cookie once per page load (StrictMode-safe). */
function restoreSession(force = false): Promise<boolean> {
  if (!startup || force) {
    if (shouldSkipRefresh(window.location.pathname, mayHaveSession())) {
      sessionStore.clear('signed-out');
      startup = Promise.resolve(false);
    } else {
      startup = apiClient.refreshSession();
    }
  }
  return startup;
}

export function Splash() {
  const { text } = useLanguage();
  return <div className="splash" role="status" aria-label={text('جاري التحميل', 'Loading')}>
    <div className="splash-inner"><img className="splash-mark" src="/brand/bilhanah-mark.svg" alt="" width="327" height="336" /></div>
  </div>;
}

/** Waits for the startup refresh; offers a retry when the API cannot be reached. */
export function SessionBootstrap({ children }: { children: ReactNode }) {
  const { text } = useLanguage();
  const [state, setState] = useState<'pending' | 'ready' | 'failed'>('pending');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    restoreSession(attempt > 0)
      .then(() => { if (active) setState('ready'); })
      .catch(() => {
        // An unreachable API leaves the session unknown; let the visitor retry.
        if (!active) return;
        if (sessionStore.getState().status === 'loading') setState('failed');
        else setState('ready');
      });
    return () => { active = false; };
  }, [attempt]);
  if (state === 'ready') return children;
  if (state === 'pending') return <Splash />;
  return <main className="state-page">
    <div className="state-card">
      <span className="empty-state-icon" aria-hidden="true"><WifiSlashIcon size={30} /></span>
      <h1>{text('مش قادرين نوصل لبالهنا', 'We can’t reach Bilhanah')}</h1>
      <p>{text('اتأكد من اتصالك بالإنترنت وجرّب تاني.', 'Check your internet connection and try again.')}</p>
      <div className="form-actions"><Button onClick={() => { setState('pending'); setAttempt(value => value + 1); }} icon={<ArrowClockwiseIcon size={18} />}>{text('حاول تاني', 'Try again')}</Button></div>
    </div>
  </main>;
}
