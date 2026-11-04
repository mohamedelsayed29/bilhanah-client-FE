import { describe, expect, it } from 'vitest';
import type { OwnerPayment, PaymentStatus } from '@bilhanah/contracts';
import { isPolling, returnedPaymentId, returnState, safeCheckoutUrl } from './online-return';

const payment = (status: PaymentStatus, period: OwnerPayment['period'] = null): OwnerPayment => ({
  id: 'b7a3c1d2-0000-4000-8000-000000000001', planCode: 'ORDERS', months: 3, amountPiastres: 150_000, method: 'PAYMOB', reference: 'PM-1',
  payerName: null, status, hasProof: false, rejectionReason: null, createdAt: '2026-10-23T09:00:00.000Z', reviewedAt: null, period,
});

describe('returnState', () => {
  it('keeps checking while the payment awaits Paymob or is not listed yet', () => {
    expect(returnState(payment('AWAITING_PAYMENT'), false)).toEqual({ kind: 'checking' });
    expect(returnState(undefined, false)).toEqual({ kind: 'checking' });
    expect(isPolling(returnState(payment('AWAITING_PAYMENT'), false))).toBe(true);
  });

  it('stops on approval with the new period', () => {
    const approved = payment('APPROVED', { startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z' });
    const state = returnState(approved, false);
    expect(state.kind).toBe('approved');
    expect(state.kind === 'approved' && state.payment.period?.endsAt).toBe('2027-02-01T00:00:00.000Z');
    expect(isPolling(state)).toBe(false);
  });

  it('stops on a declined payment', () => {
    expect(returnState(payment('FAILED'), false).kind).toBe('failed');
    expect(returnState(payment('REJECTED'), false).kind).toBe('failed');
  });

  it('reports a payment replaced by a newer one', () => {
    expect(returnState(payment('CANCELLED'), false).kind).toBe('replaced');
  });

  it('says it is slow after the wait, but a final answer still wins', () => {
    expect(returnState(payment('AWAITING_PAYMENT'), true)).toEqual({ kind: 'slow', payment: payment('AWAITING_PAYMENT') });
    expect(returnState(undefined, true)).toEqual({ kind: 'slow', payment: null });
    expect(returnState(payment('APPROVED'), true).kind).toBe('approved');
    expect(isPolling(returnState(undefined, true))).toBe(false);
  });
});

describe('returnedPaymentId', () => {
  it('reads the payment id among Paymob’s own parameters', () => {
    expect(returnedPaymentId('?payment=b7a3c1d2-0000-4000-8000-000000000001&success=true&id=123&hmac=abc')).toBe('b7a3c1d2-0000-4000-8000-000000000001');
  });

  it('ignores missing or malformed values', () => {
    expect(returnedPaymentId('')).toBeNull();
    expect(returnedPaymentId('?payment=')).toBeNull();
    expect(returnedPaymentId('?payment=%3Cscript%3E')).toBeNull();
  });
});

describe('safeCheckoutUrl', () => {
  it('accepts web addresses only', () => {
    expect(safeCheckoutUrl('https://accept.paymob.com/unifiedcheckout/?publicKey=x&clientSecret=y')).toBe('https://accept.paymob.com/unifiedcheckout/?publicKey=x&clientSecret=y');
    expect(safeCheckoutUrl('javascript:alert(1)')).toBeNull();
    expect(safeCheckoutUrl('not a url')).toBeNull();
  });
});
