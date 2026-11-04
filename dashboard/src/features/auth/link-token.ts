let taken: { path: string; token: string } | null = null;

/**
 * Reads `#token=…` from an email link and removes it from the address bar, so it is
 * not kept in history. Repeated calls on the same page (React StrictMode) get the same token.
 */
export function takeLinkToken(): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (fromHash) {
    taken = { path: window.location.pathname, token: fromHash };
    history.replaceState(history.state, '', window.location.pathname + window.location.search);
    return fromHash;
  }
  return taken?.path === window.location.pathname ? taken.token : null;
}

const once = new Map<string, Promise<unknown>>();
/** Single-use tokens must be sent once, even when React runs effects twice in development. */
export function runOnce<T>(key: string, task: () => Promise<T>): Promise<T> {
  if (!once.has(key)) once.set(key, task());
  return once.get(key) as Promise<T>;
}
