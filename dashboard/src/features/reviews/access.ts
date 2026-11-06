import type { Permission, PlanFeatures } from '@bilhanah/contracts';

/** Every reviews permission (each may be granted to any staff role). */
export const REVIEW_PERMISSIONS = ['reviews.view', 'reviews.respond', 'reviews.moderate', 'reviews.settings'] as const satisfies readonly Permission[];
/** Any of these opens the section (the inbox and insights need view; settings their own permission). */
export const REVIEWS_SECTION: Permission[] = ['reviews.view', 'reviews.settings'];

export type ReviewsTabKey = 'inbox' | 'insights' | 'settings';

/** The section's pages in the order of the tabs; `need`: any one of them (the routes check the same). */
export const REVIEWS_TABS: { key: ReviewsTabKey; path: string; need: Permission[] }[] = [
  { key: 'inbox', path: '/reviews', need: ['reviews.view'] },
  { key: 'insights', path: '/reviews/insights', need: ['reviews.view'] },
  { key: 'settings', path: '/reviews/settings', need: ['reviews.settings'] },
];

type Can = (permission: Permission) => boolean;

export function visibleReviewTabs(can: Can) {
  return REVIEWS_TABS.filter(tab => tab.need.some(can));
}

/** Whether the section is offered at all: the plan includes reviews and the viewer holds a reviews permission. */
export function reviewsOffered(can: Can, features: Pick<PlanFeatures, 'reviews'> | null | undefined): boolean {
  return Boolean(features?.reviews) && REVIEWS_SECTION.some(can);
}

/** What the viewer may do, so screens show only those buttons (the API checks again). */
export function reviewActions(can: Can) {
  return {
    view: can('reviews.view'),
    /** Reply, follow diners up (with their contact phone), pick an assignee. */
    respond: can('reviews.respond'),
    /** Publish and hide. */
    moderate: can('reviews.moderate'),
    settings: can('reviews.settings'),
  };
}
export type ReviewActions = ReturnType<typeof reviewActions>;
