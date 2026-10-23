import type { PublicMenuResponse } from '@bilhanah/contracts';
import { API_URL } from '../../lib/config';

export type MenuResult = { status: 'not-found' } | { status: 'ready'; menu: PublicMenuResponse };

/** Loads the restaurant and its menu. Throws on network or server errors so the page can offer a retry. */
export async function fetchPublicMenu(subdomain: string, signal: AbortSignal): Promise<MenuResult> {
  const response = await fetch(`${API_URL}/v1/public/restaurants/${encodeURIComponent(subdomain)}/menu`, { signal });
  if (response.status === 404) return { status: 'not-found' };
  if (!response.ok) throw new Error(`Menu request failed with ${response.status}`);
  return { status: 'ready', menu: await response.json() as PublicMenuResponse };
}
