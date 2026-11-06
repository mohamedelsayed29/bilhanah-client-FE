import {
  REVIEW_ELIGIBILITY,
  type COMMON_ERROR_CODES,
  type DinerReviewResult,
  type DinerReviewState,
  type FeedbackResult,
  type MEDIA_ACCEPTED_TYPES,
  type MEDIA_MAX_BYTES,
  type PublicReviewsPage,
  type REVIEW_ERROR_CODES,
  type ReviewPhotoUpload,
  type ReviewSubRating,
} from '@bilhanah/contracts';
import { ApiError, apiRequest } from '../../../lib/api';
import { API_URL } from '../../../lib/config';

// Reviews from the diner's side (docs/REVIEWS.md in the API). Values from contracts' reviews.ts and
// media.ts are copied because those modules build zod schemas at import time and the public menu
// must not ship zod; `satisfies` keeps them in step. review-display.ts is zod-free and imported as is.

export { ApiError };

export const REVIEW_CODES = {
  UNAVAILABLE: 'REVIEWS_UNAVAILABLE',
  NOT_ELIGIBLE: 'REVIEW_NOT_ELIGIBLE',
  EDIT_FORBIDDEN: 'REVIEW_EDIT_FORBIDDEN',
  COMMENT_REQUIRED: 'REVIEW_COMMENT_REQUIRED',
  DISH_NOT_IN_ORDER: 'REVIEW_DISH_NOT_IN_ORDER',
  RATING_NOT_ASKED: 'REVIEW_RATING_NOT_ASKED',
  TAG_UNKNOWN: 'REVIEW_TAG_UNKNOWN',
  PHOTO_NOT_FOUND: 'REVIEW_PHOTO_NOT_FOUND',
  PHOTOS_OFF: 'REVIEW_PHOTOS_OFF',
  PHOTO_LIMIT: 'REVIEW_PHOTO_LIMIT',
  CONTACT_CONSENT_REQUIRED: 'REVIEW_CONTACT_CONSENT_REQUIRED',
  FEEDBACK_UNAVAILABLE: 'REVIEW_FEEDBACK_UNAVAILABLE',
  NOT_PUBLIC: 'REVIEWS_NOT_PUBLIC',
} as const satisfies { [K in keyof typeof REVIEW_ERROR_CODES]?: (typeof REVIEW_ERROR_CODES)[K] };

export const VALIDATION_FAILED = 'VALIDATION_FAILED' satisfies typeof COMMON_ERROR_CODES.VALIDATION_FAILED;
export const RATE_LIMITED = 'RATE_LIMITED' satisfies typeof COMMON_ERROR_CODES.RATE_LIMITED;
export const PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE' satisfies typeof COMMON_ERROR_CODES.PAYLOAD_TOO_LARGE;

/** The photo route takes JPEG, PNG and WebP up to 5 MB (media.ts). */
export const PHOTO_MAX_BYTES: typeof MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const satisfies typeof MEDIA_ACCEPTED_TYPES;

const orderPath = (token: string) => `/v1/public/orders/${encodeURIComponent(token)}/review`;
const restaurantPath = (subdomain: string) => `/v1/public/restaurants/${encodeURIComponent(subdomain)}`;

/**
 * The order's review state, or null when the answer is not one (an API that predates reviews, or
 * anything unexpected): the page then simply does not ask.
 */
export async function fetchReviewState(token: string, signal?: AbortSignal): Promise<DinerReviewState | null> {
  const state = await apiRequest<Partial<DinerReviewState> | null>(orderPath(token), { signal, cache: 'no-store' });
  if (!state || !(REVIEW_ELIGIBILITY as readonly unknown[]).includes(state.eligibility)) return null;
  const open = state.eligibility === 'OPEN' || state.eligibility === 'EDITABLE';
  if (open && (!state.form || !Array.isArray(state.form.subRatings) || !Array.isArray(state.form.tags) || !Array.isArray(state.form.dishes))) return null;
  return { eligibility: state.eligibility!, form: open ? state.form! : null, review: state.review ?? null, editableUntil: state.editableUntil ?? null, outcome: state.outcome ?? null };
}

export type ReviewInput = {
  overall: number;
  ratings?: Partial<Record<ReviewSubRating, number>>;
  dishes?: { orderItemId: string; rating: number }[];
  tags?: string[];
  comment?: string | null;
  photoIds?: string[];
  name?: string | null;
  contactPhone?: string | null;
  contactConsent: boolean;
  language: 'ar' | 'en';
  editKey?: string;
};

/** Creates the order's review, or edits it within the edit window (with the same browser's key). */
export function submitReview(token: string, input: ReviewInput): Promise<DinerReviewResult> {
  return apiRequest<DinerReviewResult>(orderPath(token), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Where the diner sees their own (private) review photo. */
export const reviewPhotoUrl = (token: string, photoId: string) => `${API_URL}${orderPath(token)}/photos/${encodeURIComponent(photoId)}`;

/**
 * Uploads one review photo (multipart `file`), reporting progress from 0 to 1. XMLHttpRequest
 * rather than fetch: fetch cannot report upload progress. Errors arrive as ApiError, like apiRequest.
 */
export function uploadReviewPhoto(token: string, file: File, onProgress: (share: number) => void, signal?: AbortSignal): Promise<ReviewPhotoUpload> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_URL}${orderPath(token)}/photos`);
    request.responseType = 'text';
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    request.onload = () => {
      let body: unknown = null;
      try { body = request.responseText ? JSON.parse(request.responseText) as unknown : null; } catch { /* Not JSON. */ }
      if (request.status >= 200 && request.status < 300) {
        const photo = body as Partial<ReviewPhotoUpload> | null;
        if (photo && typeof photo.id === 'string') { onProgress(1); resolve(photo as ReviewPhotoUpload); }
        else reject(new ApiError(request.status, `HTTP_${request.status}`));
        return;
      }
      const error = (body as { error?: { code?: string; details?: unknown } } | null)?.error;
      reject(new ApiError(request.status, error?.code ?? (request.status === 413 ? PAYLOAD_TOO_LARGE : `HTTP_${request.status}`), error?.details));
    };
    request.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR'));
    request.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', () => request.abort(), { once: true });
    const form = new FormData();
    form.append('file', file);
    request.send(form);
  });
}

/** The restaurant's published reviews and their summary (of one branch, when given). */
export function fetchPublicReviews(subdomain: string, options: { branch?: string | null; page?: number; pageSize?: number }, signal?: AbortSignal): Promise<PublicReviewsPage> {
  const query = new URLSearchParams();
  if (options.branch) query.set('branch', options.branch);
  if (options.page && options.page > 1) query.set('page', String(options.page));
  if (options.pageSize) query.set('pageSize', String(options.pageSize));
  const search = query.toString();
  return apiRequest<PublicReviewsPage>(`${restaurantPath(subdomain)}/reviews${search ? `?${search}` : ''}`, { signal });
}

export type FeedbackInput = Omit<ReviewInput, 'dishes' | 'photoIds' | 'editKey'> & {
  branch?: string;
  tableCode?: string;
  /** Honeypot: people never see it, so they leave it empty. */
  website?: string;
};

/** Unverified feedback from the menu or a table (when the restaurant takes it). */
export function sendFeedback(subdomain: string, input: FeedbackInput): Promise<FeedbackResult> {
  return apiRequest<FeedbackResult>(`${restaurantPath(subdomain)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Only http(s) links leave the page (the API checks them too; this guards against anything else). */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch { return null; }
}

/** Phone numbers as the API accepts them: 7–15 digits, an optional +, spaces and dashes ignored. */
export function normalizePhone(value: string): string {
  return value.trim().replace(/[\s().-]/g, '');
}
export const isValidPhone = (value: string) => /^\+?\d{7,15}$/.test(normalizePhone(value));

/** A random key (URL-safe, 32 characters) that lets only this browser edit the review it wrote. */
export function newEditKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
