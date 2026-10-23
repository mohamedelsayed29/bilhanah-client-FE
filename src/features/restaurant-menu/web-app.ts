import { useEffect } from 'react';
import { API_URL } from '../../lib/config';

// What a phone needs to add a restaurant's page to its Home Screen as an app (iPhone Web Push only
// works from there). The manifest and icons come from the API, per restaurant; the marketing site
// never gets them.

/**
 * Points `<tag attribute>` in <head> at `value`, creating the tag if needed. The returned cleanup
 * puts back what was there before, or removes the tag it created.
 */
function headTag(tag: 'link' | 'meta', key: { name: 'rel' | 'name'; value: string }, attribute: 'href' | 'content', value: string): () => void {
  const existing = document.head.querySelector<HTMLElement>(`${tag}[${key.name}="${key.value}"]`);
  const element = existing ?? document.createElement(tag);
  const previous = existing?.getAttribute(attribute) ?? null;
  element.setAttribute(attribute, value);
  if (!existing) { element.setAttribute(key.name, key.value); document.head.append(element); }
  return () => {
    if (!existing) element.remove();
    else if (previous !== null) element.setAttribute(attribute, previous);
  };
}

const restaurantAsset = (subdomain: string, file: string) => `${API_URL}/v1/public/restaurants/${encodeURIComponent(subdomain)}/${file}`;

/**
 * The manifest and Home Screen icon. On a tracking page the manifest starts at that order, so an
 * iPhone that adds it to the Home Screen opens straight into the order.
 */
export function useWebAppLinks(subdomain: string, trackingToken: string | null) {
  useEffect(() => {
    const start = trackingToken ? `?${new URLSearchParams({ start: `/order/${encodeURIComponent(trackingToken)}` })}` : '';
    const cleanups = [
      headTag('link', { name: 'rel', value: 'manifest' }, 'href', restaurantAsset(subdomain, `manifest.webmanifest${start}`)),
      headTag('link', { name: 'rel', value: 'apple-touch-icon' }, 'href', restaurantAsset(subdomain, 'icon-180.png')),
      headTag('meta', { name: 'name', value: 'mobile-web-app-capable' }, 'content', 'yes'),
      headTag('meta', { name: 'name', value: 'apple-mobile-web-app-capable' }, 'content', 'yes'),
    ];
    return () => cleanups.forEach(cleanup => cleanup());
  }, [subdomain, trackingToken]);
}

/** The browser's bar in the restaurant's brand color, and its name under the Home Screen icon. */
export function useWebAppIdentity(name: string | null, brand: string) {
  useEffect(() => {
    const cleanups = [headTag('meta', { name: 'name', value: 'theme-color' }, 'content', brand)];
    if (name) cleanups.push(headTag('meta', { name: 'name', value: 'apple-mobile-web-app-title' }, 'content', name));
    return () => cleanups.forEach(cleanup => cleanup());
  }, [name, brand]);
}
