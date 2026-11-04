import { Fragment, useEffect, useMemo, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ArrowSquareOutIcon, BellIcon, BellRingingIcon, SparkleIcon, ChartBarIcon, CreditCardIcon, ForkKnifeIcon, GearSixIcon, HouseIcon, QrCodeIcon, UserCheckIcon, ReceiptIcon, SignOutIcon, StorefrontIcon, TableIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { type OwnerRestaurant, type Permission, ROLE_PERMISSIONS } from '@bilhanah/contracts';
import { Brand } from '../components/Brand';
import { ErrorBoundary, ErrorPanel } from '../components/ErrorBoundary';
import { LanguageToggle } from '../components/LanguageToggle';
import { useSignOut } from '../components/SignOutDialog';
import { Splash } from '../app/providers/SessionBootstrap';
import { BranchScopeProvider, BranchSwitcher } from '../features/branches/BranchScope';
import { toOption } from '../features/branches/scope';
import { ownerWorkspace, useWorkspace, WorkspaceProvider } from '../features/branches/workspace';
import { DeniedNotice } from '../app/router/permission-guard';
import { LiveForScope, useOrdersLive } from '../features/restaurant/orders/live';
import { ServiceRequestsCount } from '../features/restaurant/service/ServiceCount';
import { useBranchesQuery } from '../features/restaurant/queries';
import { fallInto } from '../lib/drop-motion';
import { useLanguage } from '../lib/language';
import { useSession } from '../lib/session';
import { useRouteFocus } from '../lib/use-route-focus';
import { SidebarDrawer } from './SidebarDrawer';

/** `phone`: also in the bottom tab bar (five fit at 390 px; insights, the QR code and subscription are linked from the overview). */
/** `more`: only in the ⋯ panel, kept off the rail so it holds the eight pages used most. */
/** `need`: shown only to accounts holding one of these permissions (the route checks the same). */
type NavItem = { to: string; end?: boolean; icon: Icon; ar: string; en: string; need: Permission[]; phone?: boolean; orders?: boolean; service?: boolean; more?: boolean };
/** The sidebar in two labelled groups: the day's work, then the restaurant's setup. */
const ALL_NAV_GROUPS: { ar: string; en: string; items: NavItem[] }[] = [
  { ar: 'الشغل اليومي', en: 'Daily work', items: [
    { to: '/', end: true, icon: HouseIcon, ar: 'الرئيسية', en: 'Overview', need: ['dashboard.view'], phone: true },
    { to: '/orders', icon: ReceiptIcon, ar: 'الطلبات', en: 'Orders', need: ['orders.view'], phone: true, orders: true },
    { to: '/service', icon: BellRingingIcon, ar: 'طلبات الخدمة', en: 'Service requests', need: ['service.view'], service: true },
    { to: '/tables', icon: TableIcon, ar: 'الطاولات', en: 'Tables', need: ['tables.view'], phone: true },
    { to: '/insights', icon: ChartBarIcon, ar: 'الإحصائيات', en: 'Insights', need: ['analytics.view'] },
    { to: '/attendance', icon: UserCheckIcon, ar: 'الحضور', en: 'Attendance', need: ['attendance.view', 'attendance.settings'], more: true },
  ] },
  { ar: 'إعداد المطعم', en: 'Your restaurant', items: [
    { to: '/menu', icon: ForkKnifeIcon, ar: 'المنيو', en: 'Menu', need: ['menu.manage'], phone: true },
    { to: '/branches', icon: StorefrontIcon, ar: 'الفروع', en: 'Branches', need: ['branches.manage', 'menu.branch'], more: true },
    { to: '/recommendations', icon: SparkleIcon, ar: 'الترشيحات', en: 'Recommendations', need: ['promotions.manage'], more: true },
    { to: '/qr-codes', icon: QrCodeIcon, ar: 'كود QR', en: 'QR code', need: ['settings.manage'] },
    { to: '/subscription', icon: CreditCardIcon, ar: 'الاشتراك', en: 'Subscription', need: ['billing.manage'], more: true },
    { to: '/settings', icon: GearSixIcon, ar: 'الإعدادات', en: 'Settings', need: ['settings.manage', 'staff.view'], phone: true },
  ] },
];
const NAV = ALL_NAV_GROUPS.flatMap(group => group.items);
/** The bottom tab bar keeps its familiar order. */
const ALL_PHONE_NAV = ['/', '/orders', '/menu', '/tables', '/settings'].map(to => NAV.find(item => item.to === to)!);

/** Orders waiting to be accepted, on the Orders navigation item. */
function NewOrdersCount({ testId = 'new-orders-count' }: { testId?: string }) {
  const { number, count } = useLanguage();
  const { newCount } = useOrdersLive();
  if (newCount <= 0) return null;
  return <span className="nav-count" data-testid={testId}>
    <span aria-hidden="true">{number(newCount)}</span>
    <span className="visually-hidden">({count(newCount, [{ one: 'طلب جديد', two: 'طلبين جداد', few: '{n} طلبات جديدة', many: '{n} طلب جديد' }, { one: '{n} new', other: '{n} new' }])})</span>
  </span>;
}

export function RestaurantAvatar({ restaurant, size = 40 }: { restaurant: OwnerRestaurant; size?: number }) {
  const logo = restaurant.logo?.sources[0]?.url ?? restaurant.logo?.url;
  return <span className="restaurant-avatar" style={{ width: size, height: size, background: restaurant.brandColor ?? undefined }} aria-hidden="true">
    {logo ? <img src={logo} alt="" /> : restaurant.name.trim().charAt(0)}
  </span>;
}

/**
 * Owner shell: sidebar on desktop; top bar and bottom tab bar on phones. The order board stays live on every page.
 * The branches load with the shell: every page works on the branch chosen in the header (or all of them).
 */
export function OwnerLayout({ restaurant }: { restaurant: OwnerRestaurant }) {
  const session = useSession();
  const branches = useBranchesQuery();
  const options = useMemo(() => branches.data?.branches.map(toOption) ?? [], [branches.data]);
  // The owner's permissions as the server sent them (every one, today); the API checks them again.
  const permissions = (session.status === 'authenticated' && session.user.permissions?.length ? session.user.permissions : ROLE_PERMISSIONS.OWNER);
  const workspace = useMemo(() => ownerWorkspace({
    name: restaurant.name, subdomain: restaurant.subdomain, brandColor: restaurant.brandColor,
    logoUrl: restaurant.logo?.sources[0]?.url ?? restaurant.logo?.url ?? null, orderPrepMinutes: restaurant.orderPrepMinutes,
  }, permissions, NAV.find(item => item.need.some(permission => permissions.includes(permission)))?.to ?? '/settings/account'),
  [restaurant.name, restaurant.subdomain, restaurant.brandColor, restaurant.logo, restaurant.orderPrepMinutes, permissions]);
  if (branches.isPending) return <Splash />;
  if (branches.isError) return <main className="state-page"><ErrorPanel error={branches.error} onRetry={() => void branches.refetch()} /></main>;
  const userId = session.status === 'authenticated' ? session.user.id : 'owner';
  return <WorkspaceProvider value={workspace}>
    <BranchScopeProvider branches={options} storageKey={`bilhanah:branch:v1:${userId}`}>
      <LiveForScope enabled={restaurant.ordering.included} serviceRequests><OwnerShell restaurant={restaurant} /></LiveForScope>
    </BranchScopeProvider>
  </WorkspaceProvider>;
}


function OwnerShell({ restaurant }: { restaurant: OwnerRestaurant }) {
  const { text } = useLanguage();
  const { can } = useWorkspace();
  const allowed = (item: NavItem) => item.need.some(can);
  const NAV_GROUPS = ALL_NAV_GROUPS.map(group => ({ ...group, items: group.items.filter(allowed) })).filter(group => group.items.length > 0);
  const NAV = NAV_GROUPS.flatMap(group => group.items);
  const PHONE_NAV = ALL_PHONE_NAV.filter(allowed);
  const { pathname } = useLocation();
  useRouteFocus();
  // A new order falls like a drop onto Orders: in the sidebar, or in the tab bar on phones.
  const { arrivals, serviceArrivals } = useOrdersLive();
  const ordersLinks = useRef<{ sidebar: HTMLAnchorElement | null; tabbar: HTMLAnchorElement | null }>({ sidebar: null, tabbar: null });
  const serviceLink = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    if (arrivals === 0) return;
    const { sidebar, tabbar } = ordersLinks.current;
    fallInto(sidebar?.getClientRects().length ? sidebar : tabbar);
  }, [arrivals]);
  // A table asking for service falls onto its navigation item the same way.
  useEffect(() => { if (serviceArrivals > 0) fallInto(serviceLink.current?.getClientRects().length ? serviceLink.current : null); }, [serviceArrivals]);
  const signOut = useSignOut(text('هتخرج من حسابك على الجهاز ده، والطلبات الجديدة مش هتوصلك هنا لحد ما تدخل تاني.', 'You will be signed out on this device, and new orders will not reach it until you sign back in.'));
  return <div className="owner-shell">
    <a className="skip-link" href="#main-content">{text('انتقل للمحتوى', 'Skip to content')}</a>
    <div className="sidebar-column"><aside className="sidebar">
      <div className="sidebar-brand"><Brand mark /></div>
      <nav aria-label={text('القائمة الرئيسية', 'Main navigation')} className="sidebar-nav">
        {NAV_GROUPS.map(group => <Fragment key={group.en}>
          <p className="sidebar-group">{text(group.ar, group.en)}</p>
          {group.items.filter(item => !item.more).map(item => <NavLink key={item.to} to={item.to} end={item.end} className="sidebar-link"
            ref={item.orders ? element => { ordersLinks.current.sidebar = element; } : item.service ? element => { serviceLink.current = element; } : undefined}>
            <span className="sidebar-icon"><item.icon size={21} aria-hidden="true" /></span><span className="sidebar-label">{text(item.ar, item.en)}</span>
            {item.orders && <NewOrdersCount />}
            {item.service && <ServiceRequestsCount />}
          </NavLink>)}
        </Fragment>)}
        {/* Sign-out, the public menu and the language live in the panel this opens, with every page by name. */}
        <SidebarDrawer
          active={NAV.some(item => item.more && pathname.startsWith(item.to))}
          groups={NAV_GROUPS.map(group => ({ ...group, items: group.items.map(item => ({ ...item, badge: item.orders ? <NewOrdersCount testId="drawer-new-orders" /> : item.service ? <ServiceRequestsCount testId="drawer-service-count" /> : undefined })) }))}
          header={<><RestaurantAvatar restaurant={restaurant} size={40} /><span><strong><bdi>{restaurant.name}</bdi></strong><small>{text('لوحة التحكم', 'Dashboard')}</small></span></>}
          publicUrl={restaurant.publicUrl}
          onSignOut={signOut.ask}
        />
      </nav>
      <div className="sidebar-footer">
        <a className="sidebar-round" href={restaurant.publicUrl} target="_blank" rel="noreferrer"
          aria-label={text(`شوف المنيو زي الزبون: ${restaurant.publicUrl.replace(/^https?:\/\//, '')}`, `View your public menu: ${restaurant.publicUrl.replace(/^https?:\/\//, '')}`)}
          title={text('شوف المنيو زي الزبون', 'View your public menu')}>
          <ArrowSquareOutIcon size={19} weight="bold" aria-hidden="true" />
        </a>
        {restaurant.ordering.included && <NavLink to="/orders" className="sidebar-round" title={text('الطلبات الجديدة', 'New orders')}>
          <BellIcon size={19} weight="bold" aria-hidden="true" /><span className="visually-hidden">{text('الطلبات الجديدة', 'New orders')}</span><NewOrdersCount testId="sidebar-new-orders" />
        </NavLink>}
        <LanguageToggle round />
      </div>
    </aside></div>
    <header className="topbar">
      <div className="topbar-restaurant">
        <RestaurantAvatar restaurant={restaurant} size={32} />
        <strong><bdi>{restaurant.name}</bdi></strong>
      </div>
      <div className="topbar-actions">
        <LanguageToggle plain />
        <button type="button" className="icon-button" onClick={signOut.ask} aria-label={text('تسجيل الخروج', 'Sign out')}><SignOutIcon size={21} className="directional" /></button>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="owner-main">
      <div className="owner-content">
        <BranchSwitcher className="owner-branch-switch" />
        <DeniedNotice />
        <ErrorBoundary resetKey={pathname}><Outlet /></ErrorBoundary>
      </div>
    </main>
    <nav className="tabbar" aria-label={text('التنقل', 'Navigation')}>
      {PHONE_NAV.map(item => <NavLink key={item.to} to={item.to} end={item.end} className="tabbar-link" ref={item.orders ? element => { ordersLinks.current.tabbar = element; } : undefined}>
        {({ isActive }) => <>
          <span className="tabbar-icon"><item.icon size={22} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />{item.orders && <NewOrdersCount />}</span>
          <span>{text(item.ar, item.en)}</span>
        </>}
      </NavLink>)}
    </nav>
    {signOut.dialog}
  </div>;
}
