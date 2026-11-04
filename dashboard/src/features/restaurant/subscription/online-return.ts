import type { OwnerPayment } from '@bilhanah/contracts';

/** How often the subscription page asks the API whether Paymob confirmed the payment. */
export const POLL_INTERVAL_MS = 3_000;
/** How long it keeps asking before saying it may take a moment. */
export const POLL_LIMIT_MS = 60_000;

/**
 * After Paymob sends the owner back (`/subscription?payment=<id>`):
 * - checking: still AWAITING_PAYMENT (or not listed yet) and within the wait;
 * - approved: Paymob confirmed it and the paid period exists;
 * - failed: Paymob declined it;
 * - replaced: cancelled because a newer online payment was started;
 * - slow: nothing final after the wait (the confirmation may still arrive).
 */
export type ReturnState =
  | { kind: 'checking' }
  | { kind: 'approved'; payment: OwnerPayment }
  | { kind: 'failed'; payment: OwnerPayment }
  | { kind: 'replaced'; payment: OwnerPayment }
  | { kind: 'slow'; payment: OwnerPayment | null };

export function returnState(payment: OwnerPayment | null | undefined, timedOut: boolean): ReturnState {
  switch (payment?.status) {
    case 'APPROVED':
      return { kind: 'approved', payment };
    case 'FAILED':
    case 'REJECTED':
      return { kind: 'failed', payment };
    case 'CANCELLED':
      return { kind: 'replaced', payment };
    default:
      // AWAITING_PAYMENT (or PENDING), or not in the list yet.
      return timedOut ? { kind: 'slow', payment: payment ?? null } : { kind: 'checking' };
  }
}

/** Keep polling only while the answer may still change soon. */
export const isPolling = (state: ReturnState) => state.kind === 'checking';

/** The payment Paymob returned the owner for, from the address bar; anything that is not an id is ignored. */
export function returnedPaymentId(search: string | URLSearchParams): string | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const value = params.get('payment')?.trim() ?? '';
  return /^[\w-]{8,64}$/.test(value) ? value : null;
}

/** The checkout link from the API, only when it is a web address (never e.g. a `javascript:` URL). */
export function safeCheckoutUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
