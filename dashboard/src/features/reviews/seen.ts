import { useCallback, useSyncExternalStore } from 'react';

/**
 * "New" reviews: those that arrived since this account last opened the inbox on this device.
 * The moment is kept in localStorage (per account), so the badge survives reloads and every open
 * tab follows. Before the first visit, the last week's reviews count as new.
 */
export const FIRST_VISIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const EVENT = 'bilhanah:reviews-seen';

export const seenKey = (userId: string) => `bilhanah:reviews-seen:v1:${userId}`;

export function readSeen(key: string): string | null {
  try {
    const value = localStorage.getItem(key);
    return value && !Number.isNaN(Date.parse(value)) ? value : null;
  } catch { return null; }
}

export function writeSeen(key: string, at: string) {
  try { localStorage.setItem(key, at); } catch { /* Storage is optional: the badge then counts from the first-visit window. */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

/** Reviews created after `seenAt` (or within the first-visit window when there is none). */
export function countNew(items: readonly { createdAt: string }[], seenAt: string | null, now = Date.now()): number {
  const since = seenAt ? Date.parse(seenAt) : now - FIRST_VISIT_WINDOW_MS;
  return items.filter(item => Date.parse(item.createdAt) > since).length;
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(EVENT, callback);
  };
}

/** When the account last looked at the inbox here, and a way to say it just did. */
export function useReviewsSeen(userId: string) {
  const key = seenKey(userId);
  const seenAt = useSyncExternalStore(subscribe, () => readSeen(key), () => null);
  const markSeen = useCallback((at: string = new Date().toISOString()) => {
    const current = readSeen(key);
    if (!current || Date.parse(at) > Date.parse(current)) writeSeen(key, at);
  }, [key]);
  return { seenAt, markSeen };
}
