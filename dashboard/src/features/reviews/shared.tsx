import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { ChartLineUpIcon, GearSixIcon, StarIcon, TrayIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import {
  REVIEW_ERROR_CODES, REVIEW_SUB_RATING_LABELS,
  type ReviewFollowUpStatus, type ReviewStatus, type ReviewSubRating, type ReviewTag,
} from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { isApiError } from '../../lib/api';
import { kitchenApi, restaurantApi, reviewsApi } from '../../lib/api/endpoints';
import { reviewKeys } from './keys';
import { formatDate, formatRelative } from '../../lib/format';
import { useLanguage } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { queryKeys } from '../restaurant/queries';
import { reviewActions, type ReviewsTabKey, visibleReviewTabs } from './access';
import { formatAverage, tagName } from './present';

export { reviewKeys } from './keys';

/** The restaurant's review settings (readable with reviews.view too: they name the tags and questions). */
export function useReviewSettings(enabled = true) {
  return useQuery({
    queryKey: reviewKeys.settings,
    queryFn: reviewsApi.settings,
    staleTime: 60_000,
    enabled,
    retry: (count, error) => !isApiError(error, REVIEW_ERROR_CODES.UNAVAILABLE) && count < 2,
  });
}

/** What the viewer may do with reviews. */
export function useReviewActions() {
  const { can } = useWorkspace();
  return useMemo(() => reviewActions(can), [can]);
}

/**
 * Whether the plan includes reviews, in either shell: the owner's restaurant, or the staff
 * account's kitchen context (both already loaded by their shell).
 */
export function usePlanIncludesReviews(): boolean {
  const { role } = useWorkspace();
  const owner = role === 'OWNER';
  const restaurant = useQuery({ queryKey: queryKeys.restaurant, queryFn: restaurantApi.mine, enabled: owner });
  const context = useQuery({ queryKey: queryKeys.kitchenContext, queryFn: kitchenApi.context, enabled: !owner });
  return Boolean(owner ? restaurant.data?.access.features.reviews : context.data?.features.reviews);
}

export { useAccountId } from './badge';

/** The branch lists and figures work on: the one chosen in the shell (staff: theirs), or null for every branch. */
export function useScopeBranch(): string | null {
  const scope = useBranchScope();
  return scope.selected === 'all' ? null : scope.selected;
}

/** Dates, names and ratings as the interface language writes them. */
export function useReviewFormat() {
  const { language, text } = useLanguage();
  return useMemo(() => ({
    language,
    date: (iso: string | null | undefined) => (iso ? formatDate(iso, language) : '—'),
    dateTime: (iso: string | null | undefined) => (iso ? formatDate(iso, language, { dateStyle: 'medium', timeStyle: 'short' }) : '—'),
    relative: (iso: string) => formatRelative(iso, language),
    average: (value: number | null | undefined) => formatAverage(value, language),
    name: (nameAr: string | null, nameEn: string | null | undefined) => (language === 'en' ? nameEn || nameAr || '' : nameAr || nameEn || ''),
    tag: (tag: Pick<ReviewTag, 'nameAr' | 'nameEn' | 'code'>) => tagName(tag, language),
    subRating: (key: ReviewSubRating) => text(...REVIEW_SUB_RATING_LABELS[key]),
    /** "Guest" when the review shows no name publicly. */
    diner: (name: string | null | undefined) => name || text('ضيف', 'Guest'),
  }), [language, text]);
}

export const STATUS_LABELS: Record<ReviewStatus, [string, string]> = {
  PUBLISHED: ['منشور', 'Published'],
  PENDING: ['مستني موافقتك', 'Waiting for you'],
  HIDDEN: ['مخفي', 'Hidden'],
};
const STATUS_TONES: Record<ReviewStatus, string> = { PUBLISHED: 'badge-success', PENDING: 'badge-warning', HIDDEN: 'badge-muted' };

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const { text } = useLanguage();
  return <span className={`badge ${STATUS_TONES[status]}`} data-status={status}>{text(...STATUS_LABELS[status])}</span>;
}

export const FOLLOW_UP_LABELS: Record<ReviewFollowUpStatus, [string, string]> = {
  OPEN: ['محتاج متابعة', 'Follow-up open'],
  CONTACTED: ['اتواصلنا معاه', 'Contacted'],
  RESOLVED: ['اتحلّت', 'Resolved'],
};
/** The steps as the picker names them (short, side by side). */
export const FOLLOW_UP_STEPS: Record<ReviewFollowUpStatus, [string, string]> = {
  OPEN: ['مفتوحة', 'Open'],
  CONTACTED: ['اتواصلنا', 'Contacted'],
  RESOLVED: ['اتحلّت', 'Resolved'],
};
/** What each follow-up step means, for the picker. */
export const FOLLOW_UP_HELP: Record<ReviewFollowUpStatus, [string, string]> = {
  OPEN: ['لسه محدش كلّم الزبون.', 'Nobody has reached the diner yet.'],
  CONTACTED: ['كلّمناه وسمعنا منه.', 'We reached the diner and heard them out.'],
  RESOLVED: ['المشكلة اتحلّت أو اتقفلت.', 'The problem is sorted or closed.'],
};
const FOLLOW_UP_TONES: Record<ReviewFollowUpStatus, string> = { OPEN: 'badge-danger', CONTACTED: 'badge-info', RESOLVED: 'badge-success' };

export function FollowUpBadge({ status }: { status: ReviewFollowUpStatus }) {
  const { text } = useLanguage();
  return <span className={`badge ${FOLLOW_UP_TONES[status]}`} data-follow-up={status}>{text(...FOLLOW_UP_LABELS[status])}</span>;
}

/** Five stars, the first `value` filled; read out as "4 of 5 stars". */
export function Stars({ value, size = 15, className = '' }: { value: number; size?: number; className?: string }) {
  const { text, number } = useLanguage();
  const rounded = Math.round(value);
  return <span className={`rv-stars ${className}`} role="img" aria-label={text(`${number(rounded)} من ٥ نجوم`, `${rounded} of 5 stars`)} data-stars={rounded}>
    {[1, 2, 3, 4, 5].map(index => <StarIcon key={index} size={size} weight={index <= rounded ? 'fill' : 'regular'} className={index <= rounded ? 'is-on' : ''} aria-hidden="true" />)}
  </span>;
}

/** A tag as a small chip, tinted by whether diners meant it well. */
export function TagChip({ tag }: { tag: ReviewTag }) {
  const format = useReviewFormat();
  return <span className={`rv-tag ${tag.sentiment === 'NEGATIVE' ? 'is-negative' : 'is-positive'}`}><bdi>{format.tag(tag)}</bdi></span>;
}

const TAB_PRESENTATION: Record<ReviewsTabKey, { icon: Icon; label: [string, string]; end?: boolean }> = {
  inbox: { icon: TrayIcon, label: ['التقييمات', 'Inbox'], end: true },
  insights: { icon: ChartLineUpIcon, label: ['الأرقام', 'Insights'] },
  settings: { icon: GearSixIcon, label: ['الإعدادات', 'Settings'] },
};

/**
 * The reviews section: one header, its pages as tabs (those the viewer may open) and the plan
 * check. Owners under /reviews, staff under /manager/reviews.
 */
export function ReviewsLayout() {
  const { text } = useLanguage();
  const { can, to } = useWorkspace();
  const settings = useReviewSettings();
  const tabs = visibleReviewTabs(can);
  const { pathname } = useLocation();
  // A review's own page belongs to the inbox tab.
  const inInbox = !/\/reviews\/(insights|settings)\/?$/.test(pathname);
  const unavailable = settings.isError && isApiError(settings.error, REVIEW_ERROR_CODES.UNAVAILABLE);
  return <div className="page rv-page">
    <PageHeader title={text('آراء الزباين', 'Feedback & reviews')}
      description={text('اللي الزباين قالوه عن زيارتهم وكل طبق: رد عليهم، تابع اللي مش مبسوط، واختار إيه اللي يظهر على المنيو.', 'What diners said about their visit and each dish: reply, follow up whoever left unhappy, and choose what shows on your menu.')} />
    {unavailable ? <section className="card"><div className="empty-state" data-testid="reviews-unavailable">
      <span className="empty-state-icon" aria-hidden="true"><StarIcon size={30} /></span>
      <h2>{text('التقييمات مش ضمن باقتك', 'Reviews are not part of your plan')}</h2>
      <p>{text('آراء الزباين والرد عليهم ومتابعتهم متاحين في باقة «منيو وطلبات» و«التجربة الكاملة». التقييمات اللي وصلت محفوظة لو رجعت لهم.', 'Diners’ feedback, replies and follow-ups come with the Menu & Orders and Full Experience plans. The reviews you received are kept if you come back to them.')}</p>
      {can('billing.manage') && <Link className="button button-primary" to={to('/subscription')}>{text('شوف الباقات', 'See the plans')}</Link>}
    </div></section> : <>
      {tabs.length > 1 && <nav className="att-tabs rv-tabs" aria-label={text('أقسام التقييمات', 'Review sections')}>
        {tabs.map(tab => {
          const meta = TAB_PRESENTATION[tab.key];
          return <NavLink key={tab.key} to={to(tab.path)} end={meta.end} className={({ isActive }) => `att-tab ${(tab.key === 'inbox' ? inInbox : isActive) ? 'active' : ''}`}
            aria-current={tab.key === 'inbox' && inInbox ? 'page' : undefined} data-testid={`rv-tab-${tab.key}`}>
            <meta.icon size={18} weight="bold" aria-hidden="true" />{text(...meta.label)}
          </NavLink>;
        })}
      </nav>}
      {settings.isError && <ErrorPanel error={settings.error} onRetry={() => void settings.refetch()} />}
      {settings.isPending && <Skeleton height={48} />}
      {settings.data && !settings.data.enabled && <Alert kind="info" live={false} title={text('الزباين مش بيتسألوا عن رأيهم دلوقتي', 'Diners are not being asked for feedback')}
        actions={can('reviews.settings') ? <Link className="link-action" to={to('/reviews/settings')}>{text('شغّلها من الإعدادات', 'Turn it on in the settings')}</Link> : undefined}>
        {text('التقييمات القديمة موجودة هنا زي ما هي، بس صفحة متابعة الطلب مش هتطلب من الزبون يقيّم.', 'Earlier reviews stay here as they are, but the order tracking page will not ask diners to rate their visit.')}
      </Alert>}
      <Outlet />
    </>}
  </div>;
}
