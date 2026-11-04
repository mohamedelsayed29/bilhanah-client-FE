/** Error codes produced by the client itself (the API never sends these). */
export const CLIENT_ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ValidationIssue = { path: string; code: string; message: string; reason?: string };

/** The API's error envelope `{ error: { code, message, details?, requestId } }`, plus the HTTP status. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor(init: { status: number; code: string; message: string; details?: unknown; requestId?: string | null }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId ?? null;
  }

  /** Field problems of a 400 VALIDATION_FAILED. */
  get issues(): ValidationIssue[] {
    return Array.isArray(this.details) ? (this.details as ValidationIssue[]) : [];
  }

  /** Seconds to wait after 429 RATE_LIMITED, when the API said so. */
  get retryAfterSeconds(): number | null {
    const value = (this.details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
    return typeof value === 'number' ? value : null;
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/** Builds an ApiError from any response body; falls back gracefully when the body is not the envelope. */
export function toApiError(status: number, body: unknown, requestId: string | null): ApiError {
  const envelope = (body as { error?: { code?: unknown; message?: unknown; details?: unknown; requestId?: unknown } } | null)?.error;
  if (envelope && typeof envelope.code === 'string') {
    return new ApiError({
      status,
      code: envelope.code,
      message: typeof envelope.message === 'string' ? envelope.message : envelope.code,
      details: envelope.details,
      requestId: typeof envelope.requestId === 'string' ? envelope.requestId : requestId,
    });
  }
  return new ApiError({ status, code: CLIENT_ERROR_CODES.UNKNOWN_ERROR, message: `Request failed with status ${status}.`, requestId });
}
