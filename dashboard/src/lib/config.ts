/** NestJS API origin. */
export const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

/** Shown in the onboarding preview as `{subdomain}.{MENU_DOMAIN}`; the real link comes from the API (`publicUrl`). */
export const MENU_DOMAIN = import.meta.env.VITE_MENU_DOMAIN || 'bilhanah.com';

/** Marketing site, linked from the sign-in pages. */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:5180' : 'https://bilhanah.com')).replace(/\/$/, '');

/** The session routes of the restaurants' dashboard (the admin console has its own, in bilhanah-dashboard-FE). */
export const SESSION_ROUTES = { refresh: '/v1/auth/refresh', logout: '/v1/auth/logout' };

/** The admin console (bilhanah-dashboard-FE), linked from nowhere here (it is for Bilhanah's own team). */
export const ADMIN_APP_URL = (import.meta.env.VITE_ADMIN_URL || 'http://127.0.0.1:5175').replace(/\/$/, '');
