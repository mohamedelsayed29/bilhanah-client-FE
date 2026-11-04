/**
 * The link inside the restaurant's main QR code: the menu with `?src=qr`, so the menu
 * counts the visit as a scan. Table codes keep their own `?t=<code>` link.
 */
export function menuQrUrl(publicUrl: string): string {
  try {
    const url = new URL(publicUrl);
    url.searchParams.set('src', 'qr');
    return url.toString();
  } catch {
    return `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}src=qr`;
  }
}
