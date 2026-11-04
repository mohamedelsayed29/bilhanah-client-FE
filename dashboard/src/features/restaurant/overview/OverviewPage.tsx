import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeftIcon, ArrowSquareOutIcon, CheckCircleIcon, CircleIcon, PencilSimpleLineIcon, ReceiptIcon } from '@phosphor-icons/react';
import type { OwnerMenu, OwnerRestaurant } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { CopyButton } from '../../../components/CopyButton';
import { PageHeader } from '../../../components/PageHeader';
import { Skeleton } from '../../../components/Skeleton';
import { fill, useCopy } from '../../../lib/copy';
import { formatDate } from '../../../lib/format';
import { BranchPicker, usePageBranch } from '../../branches/BranchScope';
import { useBranchList, useOwnerBranch } from '../../branches/workspace';
import { TablesFloor } from '../tables/TablesFloor';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { accessDaysLeft, accessStatusName, PLAN_NAMES } from '../access';
import { useOrdersLive } from '../orders/live';
import { menuQrUrl } from '../qr-codes/qr-url';
import { useMenuQuery, useRestaurant } from '../queries';

// Loaded on demand, so the first bundle stays small (the overview is not lazily routed).
const InsightsSummary = lazy(async () => ({ default: (await import('../insights/InsightsSummary')).InsightsSummary }));

/** The restaurant at a glance: what needs doing now, this week's numbers, the menu link and the plan. */
export function OverviewPage() {
  const { text, language } = useLanguage();
  usePageTitle('الرئيسية', 'Overview');
  const restaurant = useRestaurant();
  const menu = useMenuQuery();
  return <div className="page overview">
    <PageHeader title={<bdi>{restaurant.name}</bdi>}
      description={<>{formatDate(new Date().toISOString(), language, { weekday: 'long', day: 'numeric', month: 'long' })} · {text('ده ملخص مطعمك النهارده.', 'Here is your restaurant today.')}</>}
      actions={<>
        <a className="button button-secondary" href={restaurant.publicUrl} target="_blank" rel="noreferrer"><ArrowSquareOutIcon size={18} aria-hidden="true" />{text('معاينة المنيو', 'Preview menu')}</a>
        <Link className="button button-primary" to="/menu"><PencilSimpleLineIcon size={18} aria-hidden="true" />{text('عدّل المنيو', 'Edit menu')}</Link>
      </>} />
    <WaitingOrders restaurant={restaurant} />
    <AccessNotice restaurant={restaurant} />
    <div className="overview-layout">
      <div className="overview-main">
        <section className="card figures" aria-labelledby="figures-title">
          <h2 id="figures-title" className="visually-hidden">{text('الأرقام', 'Figures')}</h2>
          <Suspense fallback={<div className="figures-group" aria-hidden="true"><Skeleton width={120} height={16} /><Skeleton width={220} height={30} /></div>}><InsightsSummary /></Suspense>
          {menu.data ? <MenuFigures menu={menu.data} /> : <div className="figures-group" aria-hidden="true"><Skeleton width={80} height={16} /><Skeleton width={260} height={30} /></div>}
        </section>
        {restaurant.ordering.included && <OverviewFloor />}
        {menu.data && <Checklist restaurant={restaurant} menu={menu.data} />}
      </div>
      <div className="overview-side">
        <BranchesCard />
        <MenuLink restaurant={restaurant} />
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

/** The restaurant's branches and the plan's allowance, with a way to the Branches page. */
function BranchesCard() {
  const t = useCopy();
  const { number, count } = useLanguage();
  const list = useBranchList();
  const active = list.branches.filter(branch => branch.isActive);
  return <section className="card section overview-card" aria-labelledby="branches-card-title" data-testid="overview-branches">
    <div className="section-head">
      <h2 id="branches-card-title">{t.branches.title}</h2>
      <p>{fill(t.branches.usage, { used: number(list.used), limit: count(list.limit, 'branch') })}</p>
    </div>
    {active.length > 1 && <ul className="overview-branches">
      {active.map(branch => <li key={branch.id}>
        <bdi>{branch.name}</bdi>
        {branch.isMain && <span className="badge badge-muted">{t.scope.main}</span>}
        <span className="muted small">{fill(t.branches.activeOrdersShort, { count: number(branch.activeOrders) })}</span>
      </li>)}
    </ul>}
    {active.length <= 1 && <p className="muted">{t.branches.single}</p>}
    <Link className="link-action" to="/branches">{t.branches.manage}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>
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
        <QRCodeSVG value={menuQrUrl(restaurant.publicUrl)} size={88} fgColor="#04352f" bgColor="#ffffff" marginSize={2} />
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
