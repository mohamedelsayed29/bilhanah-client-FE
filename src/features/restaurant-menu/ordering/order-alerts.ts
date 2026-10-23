import type { PublicOrder } from '@bilhanah/contracts';

// Order-ready alerts (the Full Experience plan): a chime and a buzz on the open tracking page, and
// Web Push through /sw.js so the diner hears about it with the page closed too.

/**
 * Called once when a tracked order turns READY while its page is open, on plans with ready alerts.
 * Pushed notifications are the service worker's job.
 */
export function announceOrderReady(_order: PublicOrder) {
  if (document.visibilityState !== 'visible') return;
  try { navigator.vibrate?.([180, 90, 180]); } catch { /* Not supported or not allowed. */ }
  playChime();
}

const audioContextClass = () => window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

/** Started inside a tap, so the chime may play later; Safari only allows sound that a tap unlocked. */
let unlockedAudio: AudioContext | null = null;

/** Call from a tap handler, before anything async. */
export function unlockAudio() {
  const AudioContextClass = audioContextClass();
  if (!AudioContextClass) return;
  try {
    unlockedAudio ??= new AudioContextClass();
    if (unlockedAudio.state !== 'running') void unlockedAudio.resume().catch(() => undefined);
    // Older Safari also wants a sound started within the tap: a silent one.
    const silence = unlockedAudio.createBufferSource();
    silence.buffer = unlockedAudio.createBuffer(1, 1, 22_050);
    silence.connect(unlockedAudio.destination);
    silence.start();
  } catch { /* Audio is a nicety. */ }
}

/** A soft two-note chime, synthesized so no audio file ships with the page. Browsers may block it without a tap. */
function playChime() {
  const AudioContextClass = audioContextClass();
  if (!AudioContextClass) return;
  try {
    const context = unlockedAudio ?? new AudioContextClass();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    const start = context.currentTime + 0.05;
    [659.25, 987.77].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + index * 0.18;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.65);
    });
    // The unlocked context stays open for the next order on this page.
    if (context !== unlockedAudio) window.setTimeout(() => void context.close(), 1200);
  } catch { /* Audio is a nicety. */ }
}

// --- Web Push ------------------------------------------------------------------

/** iPhone, or an iPad (which asks for desktop pages, so it says "Macintosh" but has a touch screen). */
function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/** The iOS version from "OS 17_4" (iPhone) or "Version/17.4" (iPad as a Mac); null if neither is there. */
function iosVersion(): [number, number] | null {
  const match = /OS (\d+)_(\d+)/.exec(navigator.userAgent) ?? /Version\/(\d+)\.(\d+)/.exec(navigator.userAgent);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

const isStandalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;

/**
 * `push`: this browser can subscribe. `home-screen`: an iPhone or iPad browser tab, where Web Push
 * only works once the site is added to the Home Screen (iOS 16.4+). `none`: sound and vibration only.
 */
export type PushSupport = 'push' | 'home-screen' | 'none';

export function pushSupport(): PushSupport {
  if (window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'push';
  const version = iosVersion();
  const hasWebPush = !version || version[0] > 16 || (version[0] === 16 && version[1] >= 4);
  return isIos() && !isStandalone() && hasWebPush ? 'home-screen' : 'none';
}

/** The VAPID key arrives base64url-encoded; subscribe() wants its bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

const sameBytes = (a: ArrayBuffer | null, b: Uint8Array) => !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((byte, index) => byte === b[index]);

/** Registers /sw.js and subscribes it to push with the API's key. Needs notification permission first. */
export async function subscribeToPush(publicKey: string): Promise<PushSubscription> {
  // updateViaCache 'none': the worker script is always checked against the server.
  await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  const registration = await navigator.serviceWorker.ready;
  const key = keyBytes(publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    if (sameBytes(existing.options.applicationServerKey, key)) return existing;
    // The server's key changed: an old subscription cannot be reused with the new one.
    await existing.unsubscribe();
  }
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

/** This browser's push subscription on this restaurant's site, if /sw.js was ever registered. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return await registration?.pushManager.getSubscription() ?? null;
}
