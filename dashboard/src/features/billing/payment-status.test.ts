import { describe, expect, it } from 'vitest';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '@bilhanah/contracts';
import { isOnlinePayment, isReviewable, methodName, paymentStatusLabel } from './payment-status';

const ar = (arabic: string) => arabic;
const en = (_: string, english: string) => english;

describe('isReviewable', () => {
  it('only offers approve/reject for pending transfers', () => {
    expect(isReviewable({ status: 'PENDING', method: 'INSTAPAY' })).toBe(true);
    expect(isReviewable({ status: 'PENDING', method: 'BANK_TRANSFER' })).toBe(true);
    expect(isReviewable({ status: 'PENDING', method: 'PAYMOB' })).toBe(false);
    for (const status of PAYMENT_STATUSES.filter(entry => entry !== 'PENDING')) {
      expect(isReviewable({ status, method: 'VODAFONE_CASH' })).toBe(false);
      expect(isReviewable({ status, method: 'PAYMOB' })).toBe(false);
    }
  });

  it('knows online payments', () => {
    expect(isOnlinePayment({ method: 'PAYMOB' })).toBe(true);
    expect(isOnlinePayment({ method: 'INSTAPAY' })).toBe(false);
  });
});

describe('labels', () => {
  it('names every method and status in both languages', () => {
    for (const method of PAYMENT_METHODS) {
      expect(methodName(method, ar)).not.toBe('');
      expect(methodName(method, en)).not.toBe('');
    }
    for (const status of PAYMENT_STATUSES) {
      expect(paymentStatusLabel(status, ar)).toMatch(/[؀-ۿ]/);
      expect(paymentStatusLabel(status, en)).toMatch(/^[A-Z]/);
    }
  });

  it('labels the new online statuses', () => {
    expect(paymentStatusLabel('AWAITING_PAYMENT', en)).toBe('Awaiting payment');
    expect(paymentStatusLabel('FAILED', en)).toBe('Payment failed');
    expect(methodName('PAYMOB', en)).toBe('Online (card or wallet)');
  });

  it('says a transfer was withdrawn but an online payment was cancelled', () => {
    expect(paymentStatusLabel('CANCELLED', en, 'INSTAPAY')).toBe('Withdrawn');
    expect(paymentStatusLabel('CANCELLED', en, 'PAYMOB')).toBe('Cancelled');
    expect(paymentStatusLabel('CANCELLED', ar, 'PAYMOB')).toBe('اتلغى');
  });
});
