import type { BRANCH_ERROR_CODES, PublicMenuResponse } from '@bilhanah/contracts';
import { API_URL } from '../../lib/config';

export type MenuResult = { status: 'not-found' } | { status: 'branch-not-found' } | { status: 'ready'; menu: PublicMenuResponse };

/**
 * Loads the restaurant and its menu as `branch` serves it (its prices, sold-out dishes, hours and
 * ordering); the main branch without one. An unknown or archived branch is `branch-not-found`, an
 * unknown restaurant `not-found`. Throws on network or server errors so the page can offer a retry.
 */
export async function fetchPublicMenu(subdomain: string, branch: string | null, signal: AbortSignal): Promise<MenuResult> {
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  const response = await fetch(`${API_URL}/v1/public/restaurants/${encodeURIComponent(subdomain)}/menu${query}`, { signal });
  if (response.status === 404) {
    const body = await response.json().catch(() => null) as { error?: { code?: unknown } } | null;
    return { status: branch && body?.error?.code === ('BRANCH_NOT_FOUND' satisfies typeof BRANCH_ERROR_CODES.BRANCH_NOT_FOUND) ? 'branch-not-found' : 'not-found' };
  }
  if (!response.ok) throw new Error(`Menu request failed with ${response.status}`);
  return { status: 'ready', menu: await response.json() as PublicMenuResponse };
}
