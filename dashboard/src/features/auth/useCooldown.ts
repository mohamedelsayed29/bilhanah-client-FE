import { useEffect, useState } from 'react';

/** Seconds left before an action (e.g. resending an email) may run again. */
export function useCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until, now]);
  return { secondsLeft: Math.max(0, Math.ceil((until - now) / 1000)), start: (seconds: number) => { setNow(Date.now()); setUntil(Date.now() + seconds * 1000); } };
}
