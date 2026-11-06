import { useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { ArrowRightIcon, SignOutIcon, StorefrontIcon } from '@phosphor-icons/react';
import { ErrorBoundary, ErrorPanel } from '../../components/ErrorBoundary';
import { LanguageToggle } from '../../components/LanguageToggle';
import { useSignOut } from '../../components/SignOutDialog';
import { Splash } from '../../app/providers/SessionBootstrap';
import { DeniedNotice } from '../../app/router/permission-guard';
import { useLanguage } from '../../lib/language';
import { useRouteFocus } from '../../lib/use-route-focus';
import { BranchSwitcher, useBranchScope } from '../branches/BranchScope';
import { kitchenWorkspace, WorkspaceProvider } from '../branches/workspace';
import { StaffBranchScope, useKitchenContextQuery } from './KitchenLayout';

/**
 * Kitchen accounts' inventory pages (waste, stock counts, stock): a light, phone-first frame with a
 * way back to the kitchen screen. Pages follow the account's permissions like everywhere else.
 */
export function KitchenInventoryLayout() {
  const context = useKitchenContextQuery();
  const data = context.data;
  const workspace = useMemo(() => kitchenWorkspace({ name: data?.restaurant.name ?? '', subdomain: data?.restaurant.subdomain ?? '', logoUrl: null, brandColor: null, orderPrepMinutes: data?.orderPrepMinutes ?? null },
    data?.permissions ?? []), [data]);
  if (context.isPending) return <Splash />;
  if (context.isError) return <main className="state-page"><ErrorPanel error={context.error} onRetry={() => void context.refetch()} /></main>;
  return <WorkspaceProvider value={workspace}>
    <StaffBranchScope context={context.data}><Frame name={context.data.restaurant.name} branch={context.data.branch?.name ?? null} /></StaffBranchScope>
  </WorkspaceProvider>;
}

function Frame({ name, branch }: { name: string; branch: string | null }) {
  const { text } = useLanguage();
  const scope = useBranchScope();
  const { pathname } = useLocation();
  useRouteFocus();
  const signOut = useSignOut(text('هتخرج من حسابك على الجهاز ده.', 'You will be signed out on this device.'));
  return <div className="kitchen-inv">
    <a className="skip-link" href="#main-content">{text('انتقل للمحتوى', 'Skip to content')}</a>
    <header className="kitchen-inv-bar">
      <Link to="/kitchen" className="button button-secondary button-small kitchen-inv-back" data-testid="back-to-kitchen">
        <ArrowRightIcon size={16} aria-hidden="true" className="directional" />{text('شاشة المطبخ', 'Kitchen screen')}
      </Link>
      <span className="kitchen-inv-place"><strong><bdi>{name}</bdi></strong>
        {(branch ?? scope.branch?.name) && !scope.multi && <small data-testid="kitchen-branch"><StorefrontIcon size={14} aria-hidden="true" /> <bdi>{branch ?? scope.branch?.name}</bdi></small>}</span>
      <BranchSwitcher className="owner-branch-switch" />
      <span className="kitchen-inv-actions">
        <LanguageToggle plain />
        <button type="button" className="icon-button" onClick={signOut.ask} aria-label={text('تسجيل الخروج', 'Sign out')}><SignOutIcon size={21} className="directional" aria-hidden="true" /></button>
      </span>
    </header>
    <main id="main-content" tabIndex={-1} className="kitchen-inv-main">
      <DeniedNotice />
      <ErrorBoundary resetKey={pathname}><Outlet /></ErrorBoundary>
    </main>
    {signOut.dialog}
  </div>;
}
