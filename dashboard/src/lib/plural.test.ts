import { describe, expect, it } from 'vitest';
import { countText, NOUNS } from './plural';

const arabicDigits = (value: number) => new Intl.NumberFormat('ar-EG').format(value);
const latinDigits = (value: number) => String(value);
const ar = (value: number, noun: keyof typeof NOUNS) => countText('ar', value, NOUNS[noun][0], NOUNS[noun][1], arabicDigits).replace(/\u00a0/g, ' ');
const en = (value: number, noun: keyof typeof NOUNS) => countText('en', value, NOUNS[noun][0], NOUNS[noun][1], latinDigits).replace(/\u00a0/g, ' ');

describe('counted nouns', () => {
  it('uses the Arabic singular, dual, plural and counted singular', () => {
    expect(ar(1, 'step')).toBe('خطوة واحدة');
    expect(ar(2, 'step')).toBe('خطوتين');
    expect(ar(3, 'step')).toBe('٣ خطوات');
    expect(ar(10, 'day')).toBe('١٠ أيام');
    expect(ar(11, 'day')).toBe('١١ يوم');
    expect(ar(30, 'day')).toBe('٣٠ يوم');
    expect(ar(100, 'table')).toBe('١٠٠ طاولة');
    expect(ar(103, 'table')).toBe('١٠٣ طاولات');
  });

  it('never mixes Western digits into Arabic', () => {
    for (const value of [0, 1, 2, 5, 12, 250]) expect(ar(value, 'order')).not.toMatch(/[0-9]/);
  });

  it('has a zero form where one reads better', () => {
    expect(ar(0, 'order')).toBe('مفيش طلبات');
    expect(en(0, 'order')).toBe('No orders');
    expect(ar(0, 'day')).toBe('٠ يوم');
  });

  it('keeps the number with its noun', () => {
    expect(countText('ar', 30, NOUNS.day[0], NOUNS.day[1], arabicDigits)).toBe('٣٠\u00a0يوم');
  });

  it('uses English singular and plural', () => {
    expect(en(1, 'day')).toBe('1 day');
    expect(en(2, 'day')).toBe('2 days');
    expect(en(1, 'category')).toBe('1 category');
    expect(en(4, 'category')).toBe('4 categories');
  });
});
