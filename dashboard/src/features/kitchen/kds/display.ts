import { useCallback, useEffect, useState } from 'react';

export type KdsTheme = 'dark' | 'light';
const THEME_KEY = 'bilhanah:kds-theme:v1';

/** The screen's colours: dark by default (less glare in a kitchen), light for bright rooms. Per device. */
export function useKdsTheme(): [KdsTheme, (theme: KdsTheme) => void] {
  const [theme, setThemeState] = useState<KdsTheme>(() => {
    try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  });
  const setTheme = useCallback((next: KdsTheme) => {
    setThemeState(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Storage is optional. */ }
  }, []);
  return [theme, setTheme];
}

/** Full screen for wall-mounted displays; follows Esc and the browser's own controls. */
export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const supported = typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function';
  const [active, setActive] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  useEffect(() => {
    const sync = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);
  return { supported, active, toggle };
}

/** Keeps a kitchen tablet's screen from sleeping while the display is open (where the browser allows it). */
export function useWakeLock(): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      try { lock = await navigator.wakeLock.request('screen'); } catch { /* Refused (battery saver, no gesture yet): the screen may sleep. */ }
    };
    void request();
    // The lock is released whenever the tab is hidden; take it again on return.
    const again = () => void request();
    document.addEventListener('visibilitychange', again);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', again);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

/** The time of day, updated each minute boundary (the bar's wall clock). */
export function useWallClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}
