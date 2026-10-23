/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** NestJS API origin, e.g. https://api.bilhanah.com. Required for production builds. */
  readonly VITE_API_URL?: string;
  /** Restaurants are served at {subdomain}.VITE_ROOT_DOMAIN. */
  readonly VITE_ROOT_DOMAIN?: string;
  /** Dashboard origin; the trial dialog links to its /register page. */
  readonly VITE_DASHBOARD_URL?: string;
  readonly VITE_CONTACT_EMAIL?: string;
  readonly VITE_CONTACT_WHATSAPP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
