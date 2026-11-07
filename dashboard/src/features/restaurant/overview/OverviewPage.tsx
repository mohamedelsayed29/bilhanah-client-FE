import { Link } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeftIcon, ArrowSquareOutIcon, CalendarBlankIcon, CheckCircleIcon, CircleIcon, ReceiptIcon } from '@phosphor-icons/react';
import type { OwnerMenu, OwnerRestaurant } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { CopyButton } from '../../../components/CopyButton';
import { PageHeader } from '../../../components/PageHeader';
import { Skeleton } from '../../../components/Skeleton';
import { fill, useCopy } from '../../../lib/copy';
import { formatDate } from '../../../lib/format';
import { BranchPicker, useBranchScope, usePageBranch } from '../../branches/BranchScope';
import { useBranchList, useOwnerBranch, useWorkspace } from '../../branches/workspace';
import { reservationStatusOption } from '../tables/ReservationDialog';
import { TablesFloor } from '../tables/TablesFloor';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { accessDaysLeft, accessStatusName, PLAN_NAMES } from '../access';
import { useOrdersLive } from '../orders/live';
import { menuQrUrl } from '../qr-codes/qr-url';
import { UPCOMING_DAYS, useMenuQuery, useRestaurant, useUpcomingReservationsQuery } from '../queries';
import { ServicesCard, SetupPrompt } from '../../services/ServicesCard';
import { OverviewDashboard, PeriodTabs, useOverviewPeriod } from './OverviewDashboard';
import './overview.css';
import { useNewReviewsCount } from '../../reviews/badge';

/** The restaurant at a glance: what needs doing now, the period's figures and charts, then the floor and the rest. */
export function OverviewPage() {
  const { text, language } = useLanguage();
  usePageTitle('الرئيسية', 'Overview');
  const restaurant = useRestaurant();
  const menu = useMenuQuery();
  const { service } = useWorkspace();
  const [period, setPeriod] = useOverviewPeriod();
  // Restaurants without Bilhanah's menu (their own QR menu, or none) get no menu cards; without ordering, no sales.
  const hasMenu = service('DIGITAL_MENU');
  const sells = service('QR_ORDERING');
  return <div className="page overview">
    <PageHeader title={<bdi>{restaurant.name}</bdi>}
      description={formatDate(new Date().toISOString(), language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      actions={<>
        {sells && <PeriodTabs value={period} onChange={setPeriod} />}
        {hasMenu && <a className="button button-secondary" href={restaurant.publicUrl} target="_blank" rel="noreferrer"><ArrowSquareOutIcon size={18} aria-hidden="true" />{text('معاينة المنيو', 'Preview menu')}</a>}
      </>} />
    <SetupPrompt restaurant={restaurant} />
    <WaitingOrders restaurant={restaurant} />
    <AccessNotice restaurant={restaurant} />
    {sells && <OverviewDashboard period={period} />}
    <div className="overview-layout">
      <div className="overview-main">
        {restaurant.ordering.included && <OverviewFloor />}
        {hasMenu && menu.data && <Checklist restaurant={restaurant} menu={menu.data} />}
        {!hasMenu && <ServicesCard />}
        {!sells && hasMenu && menu.data && <section className="card figures"><MenuFigures menu={menu.data} /></section>}
      </div>
      <div className="overview-side">
        <UpcomingReservations />
        <ReviewsCard restaurant={restaurant} />
        {hasMenu && <MenuLink restaurant={restaurant} />}
        <Plan restaurant={restaurant} />
      </div>
    </div>
  </div>;
}

/** The floor of the branch being worked on; with every branch selected, a branch picker on the card. */
function OverviewFloor() {
  const t = useCopy();
  const page = usePageBranch();
  const branch = useOwnerBranch(page.branchId);
  const multi = useBranchList().branches.filter(entry => entry.isActive).length > 1;
  if (!page.branchId) return null;
  return <TablesFloor branchId={page.branchId} title={multi && branch ? fill(t.tablesBranch.floorTitle, { name: branch.name }) : undefined}
    picker={page.needsPicker ? <BranchPicker value={page.branchId} onChange={page.pick} /> : undefined} />;
}

/** The next pending and confirmed bookings (this branch, or every branch), with a way to the reservations. */
function UpcomingReservations() {
  const { text, language, number } = useLanguage();
  const { can } = useWorkspace();
  const scope = useBranchScope();
  const allowed = can('reservations.view');
  const upcoming = useUpcomingReservationsQuery(scope.branch?.id ?? null, allowed);
  if (!allowed) return null;
  const shown = upcoming.data?.slice(0, 5) ?? [];
  return <section className="card section overview-card" aria-labelledby="upcoming-title" data-testid="overview-reservations">
    <div className="section-head">
      <h2 id="upcoming-title">{text('الحجوزات الجاية', 'Upcoming reservations')}</h2>
      <p>{upcoming.data ? text(`${number(upcoming.data.length)} في الـ${number(UPCOMING_DAYS)} أيام الجاية`, `${upcoming.data.length} in the next ${UPCOMING_DAYS} days`) : '\u00a0'}</p>
    </div>
    {upcoming.isPending && <div className="overview-bookings" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} height={44} />)}</div>}
    {upcoming.isError && <p className="muted">{text('مقدرناش نجيب الحجوزات دلوقتي.', 'Could not load reservations right now.')}</p>}
    {upcoming.data && (shown.length === 0
      ? <p className="muted">{text('مفيش حجوزات جاية.', 'No upcoming reservations.')}</p>
      : <ul className="overview-bookings">{shown.map(entry => {
        const option = reservationStatusOption(entry.status);
        return <li key={entry.id} data-testid="overview-reservation">
          <time dateTime={entry.reservedAt}>{formatDate(entry.reservedAt, language, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</time>
          <span><strong><bdi>{entry.customerName}</bdi></strong>
            <small>{text(`${number(entry.guests)} أفراد`, `${entry.guests} guests`)} · {entry.tableLabel ? <bdi>{entry.tableLabel}</bdi> : text('من غير ترابيزة', 'No table')}{scope.multi && !scope.branch && scope.nameOf(entry.branchId) ? <> · <bdi>{scope.nameOf(entry.branchId)}</bdi></> : null}</small></span>
          <span className={`reservation-pill is-${entry.status.toLowerCase()}`}>{text(option.ar, option.en)}</span>
        </li>;
      })}</ul>)}
    <Link className="link-action" to="/tables"><CalendarBlankIcon size={16} aria-hidden="true" />{text('كل الحجوزات', 'All reservations')}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>
  </section>;
}

/** Diners' reviews that arrived since the inbox was last opened (also the way in on phones). */
function ReviewsCard({ restaurant }: { restaurant: OwnerRestaurant }) {
  const { text, count: counted } = useLanguage();
  const { can } = useWorkspace();
  const enabled = Boolean(restaurant.access.features.reviews) && can('reviews.view');
  const { count, capped } = useNewReviewsCount(enabled);
  if (!enabled) return null;
  return <section className="card section overview-card" aria-labelledby="reviews-card-title" data-testid="overview-reviews">
    <div className="section-head">
      <h2 id="reviews-card-title">{text('آراء الزباين', 'Diners’ reviews')}</h2>
      <p>{count > 0
        ? `${capped ? '+' : ''}${counted(count, [{ one: 'تقييم جديد من آخر مرة', two: 'تقييمين جداد من آخر مرة', few: '{n} تقييمات جديدة من آخر مرة', many: '{n} تقييم جديد من آخر مرة' }, { one: '{n} new review since you last looked', other: '{n} new reviews since you last looked' }])}`
        : text('مفيش تقييمات جديدة من آخر مرة.', 'No new reviews since you last looked.')}</p>
    </div>
    <Link className="link-action" to="/reviews">{text('افتح التقييمات', 'Open reviews')}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>
  </section>;
}

/** New orders nobody has accepted yet: the most urgent thing on the page. */
function WaitingOrders({ restaurant }: { restaurant: OwnerRestaurant }) {
  const { text, count } = useLanguage();
  const { newCount } = useOrdersLive();
  if (!restaurant.ordering.included || newCount <= 0) return null;
  return <Link to="/orders" className="overview-orders" data-testid="overview-new-orders">
    <ReceiptIcon size={22} weight="bold" aria-hidden="true" />
    <span>
      <strong>{count(newCount, [{ one: 'طلب جديد مستني', two: 'طلبين جداد مستنيين', few: '{n} طلبات جديدة مستنية', many: '{n} طلب جديد مستني' }, { one: '{n} order waiting', other: '{n} orders waiting' }])}</strong>
      <small>{text('اقبلها من لوحة الطلبات', 'Accept them on the order board')}</small>
    </span>
    <ArrowLeftIcon size={18} className="directional" aria-hidden="true" />
  </Link>;
}

function AccessNotice({ restaurant }: { restaurant: OwnerRestaurant }) {
  const { text } = useLanguage();
  if (restaurant.access.status === 'INACTIVE') {
    return <Alert kind="warning" live={false} title={text('المنيو العام متوقف مؤقتًا', 'Your public menu is paused')}
      actions={<Link className="link-action" to="/subscription">{text('ادفع واشترك', 'Pay and subscribe')}</Link>}>
      {text('اشتراكك مش فعّال، فالزباين بيشوفوا إن المنيو "مش متاح مؤقتًا". تقدر تكمّل تعديل المنيو عادي، وكل حاجة هترجع تظهر أول ما الاشتراك يتفعّل.',
        'Your subscription isn’t active, so diners see the menu as “temporarily unavailable”. You can keep editing; everything goes live again as soon as your subscription is active.')}
    </Alert>;
  }
  if (restaurant.access.status === 'SUSPENDED') {
    return <Alert kind="error" live={false} title={text('المطعم موقوف', 'Your restaurant is suspended')}>
      {text('المنيو العام مش ظاهر والتعديل متوقف. تواصل مع دعم بالهنا.', 'The public menu is hidden and editing is paused. Please contact Bilhanah support.')}
    </Alert>;
  }
  return null;
}

export function menuStats(menu: OwnerMenu) {
  const items = menu.categories.flatMap(category => category.items);
  return {
    categories: menu.categories.length,
    items: items.length,
    soldOut: items.filter(item => !item.isAvailable).length,
    hidden: items.filter(item => !item.isVisible).length + menu.categories.filter(category => !category.isVisible).length,
    withPhotos: items.filter(item => item.image).length,
  };
}

function MenuFigures({ menu }: { menu: OwnerMenu }) {
  const { text, number } = useLanguage();
  const stats = menuStats(menu);
  const figures = [
    { key: 'categories', value: stats.categories, label: text('الأقسام', 'Categories') },
    { key: 'items', value: stats.items, label: text('الأصناف', 'Items') },
    { key: 'sold-out', value: stats.soldOut, label: text('خلصان', 'Sold out'), warn: stats.soldOut > 0 },
    { key: 'hidden', value: stats.hidden, label: text('مخفي', 'Hidden') },
  ];
  return <div className="figures-group">
    <div className="figures-head">
      <h3>{text('المنيو', 'Menu')}</h3>
      <Link className="link-action" to="/menu">{text('افتح المنيو', 'Open the menu')}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>
    </div>
    <dl className="figure-list">
      {figures.map(figure => <div key={figure.key} className={figure.warn ? 'is-warning' : ''} data-testid={`stat-${figure.key}`}>
        <dt>{figure.label}</dt><dd>{number(figure.value)}</dd>
      </div>)}
    </dl>
  </div>;
}

function Checklist({ restaurant, menu }: { restaurant: OwnerRestaurant; menu: OwnerMenu }) {
  const { text, count, number } = useLanguage();
  const stats = menuStats(menu);
  const steps = [
    { done: stats.categories > 0, to: '/menu', label: text('أضف أول قسم في المنيو', 'Add your first menu category') },
    { done: stats.items >= 3, to: '/menu', label: text('أضف ٣ أصناف على الأقل', 'Add at least 3 items') },
    { done: stats.withPhotos > 0, to: '/menu', label: text('أضف صور للأصناف', 'Add photos to your dishes') },
    { done: !!restaurant.logo, to: '/settings/branding', label: text('ارفع لوجو المطعم', 'Upload your logo') },
    { done: !!restaurant.openingHours, to: '/settings/hours', label: text('حدد مواعيد الشغل', 'Set your opening hours') },
  ];
  const remaining = steps.filter(step => !step.done).length;
  if (remaining === 0) return null;
  return <section className="card section overview-card" aria-labelledby="checklist-title">
    <div className="section-head">
      <h2 id="checklist-title">{text('جهّز منيو مطعمك', 'Get your menu ready')}</h2>
      <p>{text(`فاضل ${count(remaining, 'step')}`, `${count(remaining, 'step')} left`)}</p>
    </div>
    <ul className="checklist">
      {steps.filter(step => !step.done).map(step => <li key={step.label}>
        <Link className="checklist-row" to={step.to}><CircleIcon size={20} aria-hidden="true" /><span>{step.label}</span><ArrowLeftIcon size={16} className="directional" aria-hidden="true" /></Link>
      </li>)}
    </ul>
    {remaining < steps.length && <p className="checklist-done"><CheckCircleIcon size={18} weight="fill" aria-hidden="true" />{text(`خلّصت ${number(steps.length - remaining)} من ${number(steps.length)}`, `${steps.length - remaining} of ${steps.length} done`)}</p>}
  </section>;
}

function MenuLink({ restaurant }: { restaurant: OwnerRestaurant }) {
  const { text } = useLanguage();
  return <section className="card section overview-card" aria-labelledby="link-title">
    <div className="section-head"><h2 id="link-title">{text('لينك المنيو', 'Menu link')}</h2></div>
    <div className="link-body">
      <div className="link-text">
        <a className="public-url ltr" href={restaurant.publicUrl} target="_blank" rel="noreferrer">{restaurant.publicUrl.replace(/^https?:\/\//, '')}</a>
        <p className="muted">{text('ابعته واتساب أو حطه في البايو.', 'Send it on WhatsApp or put it in your bio.')}</p>
        <div className="form-actions">
          <CopyButton value={restaurant.publicUrl} label={text('انسخ اللينك', 'Copy link')} />
          <Link className="button button-ghost button-small" to="/qr-codes">{text('كود QR للطباعة', 'Printable QR code')}</Link>
        </div>
      </div>
      <Link to="/qr-codes" className="link-qr" tabIndex={-1} aria-hidden="true">
        <QRCodeSVG value={menuQrUrl(restaurant.publicUrl)} size={88} fgColor="#35172f" bgColor="#ffffff" marginSize={2} />
      </Link>
    </div>
  </section>;
}

function Plan({ restaurant }: { restaurant: OwnerRestaurant }) {
  const { text, count, language } = useLanguage();
  const { access } = restaurant;
  const days = accessDaysLeft(access);
  const end = access.status === 'TRIAL' ? access.trialEndsAt : access.currentPeriodEndsAt;
  return <section className="card section overview-card plan-card" aria-labelledby="plan-title">
    <div className="section-head">
      <h2 id="plan-title">{text('الاشتراك', 'Subscription')}</h2>
      <span className={`plan-status access-${access.status.toLowerCase()}`}>{accessStatusName(access.status, text)}</span>
    </div>
    <p className="plan-name">{access.planCode ? text(PLAN_NAMES[access.planCode][0], PLAN_NAMES[access.planCode][1]) : text('من غير باقة', 'No plan')}</p>
    {days !== null && access.status !== 'INACTIVE' && <p className="plan-days">
      <strong>{count(days, 'day')}</strong> {text(days === 1 ? 'فاضل' : 'فاضلين', 'left')}
    </p>}
    {end && access.status !== 'INACTIVE' && <p className="muted">{access.status === 'TRIAL' ? text('التجربة بتنتهي يوم', 'Trial ends on') : text('الاشتراك ساري لحد', 'Active until')} {formatDate(end, language, { dateStyle: 'long' })}</p>}
    {access.status === 'INACTIVE' && <p className="muted">{text('التعديل متاح، والمنيو هيرجع يظهر أول ما تشترك.', 'Editing is available; your menu goes live again once you subscribe.')}</p>}
    <Link className="link-action" to="/subscription">{access.status === 'PAID' ? text('جدّد اشتراكك', 'Renew your subscription') : text('ادفع واشترك', 'Pay and subscribe')}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>
  </section>;
}
