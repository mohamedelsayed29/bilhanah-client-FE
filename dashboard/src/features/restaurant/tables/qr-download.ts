/** 1024 px PNG: about 8.7 cm at 300 dpi, sharp on table cards (same as the menu QR page). */
export const PNG_SIZE = 1024;

function save(href: string, filename: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** A standalone SVG document of an on-screen QR code, at print size. */
function svgSource(svg: SVGSVGElement, size: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(size));
  clone.setAttribute('height', String(size));
  clone.removeAttribute('aria-hidden');
  clone.removeAttribute('role');
  clone.removeAttribute('class');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

export function downloadSvg(svg: SVGSVGElement, filename: string) {
  save(URL.createObjectURL(new Blob([svgSource(svg, PNG_SIZE)], { type: 'image/svg+xml' })), `${filename}.svg`);
}

/** Draws the vector QR onto a canvas at PNG_SIZE, so the PNG is as sharp as the SVG. */
export function downloadPng(svg: SVGSVGElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgSource(svg, PNG_SIZE)], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = PNG_SIZE;
      canvas.height = PNG_SIZE;
      const context = canvas.getContext('2d');
      if (!context) { reject(new Error('Canvas is not available.')); return; }
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, PNG_SIZE, PNG_SIZE);
      context.drawImage(image, 0, 0, PNG_SIZE, PNG_SIZE);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Could not create the PNG.')); return; }
        save(URL.createObjectURL(blob), `${filename}.png`);
        resolve();
      }, 'image/png');
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not draw the QR code.')); };
    image.src = url;
  });
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
