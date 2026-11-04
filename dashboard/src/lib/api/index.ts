import { API_URL } from '../config';
import { sessionStore } from '../session';
import { createApiClient } from './client';
import { browserLocks } from './single-flight';

export { ApiError, CLIENT_ERROR_CODES, isApiError } from './api-error';
export type { ValidationIssue } from './api-error';

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('bilhanah:auth');

/** The dashboard's single API client: one session, one shared refresh. */
export const apiClient = createApiClient({ baseUrl: API_URL, store: sessionStore, locks: browserLocks(), channel });
