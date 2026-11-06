import { crc32, uniqueNames, zip } from './zip';

/**
 * Table QR exports. Every file comes from the same vector code (error correction M, a 4-module quiet zone,
 * near-black on white), so a PNG and an SVG of a table are the same code at the same printed size.
 */

/** Printed sizes of the code (its quiet zone included), in centimetres. */
export const QR_SIZES = [
  { key: 'small', cm: 3 },
  { key: 'medium', cm: 5 },
  { key: 'large', cm: 8 },
  { key: 'poster', cm: 15 },
] as const;
export type QrSizeKey = (typeof QR_SIZES)[number]['key'];
export const DEFAULT_QR_SIZE: QrSizeKey = 'medium';
export type QrFormat = 'png' | 'svg';

/** PNGs are made for 300 dpi printing, and say so in the file, so they print at their size. */
export const PRINT_DPI = 300;
/** Below half a millimetre per module, phone cameras start to miss codes at table distance. */
export const MIN_MODULE_MM = 0.5;
/** The quiet zone every exported code has (the QR standard's 4 modules). */
export const QR_MARGIN = 4;

export function sizeCm(key: QrSizeKey): number {
  return QR_SIZES.find((size) => size.key === key)?.cm ?? 5;
}

/** Modules across a code drawn by qrcode.react (its viewBox is one unit per module, quiet zone included). */
export function moduleCount(svg: SVGSVGElement): number {
  const box = svg.getAttribute('viewBox')?.trim().split(/\s+/).map(Number);
  return box && box.length === 4 && box[2]! > 0 ? box[2]! : 0;
}

export function moduleMm(cells: number, cm: number): number {
  return cells > 0 ? (cm * 10) / cells : 0;
}

/** Whether a code with `cells` modules still scans reliably when printed `cm` wide. */
export function scannableAt(cells: number, cm: number): boolean {
  return cells === 0 || moduleMm(cells, cm) >= MIN_MODULE_MM;
}

/**
 * The PNG for a printed width: a whole number of pixels per module (so every module is the same,
 * sharp square), as close as can be to 300 dpi, with the dpi stored so it prints exactly `cm` wide.
 */
export function pngPlan(cells: number, cm: number): { pixels: number; modulePx: number; dpi: number } {
  const target = (cm / 2.54) * PRINT_DPI;
  const modulePx = Math.max(1, Math.round(target / Math.max(1, cells)));
  const pixels = modulePx * Math.max(1, cells);
  return { pixels, modulePx, dpi: pixels / (cm / 2.54) };
}

/** A standalone SVG document of an on-screen code, `cm` wide when printed. */
export function svgDocument(svg: SVGSVGElement, cm: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const mm = String(Math.round(cm * 100) / 10);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', `${mm}mm`);
  clone.setAttribute('height', `${mm}mm`);
  clone.setAttribute('shape-rendering', 'crispEdges');
  for (const attribute of ['aria-hidden', 'role', 'class', 'style', 'data-qr-for']) clone.removeAttribute(attribute);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** Adds a pHYs chunk (pixels per metre) right after IHDR, so print software uses the intended size. */
export function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  const IHDR_END = 8 + 25;
  const perMetre = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, perMetre);
  view.setUint32(12, perMetre);
  chunk[16] = 1; // the unit is the metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, IHDR_END), 0);
  out.set(chunk, IHDR_END);
  out.set(png.subarray(IHDR_END), IHDR_END + chunk.length);
  return out;
}

/** Draws the vector code onto a canvas at whole pixels per module, without smoothing. */
export function pngBytes(svg: SVGSVGElement, cm: number): Promise<Uint8Array> {
  const { pixels, dpi } = pngPlan(moduleCount(svg), cm);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgDocument(svg, cm)], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = pixels;
      canvas.height = pixels;
      const context = canvas.getContext('2d');
      if (!context) { reject(new Error('Canvas is not available.')); return; }
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pixels, pixels);
      context.drawImage(image, 0, 0, pixels, pixels);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Could not create the PNG.')); return; }
        void blob.arrayBuffer().then((buffer) => resolve(withDpi(new Uint8Array(buffer), dpi)), reject);
      }, 'image/png');
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not draw the QR code.')); };
    image.src = url;
  });
}

function save(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function sized(filename: string, cm: number) {
  return `${filename}-${cm}cm`;
}

export function downloadSvg(svg: SVGSVGElement, filename: string, cm = sizeCm(DEFAULT_QR_SIZE)) {
  save(new Blob([svgDocument(svg, cm)], { type: 'image/svg+xml' }), `${sized(filename, cm)}.svg`);
}

export async function downloadPng(svg: SVGSVGElement, filename: string, cm = sizeCm(DEFAULT_QR_SIZE)): Promise<void> {
  const bytes = await pngBytes(svg, cm);
  save(new Blob([bytes as BlobPart], { type: 'image/png' }), `${sized(filename, cm)}.png`);
}

/** One ZIP with a file per code, in one format and size. */
export async function downloadZip(codes: { svg: SVGSVGElement; filename: string }[], format: QrFormat, cm: number, zipName: string): Promise<void> {
  const encoder = new TextEncoder();
  const names = uniqueNames(codes.map((code) => `${sized(code.filename, cm)}.${format}`));
  const entries = [];
  for (const [index, code] of codes.entries()) {
    const data = format === 'png' ? await pngBytes(code.svg, cm) : encoder.encode(svgDocument(code.svg, cm));
    entries.push({ name: names[index]!, data });
  }
  save(new Blob([zip(entries) as BlobPart], { type: 'application/zip' }), `${zipName}-${format}-${cm}cm.zip`);
}

/** "bilhanah-cafe" for the main branch, "bilhanah-cafe-nasr-city" for others (QR download names). */
export function tableFilePrefix(subdomain: string, branch: { slug: string; isMain: boolean } | null): string {
  return branch && !branch.isMain ? `${subdomain}-${branch.slug}` : subdomain;
}

/** "bilhanah-cafe-table-4" (letters of any script, digits and dashes). */
export function qrFilename(subdomain: string, label: string): string {
  const slug = label.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return `bilhanah-${subdomain}-${slug || 'table'}`;
}

/** "Table 1" … "Table 10", or "T-1" when the prefix ends in a symbol (the API's rule). */
export function rangeLabel(prefix: string, value: number): string {
  const trimmed = prefix.trim();
  if (!trimmed) return String(value);
  return /[\p{L}\p{N}]$/u.test(trimmed) ? `${trimmed} ${value}` : `${trimmed}${value}`;
}
