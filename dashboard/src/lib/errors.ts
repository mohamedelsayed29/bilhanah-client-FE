import type { TFunction } from 'i18next';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api-client';

const KNOWN_CODES = [
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_VERIFIED',
  'ACCOUNT_SUSPENDED',
  'INVALID_TOKEN',
  'RESTAURANT_ALREADY_EXISTS',
  'SUBDOMAIN_TAKEN',
  'RESTAURANT_SUSPENDED',
  'NETWORK_ERROR',
  'VALIDATION_FAILED',
] as const;

/** A translated, user-facing message for any thrown error. */
export function errorMessage(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiError)) return t('errors.generic');
  if (error.code === 'RATE_LIMITED') {
    const seconds = (error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 60;
    return t('errors.RATE_LIMITED', { minutes: Math.max(1, Math.ceil(seconds / 60)) });
  }
  const code = KNOWN_CODES.find((known) => known === error.code);
  return code ? t(`errors.${code}`) : t('errors.generic');
}

/**
 * Attaches server-side validation issues to their form fields.
 * Returns true when at least one field received an error.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  messageFor: (field: string, reason?: string) => string,
): boolean {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED' || !Array.isArray(error.details)) return false;
  let applied = false;
  for (const issue of error.details as { path?: string; reason?: string }[]) {
    if (!issue.path) continue;
    setError(issue.path as Path<T>, { type: 'server', message: messageFor(issue.path, issue.reason) });
    applied = true;
  }
  return applied;
}
