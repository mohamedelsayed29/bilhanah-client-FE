import { useState } from 'react';

/**
 * Reads `#token=…` from email links once, then removes it from the address
 * bar so it doesn't linger in history or get shared by accident.
 */
export function useHashToken(): string | null {
  const [token] = useState(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (value) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return value;
  });
  return token;
}
