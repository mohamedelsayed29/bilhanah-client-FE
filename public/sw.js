// Order-ready alerts for restaurant pages: shows the notifications the API pushes (Web Push) and
// opens the order when one is tapped. Served as /sw.js on every restaurant subdomain; the tracking
// page registers it only when the diner turns alerts on.
// No fetch handler and no caching on purpose: pages always come from the network, so a deploy can
// never leave a diner on a stale app.

/** Shown when a push arrives without a readable payload: browsers require a notification for every push. */
const FALLBACK = {
  title: 'بالهنا · Bilhanah',
  body: 'في تحديث جديد على طلبك. · Your order has an update.',
  tag: 'bilhanah-order',
};
const ICON = '/brand/bilhanah-icon-192.png';
const BADGE = '/brand/notification-badge.png';
const ARABIC = /[؀-ۿ]/;

self.addEventListener('install', () => { void self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });

/** The OrderPushPayload, or null when it is missing or malformed. */
function readPayload(data) {
  try {
    const payload = data ? data.json() : null;
    return payload && typeof payload === 'object' && typeof payload.title === 'string' && payload.title ? payload : null;
  } catch {
    return null;
  }
}

/** Only web pages may be opened from a notification; anything else opens the restaurant's menu. */
function safeUrl(value) {
  try {
    const url = new URL(typeof value === 'string' ? value : '/', self.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : self.location.origin + '/';
  } catch {
    return self.location.origin + '/';
  }
}

self.addEventListener('push', event => {
  const payload = readPayload(event.data);
  const title = payload ? payload.title : FALLBACK.title;
  const body = payload && typeof payload.body === 'string' ? payload.body : FALLBACK.body;
  // The API writes the notification in the diner's language; the mixed fallback stays right to left.
  const arabic = ARABIC.test(title + body);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: payload && typeof payload.tag === 'string' && payload.tag ? payload.tag : FALLBACK.tag,
    // A newer status replaces the older one under the same tag, and should still be heard.
    renotify: true,
    icon: payload && typeof payload.icon === 'string' && payload.icon ? payload.icon : ICON,
    badge: BADGE,
    lang: arabic ? 'ar' : 'en',
    dir: arabic ? 'rtl' : 'ltr',
    vibrate: payload && payload.status === 'READY' ? [180, 90, 180] : [120],
    data: { url: safeUrl(payload && payload.url) },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  const withoutHash = href => href.split('#')[0];
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const open = windows.find(client => withoutHash(client.url) === withoutHash(url));
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
