import { describe, expect, it } from 'vitest';
import { MIN_MODULE_MM, moduleMm, pngPlan, QR_SIZES, scannableAt, sizeCm, withDpi } from './qr-download';
import { crc32, uniqueNames, zip } from './zip';

describe('table QR exports', () => {
  it('makes PNGs of whole pixels per module, close to 300 dpi, that print at the chosen size', () => {
    for (const { cm } of QR_SIZES) {
      for (const cells of [29, 33, 37, 41, 45]) {
        const plan = pngPlan(cells, cm);
        expect(plan.pixels % cells).toBe(0);
        expect(plan.pixels / plan.modulePx).toBe(cells);
        expect(plan.dpi).toBeGreaterThan(250);
        expect(plan.dpi).toBeLessThan(350);
        expect((plan.pixels / plan.dpi) * 2.54).toBeCloseTo(cm, 6);
      }
    }
    expect(pngPlan(37, 5)).toEqual({ pixels: 592, modulePx: 16, dpi: 592 / (5 / 2.54) });
  });

  it('keeps every offered size scannable for a table link, and refuses ones too small for a long code', () => {
    // A table link is about 45 characters: a 33-module code (version 4) with its quiet zone, 41 across.
    for (const { cm } of QR_SIZES) expect(scannableAt(41, cm)).toBe(true);
    expect(moduleMm(41, sizeCm('small'))).toBeGreaterThanOrEqual(MIN_MODULE_MM);
    expect(scannableAt(77, 3)).toBe(false);
    expect(scannableAt(77, 5)).toBe(true);
  });

  it('stores the print resolution in the PNG', () => {
    const png = new Uint8Array(8 + 25 + 12);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    const out = withDpi(png, 300);
    expect(out.length).toBe(png.length + 21);
    const view = new DataView(out.buffer);
    expect(new TextDecoder().decode(out.subarray(37, 41))).toBe('pHYs');
    expect(view.getUint32(41)).toBe(11811);
    expect(out[49]).toBe(1);
    expect(view.getUint32(50)).toBe(crc32(out.subarray(37, 50)));
  });

  it('writes a ZIP with one file per table, UTF-8 names and unique names', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(uniqueNames(['t-1.png', 't-2.png', 't-1.png'])).toEqual(['t-1.png', 't-2.png', 't-1-2.png']);
    const files = [{ name: 'طاولة-1.svg', data: new TextEncoder().encode('<svg/>') }, { name: 'b.png', data: new Uint8Array([1, 2, 3]) }];
    const archive = zip(files, new Date(2026, 10, 6, 12, 30));
    const view = new DataView(archive.buffer);
    const end = archive.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const central = view.getUint32(end + 16, true);
    expect(view.getUint32(central, true)).toBe(0x02014b50);
    expect(view.getUint16(central + 8, true) & 0x0800).toBe(0x0800);
    const nameLength = view.getUint16(26, true);
    expect(new TextDecoder().decode(archive.subarray(30, 30 + nameLength))).toBe('طاولة-1.svg');
    expect(new TextDecoder().decode(archive.subarray(30 + nameLength, 30 + nameLength + 6))).toBe('<svg/>');
    expect(view.getUint32(14, true)).toBe(crc32(files[0]!.data));
  });
});
