import type { Handoff } from './AssistantChat';

/** What the support panel opens on when another part of the dashboard (the Help center) asks for it. */
export type SupportRequest = { tab: 'assistant' } | { tab: 'tickets' } | { tab: 'new'; handoff?: Handoff };

const EVENT = 'bilhanah:open-support';

/** Opens the support panel (mounted once with the layout) on the given screen. */
export function openSupport(request: SupportRequest) {
  window.dispatchEvent(new CustomEvent<SupportRequest>(EVENT, { detail: request }));
}

/** Calls `listener` whenever something asks for the support panel; returns the unsubscribe. */
export function onOpenSupport(listener: (request: SupportRequest) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<SupportRequest>).detail);
  window.addEventListener(EVENT, handle);
  return () => window.removeEventListener(EVENT, handle);
}
