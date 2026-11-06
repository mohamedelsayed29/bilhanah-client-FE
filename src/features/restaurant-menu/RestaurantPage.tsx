import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowClockwiseIcon, GlobeHemisphereWestIcon, StorefrontIcon } from '@phosphor-icons/react';
import { DEFAULT_MENU_THEME, type PublicMenuResponse } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import { BranchPicker, type BranchNotice } from './BranchPicker';
import { branchesOf, branchOf, branchParam, rememberBranch, rememberedBranch, writeBranchParam } from './branches';
import { fetchPublicMenu } from './menu-api';
import { initialMenuLanguage, menuLanguagesOf, rememberMenuLanguage, storedMenuLanguage } from './menu-language';
import { MenuView, type AvailableRestaurant, type BranchHeader } from './MenuView';
import { fetchTable } from './ordering/order-api';
import { loadTable, saveTable } from './ordering/ordering-storage';
import type { CheckedScan } from './ordering/use-table';
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
  () => ({ default: ({ restaurant, categories, branch, navigate }: OrderingMenuProps) => <MenuView restaurant={restaurant} categories={categories} branch={branch} navigate={navigate} /> }),
));
const TrackingPage = lazy(() => import('./ordering/TrackingPage').catch(() => ({ default: TrackingUnavailable })));

function TrackingUnavailable() {
  const { text } = useLanguage();
  return <main className="restaurant-page"><div className="restaurant-card">
    <p role="alert">{text('مقدرناش نفتح صفحة الطلب.', 'We could not open the order page.')}</p>
    <button className="button button-teal" onClick={() => location.reload()}><ArrowClockwiseIcon size={18} />{text('حاول تاني', 'Try again')}</button>
  </div></main>;
}

type Ready = {
  status: 'ready';
  menu: PublicMenuResponse;
  /** The branch shown was chosen (by a table, a link, this browser or the diner); false while the picker waits for a first choice. */
  chosen: boolean;
  /** The branch picker shows instead of the menu. */
  picking: boolean;
  /** Why the picker shows instead of the branch the diner was sent to. */
  notice: BranchNotice | null;
  /** A table QR decided the branch: the menu does not offer to change it. */
  pinned: boolean;
  /** The table code, already looked up while choosing the branch. */
  checked: CheckedScan | null;
};
type State = { status: 'loading' } | { status: 'error' } | { status: 'not-found' } | Ready;
/** What to load: the first visit's branch (table, link, remembered or none), or one the diner picked. */
type Wanted = { kind: 'entry' } | { kind: 'branch'; slug: string };
type Source = 'table' | 'link' | 'remembered' | 'picked';

const availableRestaurant = (state: State): AvailableRestaurant | null =>
  state.status === 'ready' && state.menu.restaurant.availability === 'AVAILABLE' ? state.menu.restaurant : null;

/** `/order/<trackingToken>` is a diner's order; every other path shows the menu. */
const trackingToken = (path: string) => {
  const match = /^\/order\/([^/]+)\/?$/.exec(path);
  if (!match) return null;
  try { return decodeURIComponent(match[1]!); } catch { return null; }
};

/** The public page at `{subdomain}.bilhanah.com`, opened from table QR codes. */
export function RestaurantPage({ subdomain }: { subdomain: string }) {
  const { text, toggleLanguage, hasPreference, menuLanguage, setMenuLanguage } = useLanguage();
  // The visit's menu language is settled once, with the first menu (see menu-language.ts).
  const languageSettled = useRef(false);
  // The website's router is not loaded on restaurant hosts; two routes need only the History API.
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const onPopState = () => setPath(location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const token = trackingToken(path);
  const [state, setState] = useState<State>({ status: 'loading' });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [attempt, setAttempt] = useState(0);
  const [wanted, setWanted] = useState<Wanted>({ kind: 'entry' });
  // The address the diner arrived with: a table code (?t=) and a branch link (?b=). Read once, since
  // both leave the address bar later; a retry starts from them again.
  const [entry] = useState(() => ({ code: new URLSearchParams(location.search).get('t')?.trim() || null, branch: branchParam(location.search) }));
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
    const { signal } = controller;

    async function load(): Promise<State> {
      let slug: string | null = null;
      let source: Source | null = null;
      if (wanted.kind === 'branch') {
        slug = wanted.slug;
        source = 'picked';
      } else {
        // The table remembered for this visit (sessionStorage) pins the branch until the diner follows
        // a link to another one; a fresh scan of the same table already knows its branch.
        const stored = loadTable(subdomain);
        const remembered = rememberedBranch(subdomain);
        if (entry.code ? stored?.code === entry.code && stored.branch : stored?.branch && (!entry.branch || entry.branch === stored.branch)) {
          slug = stored!.branch;
          source = 'table';
        } else {
          if (!entry.code && stored?.branch) saveTable(subdomain, null);
          slug = entry.branch ?? remembered;
          source = entry.branch ? 'link' : remembered ? 'remembered' : null;
        }
      }

      let notice: BranchNotice | null = null;
      let result = await fetchPublicMenu(subdomain, slug, signal);
      if (result.status === 'branch-not-found') {
        // Archived or renamed since: offer the branches there are, saying why.
        notice = source === 'link' ? 'link' : source === 'remembered' ? 'remembered' : 'gone';
        if (source === 'remembered') rememberBranch(subdomain, null);
        if (source === 'table') saveTable(subdomain, null);
        source = null;
        result = await fetchPublicMenu(subdomain, null, signal);
      }
      if (result.status !== 'ready') return { status: 'not-found' };
      let menu = result.menu;
      const restaurant = menu.restaurant;
      if (restaurant.availability !== 'AVAILABLE') return { status: 'ready', menu, chosen: false, picking: false, notice: null, pinned: false, checked: null };
      const several = branchesOf(restaurant).length > 1;

      // A table QR decides the branch, so with several branches its code is looked up first. With one
      // there is nothing to decide, and the ordering layer checks the code as it always has.
      let checked: CheckedScan | null = null;
      if (wanted.kind === 'entry' && entry.code && several) {
        const table = await fetchTable(subdomain, entry.code, signal).catch((error: unknown) => {
          if (signal.aborted) throw error;
          return undefined; // Offline: carry on; the ordering layer tries the code again and checkout sends it.
        });
        if (table !== undefined) checked = { code: entry.code, table };
        if (table) {
          if (table.branch !== branchOf(restaurant)?.slug) {
            const atTable = await fetchPublicMenu(subdomain, table.branch, signal);
            if (atTable.status === 'ready' && atTable.menu.restaurant.availability === 'AVAILABLE') menu = atTable.menu;
          }
          if (branchOf(menu.restaurant as AvailableRestaurant)?.slug === table.branch) { source = 'table'; notice = null; }
        } else if (table === null && source === 'table') {
          source = null; // The remembered table's code is gone: its branch is no longer a given.
        }
      }

      const chosen = source !== null;
      if (several && chosen) rememberBranch(subdomain, branchOf(menu.restaurant as AvailableRestaurant)?.slug ?? null);
      return { status: 'ready', menu, chosen, picking: several && !chosen, notice, pinned: source === 'table', checked };
    }

    load()
      .then(next => {
        if (signal.aborted) return;
        if (next.status === 'ready' && !languageSettled.current) {
          languageSettled.current = true;
          const { restaurant } = next.menu;
          const initial = initialMenuLanguage({
            stored: storedMenuLanguage(subdomain),
            offered: restaurant.availability === 'AVAILABLE' ? menuLanguagesOf(restaurant) : [],
            hasPreference,
            defaultLanguage: restaurant.defaultLanguage,
          });
          // Applied with the menu itself, so it never shows in one language and then another.
          if (initial) setMenuLanguage(initial);
        }
        // Unavailable restaurants say nothing about their look: keep the one last seen.
        const current = next.status === 'not-found' ? null : next.status === 'ready' && next.menu.restaurant.availability === 'AVAILABLE' ? themeOf(next.menu.restaurant) : undefined;
        if (current !== undefined) { setRestaurantTheme(current); rememberTheme(subdomain, current); }
        setState(next);
      })
      .catch(error => { if (!signal.aborted) { console.error(error); setState({ status: 'error' }); } });
    return () => controller.abort();
    // The visitor's language choice must not refetch the menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subdomain, attempt, wanted]);

  // The diner's choice, remembered for this restaurant once the visit's language is settled. Defaults
  // (the restaurant's language, the browser's) are not choices, so a later visit applies them afresh.
  useEffect(() => {
    if (languageSettled.current && hasPreference) rememberMenuLanguage(subdomain, menuLanguage);
  }, [subdomain, menuLanguage, hasPreference]);

  /** Shows `slug`'s menu: at once if it is the one loaded, otherwise after loading it. */
  const chooseBranch = useCallback((slug: string) => {
    const current = stateRef.current;
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (current.status === 'ready' && branchOf(current.menu.restaurant as AvailableRestaurant)?.slug === slug) {
      rememberBranch(subdomain, slug);
      setState({ ...current, chosen: true, picking: false, notice: null });
      return;
    }
    setState({ status: 'loading' });
    setWanted({ kind: 'branch', slug });
  }, [subdomain]);

  const changeBranch = useCallback(() => {
    setState(current => current.status === 'ready' ? { ...current, picking: true, notice: null } : current);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const navigate = useCallback((to: string, state?: unknown) => {
    history.pushState(state ?? null, '', to);
    setPath(location.pathname);
    window.scrollTo({ top: 0, behavior: 'instant' });
    // Back from an order to the menu: a diner who has not chosen a branch yet (they opened the order's
    // link) lands on the order's branch rather than the picker.
    const branch = (state as { branch?: unknown } | null | undefined)?.branch;
    const current = stateRef.current;
    if (typeof branch === 'string' && current.status === 'ready' && current.picking && !current.chosen) chooseBranch(branch);
  }, [chooseBranch]);

  // Shared links open the same branch: the address carries ?b=<slug> once one is chosen.
  useEffect(() => {
    const restaurant = availableRestaurant(state);
    if (token || !restaurant || state.status !== 'ready' || branchesOf(restaurant).length < 2) return;
    writeBranchParam(state.chosen ? branchOf(restaurant)?.slug ?? null : null);
  }, [state, token]);

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

  const available = availableRestaurant(state);
  if (available && state.status === 'ready') {
    const { categories } = state.menu;
    const branch = branchOf(available);
    if (state.picking) {
      return themed(<BranchPicker restaurant={available} current={state.chosen ? branch?.slug ?? null : null} notice={state.notice} onChoose={chooseBranch}
        onBack={state.chosen ? () => setState({ ...state, picking: false }) : null} />);
    }
    const header: BranchHeader | null = branch && branchesOf(available).length > 1 ? { name: branch.name, onChange: state.pinned ? null : changeBranch } : null;
    // Each branch is its own menu (prices, cart, search): switching remounts it.
    return themed(available.ordering?.accepting
      ? <Suspense fallback={skeleton}><OrderingMenu key={branch?.slug} restaurant={available} categories={categories} subdomain={subdomain} navigate={navigate} branch={header} checkedScan={state.checked} recommendations={state.menu.recommendations ?? []} /></Suspense>
      : <MenuView key={branch?.slug} restaurant={available} categories={categories} branch={header} navigate={navigate} />);
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
