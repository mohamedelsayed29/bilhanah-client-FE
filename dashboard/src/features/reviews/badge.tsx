import { useQuery } from '@tanstack/react-query';
import { REVIEW_ERROR_CODES } from '@bilhanah/contracts';
import { isApiError } from '../../lib/api';
import { reviewsApi } from '../../lib/api/endpoints';
import { useLanguage } from '../../lib/language';
import { useSession } from '../../lib/session';
import { useBranchScope } from '../branches/BranchScope';
import { reviewKeys } from './keys';
import { countNew, useReviewsSeen } from './seen';

/** The signed-in account's id (the "new reviews" marker is kept per account). */
export function useAccountId(): string {
  const session = useSession();
  return session.status === 'authenticated' ? session.user.id : 'anonymous';
}

/** Reviews that arrived since the account last opened the inbox (the navigation badge), for the branch being worked on. */
export function useNewReviewsCount(enabled: boolean) {
  const scope = useBranchScope();
  const accountId = useAccountId();
  const { seenAt } = useReviewsSeen(accountId);
  const newest = useQuery({
    queryKey: reviewKeys.badge(scope.selected),
    queryFn: () => reviewsApi.list({ branchId: scope.selected === 'all' ? null : scope.selected, page: 1, pageSize: BADGE_PAGE }),
    enabled,
    staleTime: 30_000,
    // Live events refetch it; this catches anything missed while offline.
    refetchInterval: 120_000,
    retry: (count, error) => !isApiError(error, REVIEW_ERROR_CODES.UNAVAILABLE) && count < 2,
  });
  const count = newest.data ? countNew(newest.data.items, seenAt) : 0;
  return { count, capped: count >= BADGE_PAGE };
}
const BADGE_PAGE = 30;

/** The count on the Reviews navigation item. */
export function NewReviewsCount({ enabled, testId = 'new-reviews-count' }: { enabled: boolean; testId?: string }) {
  const { number, count: counted } = useLanguage();
  const { count, capped } = useNewReviewsCount(enabled);
  if (count <= 0) return null;
  const shown = capped ? `${number(BADGE_PAGE)}+` : number(count);
  return <span className="nav-count" data-testid={testId}>
    <span aria-hidden="true">{shown}</span>
    <span className="visually-hidden">({counted(count, [{ one: 'تقييم جديد', two: 'تقييمين جداد', few: '{n} تقييمات جديدة', many: '{n} تقييم جديد' }, { one: '{n} new review', other: '{n} new reviews' }])})</span>
  </span>;
}

