import { useEffect, useState, useSyncExternalStore } from 'react';
import type { PublicLoyaltyProgram } from '@bilhanah/contracts';
import { fetchProgram } from './loyalty-api';

// The member card (a signed pass) is kept per restaurant in this browser. Storage can be full,
// disabled or cleared: the card is then simply gone, and the restaurant can issue a new one.

const key = (subdomain: string) => `bilhanah:loyalty:v1:${subdomain}`;
const listeners = new Set<() => void>();
const PASS_PATTERN = /^[A-Za-z0-9_-]{10,40}\.\d{1,9}\.[A-Za-z0-9_-]{10,40}$/;

export const isPass = (value: unknown): value is string => typeof value === 'string' && PASS_PATTERN.test(value);

export function loadPass(subdomain: string): string | null {
  try {
    const value = localStorage.getItem(key(subdomain));
    return isPass(value) ? value : null;
  } catch { return null; }
}

export function savePass(subdomain: string, pass: string | null) {
  try {
    if (pass) localStorage.setItem(key(subdomain), pass);
    else localStorage.removeItem(key(subdomain));
  } catch { /* Storage is optional. */ }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };

/** The member card for this restaurant, updated when it is saved or forgotten anywhere on the page. */
export function usePass(subdomain: string): string | null {
  return useSyncExternalStore(subscribe, () => loadPass(subdomain), () => null);
}

/**
 * A card link from the restaurant: `/loyalty#card=<pass>`. Saves the card, takes it out of the address
 * bar (so it is not shared by accident), and says whether the loyalty page should open.
 */
export function takeCardFromAddress(subdomain: string): { open: boolean } {
  const onPage = location.pathname.replace(/\/$/, '') === '/loyalty';
  const match = /(?:^#|&)card=([^&]+)/.exec(location.hash);
  let card: string | null = null;
  try { card = match ? decodeURIComponent(match[1]!) : null; } catch { card = null; }
  if (card && isPass(card)) savePass(subdomain, card);
  if (onPage || match) history.replaceState(history.state, '', `/${location.search}`);
  return { open: onPage || Boolean(match) };
}

// The program, fetched once per page.
const programs = new Map<string, Promise<PublicLoyaltyProgram>>();

export function loadProgram(subdomain: string): Promise<PublicLoyaltyProgram> {
  let pending = programs.get(subdomain);
  if (!pending) {
    pending = fetchProgram(subdomain).catch(() => ({ enabled: false } as const));
    programs.set(subdomain, pending);
  }
  return pending;
}

/** The running program, or null while loading and when the restaurant has none. */
export function useProgram(subdomain: string) {
  const [program, setProgram] = useState<Extract<PublicLoyaltyProgram, { enabled: true }> | null>(null);
  useEffect(() => {
    let alive = true;
    void loadProgram(subdomain).then(result => { if (alive) setProgram(result.enabled ? result : null); });
    return () => { alive = false; };
  }, [subdomain]);
  return program;
}
