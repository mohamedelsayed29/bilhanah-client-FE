import { useState } from 'react';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { DownloadSimpleIcon, StarIcon, ThumbsDownIcon, ThumbsUpIcon } from '@phosphor-icons/react';
import { UNHAPPY_MAX_STARS, type ReviewDishReport, type ReviewStats } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { BarList } from '../../components/charts/BarList';
import { DailyChart, type ChartSeries } from '../../components/charts/DailyChart';
import { PeriodSwitch, periodLabel, usePeriodParam } from '../../components/charts/PeriodSwitch';
import { CompactMeta } from '../../components/CompactMeta';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Section } from '../../components/Section';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { reviewsApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { Figure } from '../inventory/controls';
import { today } from '../inventory/shared';
import { writeFilters, EMPTY_FILTERS } from './filters';
import { saveBlob } from './InboxPage';
import { chartDays, distributionRows, formatReplyTime, formatShare, periodStart, rankDishes, splitTags, subRatingRows } from './present';
import { reviewKeys, Stars, useReviewFormat, useReviewSettings, useScopeBranch } from './shared';

/** How ratings move over time, what diners praise and complain about, the best and worst dishes, and how the team responds. */
export function ReviewsInsightsPage() {
  const { text, number } = useLanguage();
  usePageTitle('أرقام التقييمات', 'Review insights');
  const toast = useToast();
  const [days, setDays] = usePeriodParam(30);
  const branchId = useScopeBranch();
  const scope = useBranchScope();
  const params = { branchId, days };
  const stats = useQuery({ queryKey: reviewKeys.stats(params), queryFn: ({ signal }) => reviewsApi.stats(params, signal), placeholderData: keepPreviousData });
  const dishes = useQuery({ queryKey: reviewKeys.dishes(params), queryFn: () => reviewsApi.dishes(params), placeholderData: keepPreviousData });
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    const to = today();
    const from = periodStart(to, days);
    try {
      await saveBlob(await reviewsApi.exportCsv({ branchId, from, to }), `reviews-${from}-${to}.csv`);
    } catch (error) {
      toast.error(errorMessage(error, text));
    } finally {
      setExporting(false);
    }
  };
  const compare = scope.multi && scope.selected === 'all';
  return <>
    <div className="rv-toolbar">
      <PeriodSwitch value={days} onChange={setDays} />
      <div className="rv-toolbar-actions">
        <Button small variant="secondary" loading={exporting} onClick={() => void exportCsv()} icon={<DownloadSimpleIcon size={16} aria-hidden="true" />} data-testid="rv-insights-export">{text('نزّل CSV', 'Export CSV')}</Button>
      </div>
    </div>
    <p className="visually-hidden" role="status" aria-live="polite">{stats.isFetching ? text('بنحمّل الأرقام…', 'Loading figures…') : stats.data ? text(`بنعرض ${periodLabel(days, text, number)}`, `Showing the ${periodLabel(days, text, number).toLowerCase()}`) : ''}</p>
    {stats.isError && !stats.data && <ErrorPanel error={stats.error} onRetry={() => void stats.refetch()} />}
    {stats.isPending && <div className="rv-insights-skeleton"><Skeleton height={200} /><Skeleton height={240} /></div>}
    {stats.data && <div className={`insights-body rv-insights ${stats.isPlaceholderData ? 'is-refreshing' : ''}`} aria-busy={stats.isFetching} data-testid="rv-insights">
      {stats.isError && <Alert kind="error" title={text('مقدرناش نحدّث الأرقام', 'We couldn’t refresh the figures')}>{text('بنعرض آخر أرقام وصلتنا.', 'Showing the last figures we received.')}</Alert>}
      <Scoreboard stats={stats.data} />
      <TeamFigures stats={stats.data} />
      <Section id="rv-daily" title={text('يوم بيوم', 'Day by day')} description={text('متوسط التقييم وعدد التقييمات كل يوم، بتوقيت مطعمك. كل التقييمات محسوبة، المنشورة والمخفية والمستنية.', 'The average rating and number of reviews per day, in your restaurant’s time zone. Every review counts: published, hidden or waiting.')}>
        {stats.data.count === 0
          ? <div className="empty-state chart-empty" data-testid="rv-insights-empty"><h3>{text('مفيش تقييمات في الفترة دي', 'No reviews in this period')}</h3>
            <p>{text('أول ما الزباين يقيّموا طلباتهم من صفحة المتابعة، الأرقام هتظهر هنا.', 'Once diners rate their orders from the tracking page, the figures show up here.')}</p></div>
          : <RatingChart stats={stats.data} days={days} />}
      </Section>
      <div className="insights-grid">
        <SubRatings stats={stats.data} />
        <Tags stats={stats.data} />
      </div>
      <DishRanking report={dishes.data} pending={dishes.isPending} error={dishes.isError ? dishes.error : null} onRetry={() => void dishes.refetch()} />
      {compare && <BranchTable days={days} />}
    </div>}
  </>;
}

/** The headline: the average, its stars, and how the ratings spread from 5 to 1. */
function Scoreboard({ stats }: { stats: ReviewStats }) {
  const { text, number, count } = useLanguage();
  const format = useReviewFormat();
  const rows = distributionRows(stats.distribution);
  const max = Math.max(1, ...rows.map(row => row.count));
  return <section className="card rv-scoreboard" aria-labelledby="rv-score-title" data-testid="rv-scoreboard">
    <h2 id="rv-score-title" className="visually-hidden">{text('متوسط التقييم وتوزيعه', 'Average rating and spread')}</h2>
    <div className="rv-score">
      <strong data-testid="rv-average">{format.average(stats.average)}</strong>
      {stats.average !== null && <Stars value={stats.average} size={18} />}
      <span className="muted">{count(stats.count, [{ one: 'تقييم واحد', two: 'تقييمين', few: '{n} تقييمات', many: '{n} تقييم', zero: 'مفيش تقييمات' }, { one: '{n} review', other: '{n} reviews', zero: 'No reviews' }])}</span>
    </div>
    <ol className="rv-distribution" aria-label={text('عدد التقييمات لكل نجمة', 'Reviews per star rating')}>
      {rows.map(row => <li key={row.stars} className={row.stars <= UNHAPPY_MAX_STARS ? 'is-low' : ''}>
        <span className="rv-distribution-stars">{number(row.stars)}<StarIcon size={12} weight="fill" aria-hidden="true" /></span>
        <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${row.count ? Math.max(2, (row.count / max) * 100) : 0}%` }} /></span>
        <span className="rv-distribution-count"><strong>{number(row.count)}</strong><small>{number(row.percent / 100, { style: 'percent' })}</small></span>
      </li>)}
    </ol>
  </section>;
}

/** How the team responds: replies, follow-ups of unhappy diners, and what is waiting now. */
function TeamFigures({ stats }: { stats: ReviewStats }) {
  const { text, number, language } = useLanguage();
  const { to } = useWorkspace();
  const inbox = (change: Partial<typeof EMPTY_FILTERS>) => `${to('/reviews')}?${writeFilters({ ...EMPTY_FILTERS, ...change }).toString()}`;
  return <section aria-labelledby="rv-team-title">
    <h2 id="rv-team-title" className="visually-hidden">{text('الرد والمتابعة', 'Replies and follow-ups')}</h2>
    <div className="att-kpis is-compact rv-figures">
      <Figure label={text('نسبة الرد', 'Reply rate')} value={formatShare(stats.replyRate, language)} tone={stats.replyRate !== null && stats.replyRate < 0.5 ? 'warning' : 'muted'}
        hint={stats.medianReplyMinutes !== null ? text(`الرد بياخد حوالي ${formatReplyTime(stats.medianReplyMinutes, 'ar')}`, `Usually within ${formatReplyTime(stats.medianReplyMinutes, 'en')}`) : text('لسه مفيش ردود', 'No replies yet')} testId="rv-reply-rate" />
      <Figure label={text('اتابعنا الزباين الزعلانين', 'Unhappy diners followed up')} value={formatShare(stats.unhappyFollowedUpShare, language)}
        tone={stats.unhappy > 0 && (stats.unhappyFollowedUpShare ?? 0) < 1 ? 'danger' : 'success'}
        hint={text(`من ${number(stats.unhappy)} تقييم بنجمة أو اتنين (اتكلمنا معاهم أو اتحلّت)`, `Of ${stats.unhappy} with 1 or 2 stars (contacted or resolved)`)} testId="rv-unhappy" />
      <Figure label={text('موثّق من طلبات', 'Verified by an order')} value={formatShare(stats.verifiedShare, language)} tone="info"
        hint={text('الباقي من QR الطاولة أو المنيو من غير طلب', 'The rest came from a table QR or the menu, without an order')} testId="rv-verified-share" />
      <Figure label={text('مستنية موافقتك دلوقتي', 'Waiting for you now')} value={<Link className="rv-figure-link" to={inbox({ status: 'PENDING' })}>{number(stats.pending)}</Link>}
        tone={stats.pending ? 'guava' : 'muted'} hint={text('مش ظاهرة للزباين لحد ما تنشرها', 'Not shown to diners until you publish them')} testId="rv-pending" />
      <Figure label={text('متابعات مفتوحة', 'Open follow-ups')} value={<Link className="rv-figure-link" to={inbox({ followUp: 'OPEN' })}>{number(stats.openFollowUps)}</Link>}
        tone={stats.openFollowUps ? 'warning' : 'muted'} hint={text('زباين لسه محدش كلّمهم', 'Diners nobody has reached yet')} testId="rv-open-follow-ups" />
    </div>
  </section>;
}

function RatingChart({ stats, days }: { stats: ReviewStats; days: number }) {
  const { text, number, language } = useLanguage();
  const format = useReviewFormat();
  const series: ChartSeries<ReturnType<typeof chartDays>[number]>[] = [
    { key: 'average', label: text('متوسط التقييم', 'Average rating'), format: value => (value > 0 ? format.average(value) : '—'), axisFormat: value => number(value), total: format.average(stats.average) },
    { key: 'count', label: text('عدد التقييمات', 'Reviews'), format: value => number(value), total: number(stats.count) },
  ];
  return <DailyChart days={chartDays(stats.series)} series={series}
    label={language === 'ar' ? `متوسط التقييم وعدد التقييمات كل يوم، آخر ${number(days)} يوم` : `Average rating and reviews per day, last ${days} days`} />;
}

function SubRatings({ stats }: { stats: ReviewStats }) {
  const { text, number } = useLanguage();
  const format = useReviewFormat();
  const settings = useReviewSettings();
  const rows = subRatingRows(stats.subRatings, settings.data?.subRatings ?? []);
  return <Section id="rv-subs-title" title={text('كل جانب لوحده', 'Each part of the visit')} description={text('متوسط كل سؤال من ٥.', 'The average of each question, out of 5.')}>
    {rows.length === 0
      ? <p className="muted empty-line">{text('مش بتسأل عن تقييمات تفصيلية. تقدر تضيفها من الإعدادات.', 'You do not ask for detailed ratings. You can add them in the settings.')}</p>
      : <ul className="rv-meters" data-testid="rv-sub-ratings">{rows.map(row => <li key={row.key} className={row.average !== null && row.average < 3 ? 'is-low' : ''}>
        <span className="rv-meter-label">{format.subRating(row.key)}<small>{row.count ? text(`${number(row.count)} إجابة`, `${row.count} answer${row.count === 1 ? '' : 's'}`) : text('لسه مفيش إجابات', 'No answers yet')}</small></span>
        <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${row.average ? (row.average / 5) * 100 : 0}%` }} /></span>
        <strong>{format.average(row.average)}</strong>
      </li>)}</ul>}
  </Section>;
}

function Tags({ stats }: { stats: ReviewStats }) {
  const { text } = useLanguage();
  const format = useReviewFormat();
  const { positive, negative } = splitTags(stats.tags);
  return <Section id="rv-tags-title" title={text('اللي الزباين اختاروه', 'What diners picked')} description={text('الاختيارات السريعة اللي الزباين علّموا عليها.', 'The quick chips diners ticked.')}>
    {positive.length === 0 && negative.length === 0 && <p className="muted empty-line">{text('محدش اختار حاجة في الفترة دي.', 'Nobody picked any in this period.')}</p>}
    {positive.length > 0 && <div className="rv-tag-group is-positive" data-testid="rv-tags-positive"><h3>{text('عجبهم', 'Liked')}</h3>
      <BarList label={text('الحاجات اللي عجبت الزباين', 'What diners liked')} items={positive.map(tag => ({ key: tag.code, label: <bdi>{format.tag(tag)}</bdi>, value: tag.count }))} /></div>}
    {negative.length > 0 && <div className="rv-tag-group is-negative" data-testid="rv-tags-negative"><h3>{text('ماعجبهمش', 'Went wrong')}</h3>
      <BarList label={text('الحاجات اللي ضايقت الزباين', 'What went wrong for diners')} items={negative.map(tag => ({ key: tag.code, label: <bdi>{format.tag(tag)}</bdi>, value: tag.count }))} /></div>}
  </Section>;
}

type DishRow = ReviewDishReport['dishes'][number];

function DishRanking({ report, pending, error, onRetry }: { report: ReviewDishReport | undefined; pending: boolean; error: unknown; onRetry: () => void }) {
  const { text, number } = useLanguage();
  if (pending) return <Skeleton height={240} />;
  if (error) return <ErrorPanel error={error} onRetry={onRetry} />;
  if (!report) return null;
  const { best, worst, unranked } = rankDishes(report.dishes);
  return <Section id="rv-dishes-title" title={text('الأطباق', 'Dishes')}
    description={text('الأطباق اللي اتقيّمت ٣ مرات أو أكتر، والتعليقات الأخيرة على كل واحد.', 'Dishes rated three times or more, with the latest comments on each.')}>
    {best.length === 0
      ? <p className="muted empty-line">{text('لسه مفيش طبق اتقيّم ٣ مرات.', 'No dish has been rated three times yet.')}</p>
      : <div className="rv-dish-columns">
        <div data-testid="rv-dishes-best"><h3 className="rv-dish-heading is-best"><ThumbsUpIcon size={17} weight="fill" aria-hidden="true" />{text('الأحلى عند الزباين', 'Diners’ favourites')}</h3>
          <ol className="rv-dish-list">{best.map(dish => <DishItem key={dish.menuItemId ?? dish.nameAr} dish={dish} scale={report.dishRatingScale} />)}</ol></div>
        <div data-testid="rv-dishes-worst"><h3 className="rv-dish-heading is-worst"><ThumbsDownIcon size={17} weight="fill" aria-hidden="true" />{text('محتاجين مراجعة', 'Worth a look')}</h3>
          {worst.length === 0 ? <p className="muted empty-line">{text('محدش اشتكى من طبق.', 'No dish drew complaints.')}</p>
            : <ol className="rv-dish-list">{worst.map(dish => <DishItem key={dish.menuItemId ?? dish.nameAr} dish={dish} scale={report.dishRatingScale} />)}</ol>}</div>
      </div>}
    {unranked > 0 && <p className="field-hint">{text(`${number(unranked)} طبق تاني اتقيّم أقل من ٣ مرات، فمش داخل في الترتيب.`, `${unranked} more dish${unranked === 1 ? ' was' : 'es were'} rated fewer than three times, so not ranked.`)}</p>}
  </Section>;
}

function DishItem({ dish, scale }: { dish: DishRow; scale: ReviewDishReport['dishRatingScale'] }) {
  const { text, number, language } = useLanguage();
  const format = useReviewFormat();
  return <li className="rv-dish">
    <div className="rv-dish-head">
      <bdi className="rv-dish-name">{format.name(dish.nameAr, dish.nameEn)}</bdi>
      {scale === 'STARS' ? <span className="rv-dish-score"><StarIcon size={14} weight="fill" aria-hidden="true" />{format.average(dish.average)}</span> : null}
    </div>
    <div className="rv-updown" aria-label={text(`عجب ${formatShare(dish.upShare, 'ar')} وماعجبش ${formatShare(dish.downShare, 'ar')} من ${number(dish.count)} تقييم`, `${formatShare(dish.upShare, 'en')} liked and ${formatShare(dish.downShare, 'en')} disliked it, of ${dish.count} ratings`)}>
      <span className="rv-updown-bar" aria-hidden="true"><span className="is-up" style={{ width: `${dish.upShare * 100}%` }} /><span className="is-down" style={{ width: `${dish.downShare * 100}%` }} /></span>
      <span className="rv-updown-text" aria-hidden="true"><span className="is-up"><ThumbsUpIcon size={13} weight="fill" />{formatShare(dish.upShare, language)}</span>
        <span className="is-down"><ThumbsDownIcon size={13} weight="fill" />{formatShare(dish.downShare, language)}</span>
        <span className="muted">{text(`${number(dish.count)} تقييم`, `${dish.count} ratings`)}</span></span>
    </div>
    {dish.recentComments.length > 0 && <details className="rv-dish-comments">
      <summary>{text(`آخر التعليقات (${number(dish.recentComments.length)})`, `Latest comments (${dish.recentComments.length})`)}</summary>
      <ul>{dish.recentComments.map(comment => <li key={comment.reviewId}>
        <Stars value={comment.overall} size={11} />
        <p dir="auto"><bdi dir="auto">{comment.comment}</bdi></p>
        <small className="muted">{format.date(comment.at)}</small>
      </li>)}</ul>
    </details>}
  </li>;
}

/** Every branch side by side, while all of them are shown. */
function BranchTable({ days }: { days: number }) {
  const { text, number, language } = useLanguage();
  const format = useReviewFormat();
  const scope = useBranchScope();
  const results = useQueries({ queries: scope.choices.map(branch => ({
    queryKey: reviewKeys.stats({ branchId: branch.id, days }),
    queryFn: ({ signal }: { signal: AbortSignal }) => reviewsApi.stats({ branchId: branch.id, days }, signal),
  })) });
  return <Section id="rv-branches-title" title={text('حسب الفرع', 'By branch')} description={text('نفس الفترة لكل فرع.', 'The same period at each branch.')}>
    <div className="table-scroll"><table className="data-table rv-branch-table" data-testid="rv-branch-table">
      <thead><tr><th scope="col">{text('الفرع', 'Branch')}</th><th scope="col">{text('التقييمات', 'Reviews')}</th><th scope="col">{text('المتوسط', 'Average')}</th>
        <th scope="col">{text('نسبة الرد', 'Reply rate')}</th><th scope="col">{text('اتابعنا الزعلانين', 'Unhappy followed up')}</th><th scope="col">{text('موثّق', 'Verified')}</th></tr></thead>
      <tbody>{scope.choices.map((branch, index) => {
        const data = results[index]?.data;
        return <tr key={branch.id}>
          <td className="cell-primary"><bdi>{branch.name}</bdi></td>
          {data ? <>
            <td>{number(data.count)}</td>
            <td className="cell-nowrap"><strong>{format.average(data.average)}</strong></td>
            <td>{formatShare(data.replyRate, language)}</td>
            <td>{formatShare(data.unhappyFollowedUpShare, language)}{data.unhappy > 0 && <small>{text(`من ${number(data.unhappy)}`, `of ${data.unhappy}`)}</small>}</td>
            <td className="cell-end">{formatShare(data.verifiedShare, language)}</td>
            <CompactMeta parts={[text(`${number(data.count)} تقييم`, `${data.count} reviews`), text(`متوسط ${format.average(data.average)}`, `average ${format.average(data.average)}`), text(`رد ${formatShare(data.replyRate, 'ar')}`, `replied ${formatShare(data.replyRate, 'en')}`)]} />
          </> : <td colSpan={5}>{results[index]?.isError ? errorMessage(results[index]?.error, text) : <Skeleton height={16} />}</td>}
        </tr>;
      })}</tbody>
    </table></div>
  </Section>;
}
