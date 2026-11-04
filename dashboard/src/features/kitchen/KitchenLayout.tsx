import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useLocation } from 'react-router';
import { CornersInIcon, CornersOutIcon, SignOutIcon, StorefrontIcon } from '@phosphor-icons/react';
import type { KitchenContext } from '@bilhanah/contracts';
import { Brand } from '../../components/Brand';
import { ErrorBoundary, ErrorPanel } from '../../components/ErrorBoundary';
import { LanguageToggle } from '../../components/LanguageToggle';
import { useSignOut } from '../../components/SignOutDialog';
import { kitchenApi } from '../../lib/api/endpoints';
import { useLanguage } from '../../lib/language';
import { useSession } from '../../lib/session';
import { useRouteFocus } from '../../lib/use-route-focus';
import { Splash } from '../../app/providers/SessionBootstrap';
import { BranchScopeProvider, BranchSwitcher, useBranchScope } from '../branches/BranchScope';
import type { BranchOption } from '../branches/scope';
import { LiveForScope, useOrdersLive } from '../restaurant/orders/live';
import { DisplaySettings } from './kds/DisplaySettings';
import { useFullscreen, useKdsTheme, useWakeLock, useWallClock } from './kds/display';
import { queryKeys } from '../restaurant/queries';

export function useKitchenContextQuery() {
  return useQuery({ queryKey: queryKeys.kitchenContext, queryFn: kitchenApi.context });
}

/** The kitchen's restaurant inside the kitchen shell, where KitchenLayout guarantees it is loaded. */
export function useKitchenContext(): KitchenContext {
  const { data } = useKitchenContextQuery();
  if (!data) throw new Error('useKitchenContext() is only available inside the kitchen shell.');
  return data;
}

/**
 * The branches a staff account works at, as the branch scope: tied to one branch, or (all-branch
 * accounts) a branch chosen on this screen and remembered on it.
 */
export function StaffBranchScope({ context, children }: { context: KitchenContext; children: ReactNode }) {
  const session = useSession();
  const options = useMemo<BranchOption[]>(() => context.branches.map(branch => ({ ...branch, isActive: true })), [context.branches]);
  const userId = session.status === 'authenticated' ? session.user.id : 'staff';
  return <BranchScopeProvider branches={options} lockedTo={context.branch?.id ?? null} storageKey={`bilhanah:branch:v1:${userId}`}>{children}</BranchScopeProvider>;
}

/** Kitchen screen shell: one slim bar (restaurant, branch, signed-in screen, language, sign out) over the live board. */
export function KitchenLayout() {
  const context = useKitchenContextQuery();
  if (context.isPending) return <Splash />;
  if (context.isError) return <main className="state-page"><ErrorPanel error={context.error} onRetry={() => void context.refetch()} /></main>;
  return <StaffBranchScope context={context.data}>
    <LiveForScope enabled={context.data.ordering.included}><KitchenShell context={context.data} /></LiveForScope>
  </StaffBranchScope>;
}

function KitchenShell({ context }: { context: KitchenContext }) {
  const { text, language } = useLanguage();
  const session = useSession();
  const scope = useBranchScope();
  const live = useOrdersLive();
  const { pathname } = useLocation();
  const [theme, setTheme] = useKdsTheme();
  const fullscreen = useFullscreen();
  const wall = useWallClock();
  useRouteFocus();
  useWakeLock();
  const signOut = useSignOut(text('هتخرج من حسابك على الجهاز ده، والطلبات الجديدة مش هتوصلك هنا لحد ما تدخل تاني.', 'You will be signed out on this device, and new orders will not reach it until you sign back in.'));
  const user = session.status === 'authenticated' ? session.user : null;
  // A branch name when there is one to show: the screen's own, or the one chosen here.
  const branchName = context.branch?.name ?? (context.branches.length > 1 ? scope.branch?.name ?? null : null);
  const connected = live.connection === 'connected';
  return <div className="kds" data-theme={theme}>
    <a className="skip-link" href="#main-content">{text('انتقل للمحتوى', 'Skip to content')}</a>
    <header className="kds-bar">
      <div className="kds-bar-brand"><Brand inverse to="/kitchen" /></div>
      <div className="kds-bar-place">
        <strong><bdi>{context.restaurant.name}</bdi></strong>
        {branchName && !scope.multi && <span className="kds-bar-branch" data-testid="kitchen-branch"><StorefrontIcon size={15} weight="bold" aria-hidden="true" /><bdi>{branchName}</bdi></span>}
      </div>
      <BranchSwitcher className="branch-switch-dark kds-branch-switch" />
      <span className={`kds-live ${connected ? 'is-live' : 'is-down'}`} role="status" data-testid="connection-state">
        <span className="kds-live-dot" aria-hidden="true" />
        {connected ? text('مباشر', 'Live') : live.connection === 'connecting' ? text('بنوصّل…', 'Connecting…') : text('مقطوع', 'Offline')}
      </span>
      <time className="kds-wall-clock" dateTime={wall.toISOString()}>
        {wall.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-GB', { hour: 'numeric', minute: '2-digit' })}
      </time>
      <div className="kds-bar-actions">
        {user && <span className="kds-bar-user"><bdi>{user.fullName}</bdi></span>}
        <LanguageToggle plain />
        <DisplaySettings theme={theme} onTheme={setTheme} />
        {fullscreen.supported && <button type="button" className="kds-icon-button" onClick={fullscreen.toggle} aria-pressed={fullscreen.active}
          aria-label={fullscreen.active ? text('اخرج من ملء الشاشة', 'Exit full screen') : text('ملء الشاشة', 'Full screen')} title={text('ملء الشاشة', 'Full screen')} data-testid="kds-fullscreen">
          {fullscreen.active ? <CornersInIcon size={22} weight="bold" aria-hidden="true" /> : <CornersOutIcon size={22} weight="bold" aria-hidden="true" />}
        </button>}
        <button type="button" className="kds-icon-button" onClick={signOut.ask} aria-label={text('تسجيل الخروج', 'Sign out')} title={text('خروج', 'Sign out')}>
          <SignOutIcon size={21} className="directional" aria-hidden="true" />
        </button>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="kds-main">
      <ErrorBoundary resetKey={pathname}><Outlet /></ErrorBoundary>
    </main>
    {signOut.dialog}
  </div>;
}
