import { useEffect, useId, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import {
  CameraIcon, ChatCircleTextIcon, DownloadSimpleIcon, ForkKnifeIcon, FunnelIcon, HourglassMediumIcon, PencilSimpleLineIcon, PhoneCallIcon, SealCheckIcon, StarIcon, ThumbsDownIcon, TrayIcon, XIcon,
} from '@phosphor-icons/react';
import { REVIEW_FOLLOW_UP_STATUSES, REVIEW_STATUSES, type OwnerReviewListItem } from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Pagination } from '../../components/Pagination';
import { Skeleton } from '../../components/Skeleton';
import { StatCard } from '../../components/StatCard';
import { useToast } from '../../components/Toast';
import { reviewsApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useDebounced } from '../../lib/use-debounced';
import { useBranchScope } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { SearchBox } from '../inventory/controls';
import {
  activeFilterCount, applyPreset, EMPTY_FILTERS, type InboxFilters, type InboxPreset, matchesPreset, normalizeStars, readFilters, toReviewQuery, writeFilters,
} from './filters';
import { excerpt, formatReplyTime, formatShare } from './present';
import { useReviewsSeen } from './seen';
import {
  FOLLOW_UP_LABELS, FollowUpBadge, reviewKeys, ReviewStatusBadge, Stars, STATUS_LABELS, TagChip, useAccountId, useReviewActions, useReviewFormat, useScopeBranch,
} from './shared';

const PAGE_SIZE = 20;

/** The section's first page: the inbox for those who read reviews, the settings for those who only change them. */
export function ReviewsIndexPage() {
  const actions = useReviewActions();
  const { to } = useWorkspace();
  if (!actions.view) return <Navigate to={to('/reviews/settings')} replace />;
  return <ReviewsInboxPage />;
}

/** Saves a file the API built. */
export async function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const todayStamp = () => new Date().toISOString().slice(0, 10);

/** Every review (published or not, low ratings included), newest first, filtered and paged. */
export function ReviewsInboxPage() {
  const { text, number, language } = useLanguage();
  const format = useReviewFormat();
  const { to } = useWorkspace();
  usePageTitle('آراء الزباين', 'Reviews');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const scopeBranch = useScopeBranch();
  const accountId = useAccountId();
  const { markSeen } = useReviewsSeen(accountId);
  const [search, setSearch] = useState(filters.q);
  const debounced = useDebounced(search, 350);
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilterCount(filters) > 0);
  const update = (change: Partial<InboxFilters>, keepPage = false) => setParams(current => writeFilters({ ...readFilters(current), ...change, ...(keepPage ? {} : { page: change.page ?? 1 }) }, current), { replace: true });
  // The search box writes to the address bar once typing pauses.
  useEffect(() => { if (debounced !== readFilters(params).q) update({ q: debounced }); }, [debounced]);
  useEffect(() => { if (filters.q !== debounced && filters.q !== search) setSearch(filters.q); }, [filters.q]);

  const query = toReviewQuery(filters, scopeBranch);
  const list = useQuery({
    queryKey: reviewKeys.list(query, filters.page),
    queryFn: () => reviewsApi.list({ ...query, page: filters.page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  // Opening the inbox counts as having seen what has arrived.
  useEffect(() => { if (list.data) markSeen(); }, [list.data, markSeen]);

  const active = activeFilterCount(filters);
  const exportCsv = async () => {
    setExporting(true);
    try {
      await saveBlob(await reviewsApi.exportCsv(query), `reviews-${todayStamp()}.csv`);
    } catch (error) {
      toast.error(errorMessage(error, text));
    } finally {
      setExporting(false);
    }
  };
  const presetActive = (key: InboxPreset | 'all') => (key === 'all' ? active === 0 || (active === 1 && filters.branchId !== null) : matchesPreset(filters, key));
  const stats = useQuery({ queryKey: reviewKeys.stats({ branchId: scopeBranch, days: 30 }), queryFn: ({ signal }) => reviewsApi.stats({ branchId: scopeBranch, days: 30 }, signal), placeholderData: keepPreviousData });
  const pick = (key: InboxPreset | 'all') => {
    const next = key === 'all' ? { ...EMPTY_FILTERS, branchId: filters.branchId } : applyPreset(filters, key);
    setSearch('');
    setParams(current => writeFilters(next, current), { replace: true });
  };
  const figures = stats.data;
  return <>
    <div className="inv-stats rv-stats" role="group" aria-label={text('عرض سريع', 'Quick views')}>
      <StatCard onClick={() => pick('all')} active={presetActive('all')} icon={StarIcon} tone="guava" testId="rv-preset-all"
        label={text('متوسط التقييم', 'Average rating')}
        value={<>{figures ? format.average(figures.average) : '—'}{figures?.average != null && <Stars value={figures.average} size={13} className="rv-stars" />}</>}
        note={figures ? text(`من ${number(figures.count)} تقييم في آخر ٣٠ يوم`, `From ${figures.count} reviews in the last 30 days`) : text('آخر ٣٠ يوم', 'Last 30 days')} />
      <StatCard onClick={() => pick('low')} active={presetActive('low')} icon={ThumbsDownIcon} tone={figures?.unhappy ? 'danger' : 'success'} testId="rv-preset-low"
        label={text('تقييم ضعيف (١–٢★)', 'Low ratings (1–2★)')} value={figures ? number(figures.unhappy) : '—'}
        note={figures?.unhappy ? text('اعرف إيه اللي ضايقهم', 'See what went wrong') : text('مفيش تقييمات ضعيفة', 'No low ratings')} />
      <StatCard onClick={() => pick('pending')} active={presetActive('pending')} icon={HourglassMediumIcon} tone={figures?.pending ? 'warning' : 'muted'} testId="rv-preset-pending"
        label={text('مستنية موافقتك', 'Waiting for you')} value={figures ? number(figures.pending) : '—'}
        note={text('مش ظاهرة للزباين لحد ما تنشرها', 'Hidden from diners until published')} />
      <StatCard onClick={() => pick('followUp')} active={presetActive('followUp')} icon={PhoneCallIcon} tone={figures?.openFollowUps ? 'warning' : 'muted'} testId="rv-preset-followUp"
        label={text('محتاجة متابعة', 'Follow-up open')} value={figures ? number(figures.openFollowUps) : '—'}
        note={figures?.openFollowUps ? text('زباين لسه محدش كلّمهم', 'Diners nobody has reached yet') : text('مفيش متابعات مفتوحة', 'Nothing open')} />
      <StatCard to={to('/reviews/insights')} icon={ChatCircleTextIcon} tone="info" testId="rv-stat-reply"
        label={text('نسبة الرد', 'Reply rate')} value={figures ? formatShare(figures.replyRate, language) : '—'}
        note={figures?.medianReplyMinutes != null ? text(`بترد في حوالي ${formatReplyTime(figures.medianReplyMinutes, 'ar')}`, `Usually within ${formatReplyTime(figures.medianReplyMinutes, 'en')}`) : text('شوف كل الأرقام', 'See all insights')} />
    </div>
    <div className="rv-toolbar">
      <div className="rv-toolbar-search"><SearchBox value={search} onChange={setSearch} label={text('دوّر في التعليقات والأسماء ورقم الطلب', 'Search comments, names and order numbers')} /></div>
      <div className="rv-toolbar-actions">
        <Button small variant="secondary" aria-expanded={filtersOpen} aria-controls="rv-filters" onClick={() => setFiltersOpen(open => !open)} icon={<FunnelIcon size={16} aria-hidden="true" />} data-testid="rv-filters-toggle">
          {text('تصفية', 'Filters')}{active > 0 && <span className="inv-chip-count">{active}</span>}
        </Button>
        <Button small variant="secondary" loading={exporting} onClick={() => void exportCsv()} icon={<DownloadSimpleIcon size={16} aria-hidden="true" />} data-testid="rv-export">
          {text('نزّل CSV', 'Export CSV')}
        </Button>
      </div>
    </div>
    {filtersOpen && <FilterPanel filters={filters} onChange={update} onClear={() => { setSearch(''); setParams(current => writeFilters({ ...EMPTY_FILTERS }, current), { replace: true }); }} />}
    <section className="card list-card rv-inbox" aria-labelledby="rv-inbox-title" aria-busy={list.isFetching}>
      <h2 id="rv-inbox-title" className="visually-hidden">{text('التقييمات', 'Reviews')}</h2>
      {list.isError && <ErrorPanel error={list.error} onRetry={() => void list.refetch()} />}
      {list.isPending && <div className="table-skeleton">{[0, 1, 2, 3].map(index => <Skeleton key={index} height={92} />)}</div>}
      {list.data?.items.length === 0 && <div className="empty-state" data-testid="rv-empty">
        <span className="empty-state-icon" aria-hidden="true"><TrayIcon size={30} /></span>
        {active > 0 ? <>
          <h2>{text('مفيش تقييمات بالتصفية دي', 'No reviews match these filters')}</h2>
          <p>{text('جرّب توسّع الفترة أو تشيل فلتر.', 'Try a wider period or remove a filter.')}</p>
          <Button small variant="secondary" onClick={() => { setSearch(''); setParams(current => writeFilters({ ...EMPTY_FILTERS }, current), { replace: true }); }}>{text('امسح التصفية', 'Clear filters')}</Button>
        </> : <>
          <h2>{text('لسه مفيش تقييمات', 'No reviews yet')}</h2>
          <p>{text('أول ما زبون يقيّم طلبه من صفحة المتابعة، هيظهر هنا، حتى لو التقييم ضعيف ومش منشور.', 'As soon as a diner rates their order from the tracking page it shows here, even a low rating that is not published.')}</p>
          <ol className="rv-empty-steps">
            <li><strong>{text('الزبون بيطلب', 'A diner orders')}</strong><span>{text('من QR الطاولة أو المنيو', 'From a table QR or the menu')}</span></li>
            <li><strong>{text('بيقيّم من صفحة المتابعة', 'Rates it from the tracking page')}</strong><span>{text('الزيارة وكل طبق', 'The visit and each dish')}</span></li>
            <li><strong>{text('ترد عليه من هنا', 'You reply from here')}</strong><span>{text('وتتابع اللي مش مبسوط', 'And follow up the unhappy ones')}</span></li>
          </ol>
        </>}
      </div>}
      {list.data && list.data.items.length > 0 && <ul className={`rv-list ${list.isPlaceholderData ? 'is-refreshing' : ''}`} data-testid="rv-list">
        {list.data.items.map(review => <ReviewRow key={review.id} review={review} />)}
      </ul>}
    </section>
    {list.data && <Pagination page={filters.page} pageSize={list.data.pageSize} total={list.data.total} onChange={page => { update({ page }, true); window.scrollTo({ top: 0 }); }} label={text('صفحات التقييمات', 'Review pages')} />}
  </>;
}

function FilterPanel({ filters, onChange, onClear }: {
  filters: InboxFilters; onChange: (change: Partial<InboxFilters>) => void; onClear: () => void;
}) {
  const { text, number } = useLanguage();
  const scope = useBranchScope();
  const starsId = useId();
  const stars = normalizeStars(filters.stars);
  const toggleStar = (value: number) => onChange({ stars: stars.includes(value) ? stars.filter(entry => entry !== value) : [...stars, value] });
  const triValue = (value: boolean | null) => (value === null ? '' : String(value));
  const fromTri = (value: string) => (value === '' ? null : value === 'true');
  // The shell's branch switcher narrows first; this one only appears while every branch is shown.
  const branchChoices = scope.multi && scope.selected === 'all' ? scope.choices : [];
  return <div className="att-filters rv-filters" id="rv-filters" role="group" aria-label={text('تصفية التقييمات', 'Filter reviews')}>
    <fieldset className="field rv-star-filter">
      <legend className="field-label" id={starsId}>{text('النجوم', 'Stars')}</legend>
      <div className="filter-chips" role="group" aria-labelledby={starsId}>
        {[5, 4, 3, 2, 1].map(value => <button key={value} type="button" className={`filter-chip rv-star-chip ${stars.includes(value) ? 'active' : ''}`} aria-pressed={stars.includes(value)}
          onClick={() => toggleStar(value)} aria-label={text(`${number(value)} نجوم`, `${value} star${value === 1 ? '' : 's'}`)} data-testid={`rv-star-${value}`}>
          {number(value)}<StarIcon size={14} weight="fill" aria-hidden="true" />
        </button>)}
      </div>
    </fieldset>
    {branchChoices.length > 1 && <Field label={text('الفرع', 'Branch')}>
      <select className="select" value={filters.branchId ?? ''} onChange={event => onChange({ branchId: event.target.value || null })} data-testid="rv-filter-branch">
        <option value="">{text('كل الفروع', 'All branches')}</option>
        {branchChoices.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select>
    </Field>}
    <Field label={text('الحالة', 'Status')}>
      <select className="select" value={filters.status ?? ''} onChange={event => onChange({ status: (event.target.value || null) as InboxFilters['status'] })} data-testid="rv-filter-status">
        <option value="">{text('الكل', 'All')}</option>
        {REVIEW_STATUSES.map(status => <option key={status} value={status}>{text(...STATUS_LABELS[status])}</option>)}
      </select>
    </Field>
    <Field label={text('مصدر التقييم', 'Source')}>
      <select className="select" value={triValue(filters.verified)} onChange={event => onChange({ verified: fromTri(event.target.value) })} data-testid="rv-filter-verified">
        <option value="">{text('الكل', 'All')}</option>
        <option value="true">{text('موثّق (من طلب)', 'Verified (from an order)')}</option>
        <option value="false">{text('من غير طلب', 'Without an order')}</option>
      </select>
    </Field>
    <Field label={text('التعليق', 'Comment')}>
      <select className="select" value={triValue(filters.hasComment)} onChange={event => onChange({ hasComment: fromTri(event.target.value) })} data-testid="rv-filter-comment">
        <option value="">{text('الكل', 'All')}</option>
        <option value="true">{text('فيه تعليق', 'With a comment')}</option>
        <option value="false">{text('من غير تعليق', 'Without a comment')}</option>
      </select>
    </Field>
    <Field label={text('المتابعة', 'Follow-up')}>
      <select className="select" value={filters.followUp ?? ''} onChange={event => onChange({ followUp: (event.target.value || null) as InboxFilters['followUp'] })} data-testid="rv-filter-follow-up">
        <option value="">{text('الكل', 'All')}</option>
        {REVIEW_FOLLOW_UP_STATUSES.map(status => <option key={status} value={status}>{text(...FOLLOW_UP_LABELS[status])}</option>)}
        <option value="NONE">{text('من غير متابعة', 'No follow-up')}</option>
      </select>
    </Field>
    <Field label={text('من يوم', 'From')}><input className="input" type="date" value={filters.from ?? ''} max={filters.to ?? undefined} onChange={event => onChange({ from: event.target.value || null })} /></Field>
    <Field label={text('لحد يوم', 'To')}><input className="input" type="date" value={filters.to ?? ''} min={filters.from ?? undefined} onChange={event => onChange({ to: event.target.value || null })} /></Field>
    {activeFilterCount(filters) > 0 && <div className="rv-filter-clear"><button type="button" className="text-button" onClick={onClear}><XIcon size={14} aria-hidden="true" />{text('امسح التصفية', 'Clear filters')}</button></div>}
  </div>;
}

/** One review in the inbox: the whole row opens it. */
function ReviewRow({ review }: { review: OwnerReviewListItem }) {
  const { text, number } = useLanguage();
  const format = useReviewFormat();
  const { to } = useWorkspace();
  const location = useLocation();
  const scope = useBranchScope();
  const ratings = Object.entries(review.ratings) as [keyof OwnerReviewListItem['ratings'], number][];
  const comment = excerpt(review.comment, 200);
  const showBranch = scope.multi && scope.selected === 'all';
  return <li className={`rv-row ${review.lowRating ? 'is-low' : ''}`} data-testid="review-row" data-overall={review.overall} data-status={review.status}>
    <div className="rv-row-score" aria-hidden="true">
      <strong>{number(review.overall)}</strong>
      <Stars value={review.overall} size={11} />
    </div>
    <div className="rv-row-body">
      <div className="rv-row-head">
        <Link className="rv-row-link row-link" to={`${to(`/reviews/${review.id}`)}`} state={{ inbox: location.search }}>
          <span className="visually-hidden">{text(`${number(review.overall)} من ٥ نجوم، من `, `${review.overall} of 5 stars, from `)}</span>
          <bdi dir="auto">{format.diner(review.authorName)}</bdi>
        </Link>
        {review.verified
          ? <span className="rv-verified" title={text('اتكتب من صفحة متابعة طلب حقيقي', 'Written from a real order’s tracking page')}><SealCheckIcon size={15} weight="fill" aria-hidden="true" />{text('موثّق', 'Verified')}</span>
          : <span className="badge badge-muted" title={text('اتكتب من غير طلب', 'Written without an order')}>{review.source === 'TABLE' ? text('من QR الطاولة', 'Table QR') : text('من المنيو', 'From the menu')} · {text('مش موثّق', 'Unverified')}</span>}
        <span className="rv-row-where">
          {showBranch && <bdi>{review.branchName}</bdi>}
          {review.orderNumber !== null && <span className="ltr">{text(`طلب #${number(review.orderNumber)}`, `Order #${review.orderNumber}`)}</span>}
          {review.tableLabel && <bdi>{review.tableLabel}</bdi>}
        </span>
        <time className="rv-row-time" dateTime={review.createdAt} title={format.dateTime(review.createdAt)}>{format.relative(review.createdAt)}</time>
      </div>
      {ratings.length > 0 && <ul className="rv-subs" aria-label={text('التقييمات التفصيلية', 'Detailed ratings')}>
        {ratings.map(([key, value]) => <li key={key} className={value <= 2 ? 'is-low' : ''}><span>{format.subRating(key)}</span> <strong>{number(value)}</strong></li>)}
      </ul>}
      {comment && <p className="rv-row-comment" dir="auto"><bdi dir="auto">{comment}</bdi></p>}
      {(review.tags.length > 0 || review.dishCount > 0 || review.photoCount > 0 || review.edited) && <div className="rv-row-extras">
        {review.tags.map(tag => <TagChip key={tag.code} tag={tag} />)}
        {review.dishCount > 0 && <span className="rv-extra"><ForkKnifeIcon size={14} aria-hidden="true" />{text(`قيّم ${number(review.dishCount)} طبق`, `${review.dishCount} dish${review.dishCount === 1 ? '' : 'es'} rated`)}</span>}
        {review.photoCount > 0 && <span className="rv-extra"><CameraIcon size={14} aria-hidden="true" />{text(`${number(review.photoCount)} صورة`, `${review.photoCount} photo${review.photoCount === 1 ? '' : 's'}`)}</span>}
        {review.edited && <span className="rv-extra"><PencilSimpleLineIcon size={14} aria-hidden="true" />{text('اتعدّل', 'Edited')}</span>}
      </div>}
    </div>
    <div className="rv-row-state">
      <ReviewStatusBadge status={review.status} />
      {review.followUp && <FollowUpBadge status={review.followUp.status} />}
      <span className={`rv-reply-state ${review.reply ? 'is-replied' : ''}`}><ChatCircleTextIcon size={14} weight={review.reply ? 'fill' : 'regular'} aria-hidden="true" />{review.reply ? text('اترد عليه', 'Replied') : text('من غير رد', 'No reply')}</span>
    </div>
  </li>;
}
