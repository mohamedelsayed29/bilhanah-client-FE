// Loyalty for diners (docs/LOYALTY.md in the backend). Types only from the contracts: the public
// menu must not ship zod.
import type { LoyaltyJoinResponse, LoyaltyMemberView, LoyaltyQuote, PublicLoyaltyProgram } from '@bilhanah/contracts';
import { apiRequest } from '../../lib/api';

export { ApiError } from '../../lib/api';

const base = (subdomain: string) => `/v1/public/restaurants/${encodeURIComponent(subdomain)}`;
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });

export type ActiveProgram = Extract<PublicLoyaltyProgram, { enabled: true }>;

export function fetchProgram(subdomain: string, signal?: AbortSignal): Promise<PublicLoyaltyProgram> {
  return apiRequest<PublicLoyaltyProgram>(`${base(subdomain)}/loyalty`, { signal, cache: 'no-store' });
}

/** The member's own page; the card travels in the body, never in the address. */
export function fetchMember(subdomain: string, pass: string, signal?: AbortSignal): Promise<LoyaltyMemberView> {
  return apiRequest<LoyaltyMemberView>(`${base(subdomain)}/loyalty/me`, { ...json({ pass }), signal });
}

export function joinProgram(subdomain: string, name: string, phone: string): Promise<LoyaltyJoinResponse> {
  return apiRequest<LoyaltyJoinResponse>(`${base(subdomain)}/loyalty/join`, json({ name, phone }));
}

export type QuoteInput = {
  type: 'DINE_IN' | 'PICKUP';
  tableCode?: string;
  branch?: string;
  items: { menuItemId: string; variantId: string; quantity: number }[];
  pass?: string;
  rewardId?: string;
};

/** The bill with a reward and the points the order will earn, priced by the server. */
export function fetchQuote(subdomain: string, input: QuoteInput, signal?: AbortSignal): Promise<LoyaltyQuote> {
  return apiRequest<LoyaltyQuote>(`${base(subdomain)}/orders/quote`, { ...json(input), signal });
}
