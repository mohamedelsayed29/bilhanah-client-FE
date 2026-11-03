import type { RecommendationEventKind, RecommendationPlacement } from '@bilhanah/contracts';
import { API_URL } from '../../lib/config';

type Event = { ruleId: string; itemId: string; kind: RecommendationEventKind; placement: RecommendationPlacement };
const BATCH = 50;
const FLUSH_MS = 3_000;

/**
 * Counts what diners see, open and add from suggestions, for the restaurant's report. Events are
 * batched and sent in the background (also when the page is hidden); an impression counts once
 * per suggestion and place per visit. Failures are dropped: tracking never gets in the way.
 */
export function createTracker(subdomain: string, branch: string | null) {
  let queue: Event[] = [];
  let timer: number | null = null;
  const seen = new Set<string>();
  const flush = () => {
    if (timer !== null) { window.clearTimeout(timer); timer = null; }
    while (queue.length) {
      const events = queue.splice(0, BATCH);
      void fetch(`${API_URL}/v1/public/restaurants/${encodeURIComponent(subdomain)}/recommendation-events`, {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(branch && { branch }), events }),
      }).catch(() => undefined);
    }
  };
  const push = (event: Event) => {
    queue.push(event);
    if (queue.length >= BATCH) flush();
    else if (timer === null) timer = window.setTimeout(flush, FLUSH_MS);
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  return {
    impression(ruleId: string, itemId: string, placement: RecommendationPlacement) {
      const key = `${ruleId}:${itemId}:${placement}`;
      if (seen.has(key)) return;
      seen.add(key);
      push({ ruleId, itemId, kind: 'IMPRESSION', placement });
    },
    click: (ruleId: string, itemId: string, placement: RecommendationPlacement) => push({ ruleId, itemId, kind: 'CLICK', placement }),
    add: (ruleId: string, itemId: string, placement: RecommendationPlacement) => push({ ruleId, itemId, kind: 'ADD', placement }),
  };
}

export type Tracker = ReturnType<typeof createTracker>;
