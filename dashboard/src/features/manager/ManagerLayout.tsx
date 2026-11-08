import { Fragment, useEffect, useMemo, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { LifebuoyIcon, CashRegisterIcon, ChartBarIcon, ClockIcon, ForkKnifeIcon, UserCheckIcon, GearSixIcon, ReceiptIcon, SignOutIcon, StarHalfIcon, StorefrontIcon, TableIcon, BellRingingIcon, UsersThreeIcon, WarehouseIcon, GiftIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { ALL_SERVICES_ON, type KitchenContext, type Permission, type RestaurantServiceKey, ROLE_LABELS, serviceWorks } from '@bilhanah/contracts';
import { Brand } from '../../components/Brand';
import { ErrorBoundary, ErrorPanel } from '../../components/ErrorBoundary';
import { LanguageToggle } from '../../components/LanguageToggle';
import { useSignOut } from '../../components/SignOutDialog';
import { Splash } from '../../app/providers/SessionBootstrap';
import { fallInto } from '../../lib/drop-motion';
import { useCopy } from '../../lib/copy';
import { useLanguage } from '../../lib/language';
import { useRouteFocus } from '../../lib/use-route-focus';
import { BranchSwitcher, useBranchScope } from '../branches/BranchScope';
import { managerWorkspace, useWorkspace, WorkspaceProvider } from '../branches/workspace';
import { DeniedNotice } from '../../app/router/permission-guard';
import { StaffBranchScope, useKitchenContextQuery } from '../kitchen/KitchenLayout';
import { LiveForScope, useOrdersLive } from '../restaurant/orders/live';
import { ServiceRequestsCount } from '../restaurant/service/ServiceCount';
import { SupportWidget } from '../support/SupportWidget';
import { useBranchesQuery } from '../restaurant/queries';
import { INVENTORY_SECTION, inventoryOffered } from '../inventory/access';
import { REVIEWS_SECTION, reviewsOffered } from '../reviews/access';
import { NewReviewsCount } from '../reviews/badge';

/** `need`: shown only with one of these permissions (the route checks the same; the API again). */
/** `always`: every staff account (their own attendance). */
/** `inventory` / `reviews`: also needs the plan to include it (KitchenContext.features). */
/** `needs`: shown only while the restaurant has that service on (KitchenContext.services). */
type NavItem = { to: string; end?: boolean; icon: Icon; label: (t: ReturnType<typeof useCopy>, text: (ar: string, en: string) => string) => string; need: Permission[]; always?: boolean; orders?: boolean; service?: boolean; inventory?: boolean; reviews?: boolean; needs?: RestaurantServiceKey };
const ALL_NAV_GROUPS: { label: (t: ReturnType<typeof useCopy>) => string; items: NavItem[] }[] = [
  { label: t => t.manager.groupDaily, items: [
    { to: '/manager', end: true, icon: ReceiptIcon, label: t => t.manager.navOrders, need: ['orders.view'], orders: true, needs: 'QR_ORDERING' },
    { to: '/manager/service', icon: BellRingingIcon, label: t => t.manager.navService, need: ['service.view'], service: true, needs: 'QR_ORDERING' },
    { to: '/manager/tables', icon: TableIcon, label: t => t.manager.navTables, need: ['tables.view', 'reservations.view'] },
    { to: '/manager/reviews', icon: StarHalfIcon, label: (_t, text) => text('آراء الزباين', 'Reviews'), need: REVIEWS_SECTION, reviews: true },
    { to: '/manager/inventory', icon: WarehouseIcon, label: (_t, text) => text('المخزون', 'Inventory'), need: INVENTORY_SECTION, inventory: true },
    { to: '/manager/pos', icon: CashRegisterIcon, label: (_t, text) => text('الكاشير (POS)', 'Point of sale'), need: ['pos.use', 'pos.settings'] },
    { to: '/manager/loyalty', icon: GiftIcon, label: (_t, text) => text('برنامج الولاء', 'Loyalty'), need: ['loyalty.view', 'loyalty.settings'], needs: 'LOYALTY' },
    { to: '/manager/cash', icon: CashRegisterIcon, label: t => t.manager.navCash, need: ['cash.operate', 'cash.view', 'cash.approve', 'cash.settings'], needs: 'CASH_DRAWER' },
    { to: '/manager/reports', icon: ChartBarIcon, label: (_t, text) => text('التقارير', 'Reports'), need: ['analytics.financial'] },
    { to: '/manager/insights', icon: ChartBarIcon, label: t => t.manager.navInsights, need: ['analytics.view'] },
    { to: '/manager/attendance', icon: UserCheckIcon, label: t => t.manager.navAttendance, need: ['attendance.view'], needs: 'ATTENDANCE' },
    { to: '/manager/my-attendance', icon: ClockIcon, label: t => t.manager.navMyAttendance, need: [], always: true, needs: 'ATTENDANCE' },
  ] },
  { label: t => t.manager.groupSetup, items: [
    { to: '/manager/menu', icon: ForkKnifeIcon, label: t => t.manager.navMenu, need: ['menu.view', 'menu.branch', 'menu.availability'], needs: 'DIGITAL_MENU' },
    { to: '/manager/staff', icon: UsersThreeIcon, label: t => t.manager.navStaff, need: ['staff.view'] },
    { to: '/manager/settings', icon: GearSixIcon, label: t => t.manager.navSettings, need: ['settings.operational'] },
  ] },
];
const ALL_NAV = ALL_NAV_GROUPS.flatMap(group => group.items);

/**
 * The staff dashboard (managers, cashiers and waiters): the owner's shell, cut down to what the
 * account's permissions allow (orders, floor and tables, service, the branch's menu, staff, its
 * settings and insights). Accounts working at every branch get the branch switcher.
 */
export function ManagerLayout() {
  const context = useKitchenContextQuery();
  // The cashier link (/manager/terminal) shows the POS alone.
  const bare = useLocation().pathname === '/manager/terminal';
  const branches = useBranchesQuery();
  const restaurant = context.data?.restaurant;
  const prep = context.data?.orderPrepMinutes ?? null;
  const role = context.data?.role ?? 'MANAGER';
  const permissions = context.data?.permissions;
  const workspace = useMemo(() => {
    const held = permissions ?? [];
    const services = context.data?.services ?? ALL_SERVICES_ON;
    const home = ALL_NAV.find(item => (!item.needs || serviceWorks(item.needs, services)) && (item.always || item.need.some(permission => held.includes(permission))))?.to ?? '/manager';
    return managerWorkspace({ name: restaurant?.name ?? '', subdomain: restaurant?.subdomain ?? '', logoUrl: null, brandColor: null, orderPrepMinutes: prep }, role, held, home, services);
  }, [restaurant?.name, restaurant?.subdomain, prep, role, permissions, context.data?.services]);
  if (context.isPending || branches.isPending) return <Splash />;
  if (context.isError || branches.isError) {
    const failed = context.isError ? context : branches;
    return <main className="state-page"><ErrorPanel error={failed.error} onRetry={() => void failed.refetch()} /></main>;
  }
  if (context.data.branches.length === 0 || branches.data.branches.every(branch => !branch.isActive)) return <NoBranch />;
  return <WorkspaceProvider value={workspace}>
    <StaffBranchScope context={context.data}>
      <LiveForScope enabled={context.data.ordering.included} serviceRequests={context.data.permissions.includes('service.view')}
        reviews={Boolean(context.data.features.reviews) && context.data.permissions.includes('reviews.view')}>{bare ? <main className="pos-standalone" id="main"><ErrorBoundary><Outlet /></ErrorBoundary></main> : <ManagerShell context={context.data} />}</LiveForScope>
    </StaffBranchScope>
  </WorkspaceProvider>;
}

function NoBranch() {
  const t = useCopy();
  const signOut = useSignOut(t.manager.signOutNote);
  return <main className="state-page"><div className="state-card">
    <span className="empty-state-icon" aria-hidden="true"><StorefrontIcon size={30} /></span>
    <p>{t.manager.noBranch}</p>
    <button type="button" className="button button-secondary" onClick={signOut.ask}><SignOutIcon size={18} className="directional" aria-hidden="true" />{t.common.signOut}</button>
    {signOut.dialog}
  </div></main>;
}

function NewOrdersCount() {
  const { number } = useLanguage();
  const { newCount } = useOrdersLive();
  if (newCount <= 0) return null;
  return <span className="nav-count" data-testid="new-orders-count"><span aria-hidden="true">{number(newCount)}</span></span>;
}

function ManagerShell({ context }: { context: KitchenContext }) {
  const t = useCopy();
  const { text } = useLanguage();
  const { can, service } = useWorkspace();
  const inventory = inventoryOffered(can, context.features);
  const reviews = reviewsOffered(can, context.features);
  const reviewsBadge = reviews && can('reviews.view');
  const NAV_GROUPS = ALL_NAV_GROUPS.map(group => ({ ...group, items: group.items.filter(item => (!item.needs || service(item.needs)) && (item.always || (item.need.some(can) && (!item.inventory || inventory) && (!item.reviews || reviews)))) })).filter(group => group.items.length > 0);
  const NAV = NAV_GROUPS.flatMap(group => group.items);
  const { pathname } = useLocation();
  const scope = useBranchScope();
  useRouteFocus();
  const { arrivals } = useOrdersLive();
  const ordersLinks = useRef<{ sidebar: HTMLAnchorElement | null; tabbar: HTMLAnchorElement | null }>({ sidebar: null, tabbar: null });
  useEffect(() => {
    if (arrivals === 0) return;
    const { sidebar, tabbar } = ordersLinks.current;
    fallInto(sidebar?.getClientRects().length ? sidebar : tabbar);
  }, [arrivals]);
  const signOut = useSignOut(t.manager.signOutNote);
  const branchName = context.branch?.name ?? scope.branch?.name ?? null;
  return <div className="owner-shell manager-shell">
    <a className="skip-link" href="#main-content">{text('انتقل للمحتوى', 'Skip to content')}</a>
    <div className="sidebar-column"><aside className="sidebar">
      <div className="sidebar-brand"><Brand mark /></div>
      <nav aria-label={t.manager.navigation} className="sidebar-nav">
        {NAV_GROUPS.map(group => <Fragment key={group.items[0]!.to}>
          <p className="sidebar-group">{group.label(t)}</p>
          {group.items.map(item => <NavLink key={item.to} to={item.to} end={item.end} className="sidebar-link" ref={item.orders ? element => { ordersLinks.current.sidebar = element; } : undefined}>
            <span className="sidebar-icon"><item.icon size={21} aria-hidden="true" /></span><span className="sidebar-label">{item.label(t, text)}</span>
            {item.orders && <NewOrdersCount />}
            {item.service && <ServiceRequestsCount />}
            {item.reviews && <NewReviewsCount enabled={reviewsBadge} />}
          </NavLink>)}
        </Fragment>)}
        {can('support.use') && <NavLink to="/manager/help" className="sidebar-link sidebar-help" data-testid="sidebar-help">
          <span className="sidebar-icon"><LifebuoyIcon size={21} aria-hidden="true" /></span><span className="sidebar-label">{text('المساعدة والدعم', 'Help & Support')}</span>
        </NavLink>}
        <button type="button" className="sidebar-link sidebar-signout" onClick={signOut.ask}><span className="sidebar-icon"><SignOutIcon size={21} className="directional" aria-hidden="true" /></span><span className="sidebar-label">{t.common.signOut}</span></button>
      </nav>
      <div className="sidebar-footer"><LanguageToggle round /></div>
    </aside></div>
    <header className="topbar">
      <div className="topbar-restaurant">
        <StorefrontIcon size={22} weight="bold" aria-hidden="true" />
        <strong><bdi>{context.restaurant.name}</bdi></strong>
      </div>
      <div className="topbar-actions">
        {can('support.use') && <Link to="/manager/help" className="icon-button" aria-label={text('المساعدة والدعم', 'Help & Support')}><LifebuoyIcon size={21} /></Link>}
        <LanguageToggle plain />
        <button type="button" className="icon-button" onClick={signOut.ask} aria-label={t.common.signOut}><SignOutIcon size={21} className="directional" /></button>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="owner-main">
      <div className="owner-content">
        <div className="manager-context" data-testid="manager-context">
          <p className="manager-place">
            <span className="manager-restaurant"><bdi>{context.restaurant.name}</bdi></span>
            {branchName && !scope.multi && <strong className="manager-branch" data-testid="manager-branch"><bdi>{branchName}</bdi></strong>}
            <span className="badge badge-guava" data-testid="staff-role">{text(...ROLE_LABELS[context.role])}</span>
          </p>
          <BranchSwitcher className="owner-branch-switch" />
        </div>
        <DeniedNotice />
        <ErrorBoundary resetKey={pathname}><Outlet /></ErrorBoundary>
      </div>
    </main>
    <nav className="tabbar" aria-label={t.manager.tabs}>
      {NAV.map(item => <NavLink key={item.to} to={item.to} end={item.end} className="tabbar-link" ref={item.orders ? element => { ordersLinks.current.tabbar = element; } : undefined}>
        {({ isActive }) => <>
          <span className="tabbar-icon"><item.icon size={22} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />{item.orders && <NewOrdersCount />}{item.reviews && <NewReviewsCount enabled={reviewsBadge} testId="tabbar-new-reviews" />}</span>
          <span>{item.label(t, text)}</span>
        </>}
      </NavLink>)}
    </nav>
    <SupportWidget />
    {signOut.dialog}
  </div>;
}
