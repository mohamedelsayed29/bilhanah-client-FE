import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_MENU_THEME, isMenuTheme, type MenuTheme } from '@bilhanah/contracts';
import { contrastRatio } from './menu-format';

// Menu themes on restaurant pages. The theme is one attribute on <html>, data-menu-theme="<id>";
// each theme's stylesheet (themes/<id>.css) is scoped to it and loads only when that theme is shown.
// Classic is today's look and has no stylesheet of its own.
//
// Where the theme comes from, first match wins:
// 1. ?preview-theme=<id> (the dashboard's live preview in an iframe): valid ids only, never stored.
// 2. The restaurant's menuTheme from the API (the menu, which order pages load too).
// 3. The theme this browser last saw for the restaurant, so a reload does not flash the default.
// 4. Classic.

export const PREVIEW_THEME_PARAM = 'preview-theme';

/** Whether this load is a theme preview (any value): previews are not diners, so they are not counted. */
export function isThemePreview(search: string): boolean {
  return new URLSearchParams(search).has(PREVIEW_THEME_PARAM);
}

/** The preview override in `search`, if it names a real theme. */
export function previewTheme(search: string): MenuTheme | null {
  const value = new URLSearchParams(search).get(PREVIEW_THEME_PARAM);
  return isMenuTheme(value) ? value : null;
}

const storageKey = (subdomain: string) => `bilhanah:menu-theme:v1:${subdomain}`;

export function storedTheme(subdomain: string): MenuTheme | null {
  try {
    const value = localStorage.getItem(storageKey(subdomain));
    return isMenuTheme(value) ? value : null;
  } catch { return null; }
}

export function rememberTheme(subdomain: string, theme: MenuTheme | null) {
  try {
    if (!theme || theme === DEFAULT_MENU_THEME) localStorage.removeItem(storageKey(subdomain));
    else localStorage.setItem(storageKey(subdomain), theme);
  } catch { /* Storage is optional: the page then waits for the API. */ }
}

/** The theme in an API restaurant (older APIs and unavailable restaurants have none). */
export function themeOf(restaurant: object): MenuTheme {
  const value = (restaurant as { menuTheme?: unknown }).menuTheme;
  return isMenuTheme(value) ? value : DEFAULT_MENU_THEME;
}

// --- Stylesheets ---------------------------------------------------------------------------------

const stylesheets: Record<MenuTheme, (() => Promise<unknown>) | null> = {
  classic: null,
  arabesque: () => import('./themes/arabesque.css'),
};
/** The display face of each theme, waited for briefly so headings do not reflow when it arrives. */
const displayFonts: Partial<Record<MenuTheme, string>> = { arabesque: '700 1em Amiri' };
const loading = new Map<MenuTheme, Promise<void>>();

function loadTheme(theme: MenuTheme): Promise<void> {
  let promise = loading.get(theme);
  if (!promise) {
    const font = displayFonts[theme];
    promise = (stylesheets[theme]?.() ?? Promise.resolve())
      .then(() => font && Promise.race([
        Promise.all([document.fonts.load(font, 'بالهنا'), document.fonts.load(font, 'Menu')]),
        new Promise(resolve => window.setTimeout(resolve, 800)),
      ]))
      // A stylesheet that cannot load leaves the page in the default look rather than blank.
      .then(() => undefined, () => undefined);
    loading.set(theme, promise);
  }
  return promise;
}

/**
 * Marks <html> with the theme and loads its stylesheet. Returns whether the stylesheet is in, so
 * the page can keep its loading state until then instead of flashing the default look.
 */
export function useAppliedTheme(theme: MenuTheme): boolean {
  const [loaded, setLoaded] = useState<MenuTheme | null>(() => stylesheets[theme] ? null : theme);
  useEffect(() => {
    let active = true;
    void loadTheme(theme).then(() => { if (active) setLoaded(theme); });
    document.documentElement.dataset['menuTheme'] = theme;
    return () => { active = false; };
  }, [theme]);
  useEffect(() => () => { delete document.documentElement.dataset['menuTheme']; }, []);
  return loaded === theme || !stylesheets[theme];
}

// --- Colours -------------------------------------------------------------------------------------

export const DEFAULT_BRAND = '#075e54';

/** Arabesque's own colours that the page's scripts need (the rest live in themes/arabesque.css). */
export const ARABESQUE = {
  /** Deep green: the header band, the ready moment, and actions when the brand colour cannot be used. */
  green: '#0e3b2e',
  /** The ivory page: the darkest light surface that actions sit on. */
  paper: '#f8f1df',
};

/**
 * The colour of primary actions (add, cart, place order). Classic always uses the restaurant's brand
 * colour, as before. Arabesque uses it only when it reads at WCAG AA (4.5:1) on the theme's ivory
 * page; since that page is the darkest light surface, it then also passes on the lighter cards, and
 * white text on it passes too. Otherwise (light or bright brands, or none) actions use the theme's
 * deep green.
 */
export function actionColor(theme: MenuTheme, brandColor: string | null): string {
  if (theme === 'arabesque') return brandColor && contrastRatio(brandColor, ARABESQUE.paper) >= 4.5 ? brandColor : ARABESQUE.green;
  return brandColor ?? DEFAULT_BRAND;
}

/** The browser bar: the brand colour on Classic, the header band's green on Arabesque. */
export function browserBarColor(theme: MenuTheme, brand: string): string {
  return theme === 'arabesque' ? ARABESQUE.green : brand;
}

export const MenuThemeContext = createContext<MenuTheme>(DEFAULT_MENU_THEME);
export const useMenuTheme = () => useContext(MenuThemeContext);
