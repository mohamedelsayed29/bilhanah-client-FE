import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowClockwiseIcon, GlobeHemisphereWestIcon, StorefrontIcon } from '@phosphor-icons/react';
import { DEFAULT_MENU_THEME } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import { fetchPublicMenu, type MenuResult } from './menu-api';
import { MenuView } from './MenuView';
import { useWebAppLinks } from './web-app';
import { recordVisit } from './visits';
import { isThemePreview, MenuThemeContext, previewTheme, rememberTheme, storedTheme, themeOf, useAppliedTheme } from './menu-theme';
import type { OrderingMenuProps } from './ordering/OrderingMenu';
import './restaurant-menu.css';

// Ordering (cart, checkout) and tracking (with Socket.IO) load only on restaurant hosts, so the
// website's bundle stays lean. Ordering is fetched alongside the menu, before it is needed.
const loadOrdering = () => import('./ordering/OrderingMenu');
// If the ordering code cannot load (flaky connection), the menu still shows, without the cart.
const OrderingMenu = lazy(() => loadOrdering().then(
  module => ({ default: module.OrderingMenu }),
  () => ({ default: ({ restaurant, categories }: OrderingMenuProps) => <MenuView restaurant={restaurant} categories={categories} /> }),
));
const TrackingPage = lazy(() => import('./ordering/TrackingPage').catch(() => ({ default: TrackingUnavailable })));

function TrackingUnavailable() {
  const { text } = useLanguage();
  return <main className="restaurant-page"><div className="restaurant-card">
    <p role="alert">{text('مقدرناش نفتح صفحة الطلب.', 'We could not open the order page.')}</p>
    <button className="button button-teal" onClick={() => location.reload()}><ArrowClockwiseIcon size={18} />{text('حاول تاني', 'Try again')}</button>
  </div></main>;
}

type State = { status: 'loading' } | { status: 'error' } | MenuResult;

/** `/order/<trackingToken>` is a diner's order; every other path shows the menu. */
const trackingToken = (path: string) => {
  const match = /^\/order\/([^/]+)\/?$/.exec(path);
  if (!match) return null;
  try { return decodeURIComponent(match[1]!); } catch { return null; }
};

/** The public page at `{subdomain}.bilhanah.com`, opened from table QR codes. */
export function RestaurantPage({ subdomain }: { subdomain: string }) {
  const { text, toggleLanguage, setLanguage, hasPreference } = useLanguage();
  // The website's router is not loaded on restaurant hosts; two routes need only the History API.
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const onPopState = () => setPath(location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const navigate = useCallback((to: string, state?: unknown) => {
    history.pushState(state ?? null, '', to);
    setPath(location.pathname);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // The dashboard previews themes with ?preview-theme=<id>; it overrides the restaurant's theme
  // for this page load only (see menu-theme.ts).
  const [preview] = useState(() => previewTheme(location.search));
  const [previewing] = useState(() => isThemePreview(location.search));
  const [restaurantTheme, setRestaurantTheme] = useState(() => storedTheme(subdomain));
  const theme = preview ?? restaurantTheme ?? DEFAULT_MENU_THEME;
  const themeReady = useAppliedTheme(theme);
  const retry = useCallback(() => { setState({ status: 'loading' }); setAttempt(value => value + 1); }, []);

  useEffect(() => { void loadOrdering(); }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchPublicMenu(subdomain, controller.signal)
      .then(result => {
        if (result.status === 'ready' && !hasPreference) setLanguage(result.menu.restaurant.defaultLanguage);
        // Unavailable restaurants say nothing about their look: keep the one last seen.
        const current = result.status === 'not-found' ? null : result.menu.restaurant.availability === 'AVAILABLE' ? themeOf(result.menu.restaurant) : undefined;
        if (current !== undefined) { setRestaurantTheme(current); rememberTheme(subdomain, current); }
        setState(result);
      })
      .catch(error => { if (!controller.signal.aborted) { console.error(error); setState({ status: 'error' }); } });
    return () => controller.abort();
    // The visitor's language choice must not refetch the menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subdomain, attempt]);

  const token = trackingToken(path);
  useWebAppLinks(subdomain, token);
  // Count the menu visit (not order pages, nor the dashboard's theme previews), after the first
  // render so it never delays the menu.
  useEffect(() => { if (!token && !previewing) recordVisit(subdomain); }, [subdomain, token, previewing]);
  // Every state below carries the theme, so dialogs and pages read the same one.
  const themed = (node: ReactNode) => <MenuThemeContext.Provider value={theme}>{node}</MenuThemeContext.Provider>;

  if (token) {
    const loading = <main className="track-page" aria-busy="true" />;
    return themed(themeReady ? <Suspense fallback={loading}>
      <TrackingPage key={token} subdomain={subdomain} token={token} navigate={navigate} />
    </Suspense> : loading);
  }

  const skeleton = <main className="menu-page" aria-busy="true">
    <p className="visually-hidden" role="status">{text('جاري تحميل المنيو…', 'Loading the menu…')}</p>
    <div className="menu-skeleton" aria-hidden="true">
      <div className="skeleton-cover" />
      <div className="menu-container"><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-tabs"><span /><span /><span /></div>{[0, 1, 2].map(index => <div className="skeleton-dish" key={index}><div><span className="skeleton-line" /><span className="skeleton-line short" /></div><span className="skeleton-thumb" /></div>)}</div>
    </div>
  </main>;

  // A theme's stylesheet is still on its way: keep loading rather than flash the default look.
  if (!themeReady) return skeleton;

  if (state.status === 'ready' && state.menu.restaurant.availability === 'AVAILABLE') {
    const { restaurant, categories } = state.menu;
    return themed(restaurant.ordering?.accepting
      ? <Suspense fallback={skeleton}><OrderingMenu restaurant={restaurant} categories={categories} subdomain={subdomain} navigate={navigate} /></Suspense>
      : <MenuView restaurant={restaurant} categories={categories} />);
  }

  if (state.status === 'loading') return skeleton;

  return <main className="restaurant-page">
    <button className="language-button restaurant-language" onClick={toggleLanguage} aria-label={text('Switch to English', 'التبديل للعربية')}><GlobeHemisphereWestIcon size={18} /><span>{text('EN', 'عربي')}</span></button>
    <div className="restaurant-card">
      <span className="restaurant-mark"><StorefrontIcon size={26} /></span>
      {state.status === 'error' && <><p role="alert">{text('حصلت مشكلة في تحميل المنيو.', 'We could not load the menu.')}</p><button className="button button-teal" onClick={retry}><ArrowClockwiseIcon size={18} />{text('حاول تاني', 'Try again')}</button></>}
      {state.status === 'not-found' && <><h1>{text('المطعم ده مش موجود', 'Restaurant not found')}</h1><p>{text('اتأكد من اللينك أو امسح الـ QR تاني.', 'Check the link or scan the QR code again.')}</p></>}
      {state.status === 'ready' && <><h1>{state.menu.restaurant.name}</h1><p>{text('المنيو مش متاح مؤقتًا. جرب تاني بعدين.', 'The menu is temporarily unavailable. Please check back later.')}</p></>}
    </div>
  </main>;
}
