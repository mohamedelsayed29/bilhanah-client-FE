import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { ChartLineUpIcon, GearSixIcon, GiftIcon, PauseCircleIcon, UsersThreeIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { LOYALTY_ERROR_CODES } from '@bilhanah/contracts';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { isApiError } from '../../lib/api';
import { useLanguage } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';
import { LOYALTY_TABS, type LoyaltyTabKey, useLoyaltySettings } from './shared';

const TABS: Record<LoyaltyTabKey, { icon: Icon; label: [string, string] }> = {
  overview: { icon: ChartLineUpIcon, label: ['نظرة عامة', 'Overview'] },
  members: { icon: UsersThreeIcon, label: ['الأعضاء', 'Members'] },
  rewards: { icon: GiftIcon, label: ['المكافآت', 'Rewards'] },
  settings: { icon: GearSixIcon, label: ['القواعد والإعدادات', 'Rules & settings'] },
};

/**
 * The loyalty section (docs/LOYALTY.md): tabs for the overview, members, rewards and rules, as the
 * viewer's permissions allow, and a notice while the program is off for diners.
 */
export function LoyaltyLayout() {
  const { text } = useLanguage();
  const { can, to } = useWorkspace();
  const settings = useLoyaltySettings();
  const { pathname } = useLocation();
  const tabs = LOYALTY_TABS.filter(tab => tab.need.some(can));
  const unavailable = settings.isError && isApiError(settings.error, LOYALTY_ERROR_CODES.LOYALTY_UNAVAILABLE);
  return <div className="page ly-page">
    <PageHeader title={text('برنامج الولاء', 'Loyalty program')}
      description={text('الزبون بيجمع نقاط من كل طلب بيكمل، ويستبدلها بخصم أو صنف مجاني من أي فرع. انت اللي بتحدد القواعد.', 'Diners earn points on every completed order and trade them for discounts or free dishes at any branch. You set the rules.')} />
    {unavailable ? <section className="card"><div className="empty-state" data-testid="loyalty-unavailable">
      <span className="empty-state-icon" aria-hidden="true"><GiftIcon size={30} /></span>
      <h2>{text('برنامج الولاء محتاج الطلب من الموبايل', 'Loyalty needs QR ordering')}</h2>
      <p>{text('النقاط بتتحسب على الطلبات اللي بتيجي من منيو بالهنا، فلازم خدمتي «الطلب من الموبايل» و«برنامج الولاء» يكونوا شغالين وباقتك فيها الطلبات.', 'Points are earned on orders placed on your Bilhanah menu, so QR ordering and Loyalty must be on, and your plan must include ordering.')}</p>
      {can('settings.manage') && <Link className="button button-primary" to="/settings/services">{text('افتح الخدمات', 'Open services')}</Link>}
    </div></section> : <>
      {tabs.length > 1 && <nav className="inv-nav ly-nav" aria-label={text('أقسام برنامج الولاء', 'Loyalty sections')}>
        <div className="inv-nav-tabs">
          {tabs.map(tab => {
            const meta = TABS[tab.key];
            const on = pathname.startsWith(to(tab.path));
            return <NavLink key={tab.key} to={to(tab.path)} className={`inv-nav-tab ${on ? 'active' : ''} ${tab.key === 'settings' ? 'is-end' : ''}`}
              aria-current={on ? 'page' : undefined} data-testid={`ly-tab-${tab.key}`}>
              <meta.icon size={18} aria-hidden="true" /><span>{text(...meta.label)}</span>
            </NavLink>;
          })}
        </div>
      </nav>}
      {settings.isError && <ErrorPanel error={settings.error} onRetry={() => void settings.refetch()} />}
      {settings.isPending && <Skeleton height={48} />}
      {settings.data && !settings.data.enabled && <div className="inv-notice" role="status" data-testid="loyalty-off">
        <span className="inv-notice-icon" aria-hidden="true"><PauseCircleIcon size={18} weight="bold" /></span>
        <p><strong>{text('البرنامج مقفول للزباين.', 'The program is off for diners.')}</strong> {text('محدش بيكسب نقاط ولا بيستبدل دلوقتي. النقاط اللي اتجمعت محفوظة زي ما هي.', 'Nobody earns or redeems points right now. Points already earned are kept.')}</p>
        {can('loyalty.settings') && <Link className="button button-secondary button-small" to={to('/loyalty/settings')}>{text('شغّله', 'Turn it on')}</Link>}
      </div>}
      <Outlet />
    </>}
  </div>;
}

/** /loyalty opens the first tab the viewer may see. */
export function LoyaltyIndex() {
  const { can, to } = useWorkspace();
  const first = LOYALTY_TABS.find(tab => tab.need.some(can));
  return <Navigate to={to(first?.path ?? '/loyalty/rewards')} replace />;
}
