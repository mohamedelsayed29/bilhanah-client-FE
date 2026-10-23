import type { VisitSource } from '@bilhanah/contracts';
import { API_URL } from '../../lib/config';

/** Restaurants already counted in this page load (when sessionStorage is unavailable, this is all we have). */
const counted = new Set<string>();

/** How the diner got here: the restaurant's QR (?src=qr), a table QR (?t=code) or anything else. */
export function visitSource(search: string): VisitSource {
  const params = new URLSearchParams(search);
  // A table QR is the more specific source, even if it also carries src=qr.
  if (params.get('t')?.trim()) return 'table';
  return params.get('src') === 'qr' ? 'qr' : 'link';
}

/**
 * Counts one menu visit per restaurant per browser session. Fire-and-forget: never blocks the menu,
 * and failures are ignored (the server also deduplicates per visitor and day). Afterwards `src` leaves
 * the address bar, so a link copied from it later does not count as a QR scan; `t` is handled by the table code.
 */
export function recordVisit(subdomain: string) {
  if (counted.has(subdomain)) return;
  counted.add(subdomain);
  const source = visitSource(location.search);
  const key = `bilhanah:visit:v1:${subdomain}`;
  let seen = false;
  try {
    seen = sessionStorage.getItem(key) !== null;
    if (!seen) sessionStorage.setItem(key, source);
  } catch { /* Storage is optional; the page-load guard still applies. */ }

  const url = new URL(location.href);
  if (url.searchParams.has('src')) {
    url.searchParams.delete('src');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  if (seen) return;

  try {
    void fetch(`${API_URL}/v1/public/restaurants/${encodeURIComponent(subdomain)}/visits`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    }).catch(() => undefined);
  } catch { /* Counting is best-effort. */ }
}
