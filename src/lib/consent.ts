/**
 * The visitor's cookie and storage choices. Strictly necessary storage (this choice itself, sign-in and
 * security, and what a visitor saves on purpose, like a stand design) is always allowed; "preferences" (the remembered
 * language) and "analytics"
 * (none in use today — any tool added later must check it) need consent.
 * Kept in a first-party cookie, so it is sent with requests, and in localStorage as a fallback.
 */
export type ConsentCategory = 'preferences' | 'analytics';
export type Consent = { version: 1; preferences: boolean; analytics: boolean; decidedAt: string };

const COOKIE = 'bilhanah_consent';
const STORAGE = 'bilhanah:consent:v1';
export const CONSENT_CHANGED = 'bilhanah:consent-changed';
export const CONSENT_OPEN = 'bilhanah:consent-open';

function parse(raw: string | null | undefined): Consent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Consent>;
    return value.version === 1 ? { version: 1, preferences: !!value.preferences, analytics: !!value.analytics, decidedAt: String(value.decidedAt ?? '') } : null;
  } catch { return null; }
}

export function readConsent(): Consent | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie.split('; ').find(part => part.startsWith(`${COOKIE}=`));
  const fromCookie = cookie ? parse(decodeURIComponent(cookie.slice(COOKIE.length + 1))) : null;
  if (fromCookie) return fromCookie;
  try { return parse(localStorage.getItem(STORAGE)); } catch { return null; }
}

export function saveConsent(choice: { preferences: boolean; analytics: boolean }): Consent {
  const consent: Consent = { version: 1, ...choice, decidedAt: new Date().toISOString() };
  const value = encodeURIComponent(JSON.stringify(consent));
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=${value}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${secure}`;
  try { localStorage.setItem(STORAGE, JSON.stringify(consent)); } catch { /* The cookie is enough. */ }
  if (!choice.preferences) {
    // Withdrawing consent removes what was remembered under it.
    try { localStorage.removeItem('bilhanah:language:v1'); } catch { /* Storage is optional. */ }
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED, { detail: consent }));
  return consent;
}

export function hasConsent(category: ConsentCategory): boolean {
  return readConsent()?.[category] ?? false;
}

/** Opens the cookie settings (from the footer link). */
export function openConsentSettings() {
  window.dispatchEvent(new Event(CONSENT_OPEN));
}
