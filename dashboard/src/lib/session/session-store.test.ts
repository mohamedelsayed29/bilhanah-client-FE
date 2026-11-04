import { describe, expect, it } from 'vitest';
import { shouldSkipRefresh } from './session-store';

describe('startup refresh', () => {
  it('is skipped on signed-out pages when this browser has no session', () => {
    for (const path of ['/login', '/register', '/forgot-password', '/check-email', '/reset-password', '/verify-email', '/login/']) {
      expect(shouldSkipRefresh(path, false)).toBe(true);
    }
  });

  it('still runs after a sign-in, and on pages that need a session', () => {
    expect(shouldSkipRefresh('/login', true)).toBe(false);
    expect(shouldSkipRefresh('/', false)).toBe(false);
    expect(shouldSkipRefresh('/menu', false)).toBe(false);
    expect(shouldSkipRefresh('/admin', false)).toBe(false);
  });
});
