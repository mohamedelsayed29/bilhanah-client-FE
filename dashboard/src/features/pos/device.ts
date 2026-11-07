// The POS device this browser is registered as (docs/POS.md, task 5). The key is shown once when the
// device is registered and kept here; the terminal sends it with orders and payments.

const KEY = 'bilhanah:pos:device:v1';
export type StoredDevice = { id: string; name: string; key: string };

export function loadDevice(): StoredDevice | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as StoredDevice | null;
    return value && typeof value.key === 'string' && value.key.startsWith('posd_') ? value : null;
  } catch { return null; }
}

export function saveDevice(device: StoredDevice | null) {
  try {
    if (device) localStorage.setItem(KEY, JSON.stringify(device));
    else localStorage.removeItem(KEY);
  } catch { /* Storage is optional: the terminal then works without a device. */ }
}

/** A key for one checkout or payment, reused on retries so nothing is placed or paid twice. */
export const newKey = (prefix: string) => `${prefix}-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`.slice(0, 64);
