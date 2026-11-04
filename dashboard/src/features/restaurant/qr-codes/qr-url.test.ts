import { describe, expect, it } from 'vitest';
import { menuQrUrl } from './qr-url';

describe('menuQrUrl', () => {
  it('adds ?src=qr to the menu link', () => {
    expect(menuQrUrl('https://cafe.bilhanah.com')).toBe('https://cafe.bilhanah.com/?src=qr');
    expect(menuQrUrl('https://cafe.bilhanah.com/')).toBe('https://cafe.bilhanah.com/?src=qr');
    expect(menuQrUrl('http://127.0.0.1:5173/r/cafe')).toBe('http://127.0.0.1:5173/r/cafe?src=qr');
  });

  it('keeps other parameters and never adds src twice', () => {
    expect(menuQrUrl('https://cafe.bilhanah.com/?lang=en')).toBe('https://cafe.bilhanah.com/?lang=en&src=qr');
    expect(menuQrUrl('https://cafe.bilhanah.com/?src=link')).toBe('https://cafe.bilhanah.com/?src=qr');
  });

  it('falls back to appending for links URL cannot parse', () => {
    expect(menuQrUrl('cafe.bilhanah.com')).toBe('cafe.bilhanah.com?src=qr');
  });
});
