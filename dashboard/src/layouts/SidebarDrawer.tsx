import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { ArrowSquareOutIcon, DotsThreeIcon, GlobeHemisphereWestIcon, SignOutIcon, XIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { reducedMotion, splash, squeeze } from '../lib/drop-motion';
import { useLanguage } from '../lib/language';

export type DrawerItem = { to: string; end?: boolean; icon: Icon; ar: string; en: string; badge?: ReactNode };
export type DrawerGroup = { ar: string; en: string; items: DrawerItem[] };

/**
 * The panel's outline, as clip-paths: `rail` is exactly the sidebar's rail (its box and its rounded
 * outer corners), `full` the whole panel, with room on the open side for its shadow. Animating
 * between the two folds the panel into the rail, or unfolds it out, without squashing its contents.
 */
function railClip(panel: HTMLElement, rail: Element | null | undefined) {
  const box = panel.getBoundingClientRect();
  const to = rail?.getBoundingClientRect();
  if (!to || !box.width || !box.height) return null;
  const rtl = document.documentElement.dir === 'rtl';
  const [top, right, bottom, left] = [to.top - box.top, box.right - to.right, box.bottom - to.bottom, to.left - box.left].map(value => `${Math.max(0, value)}px`);
  return {
    rail: `inset(${top} ${right} ${bottom} ${left} round ${rtl ? '32px 0 0 32px' : '0 32px 32px 0'})`,
    full: `inset(0px ${rtl ? '0px' : '-120px'} 0px ${rtl ? '-120px' : '0px'} round ${rtl ? '28px 0 0 28px' : '0 28px 28px 0'})`,
  };
}

export function SidebarDrawer({ groups, header, publicUrl, onSignOut, active = false }: {
  groups: DrawerGroup[];
  /** Who is signed in to what: shown at the top of the panel. */
  header: ReactNode;
  publicUrl?: string;
  onSignOut: () => void;
  /** The current page is one of those only in the panel: the ⋯ button shows it is open. */
  active?: boolean;
}) {
  const { text, toggleLanguage } = useLanguage();
  const { pathname } = useLocation();
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  // Closing: the items fade, the panel shrinks back into the rail it came out of, and the rail
  // takes it in like jelly (splash). Straight away with reduced motion.
  const close = useCallback(() => {
    const element = dialog.current;
    if (!element?.open || element.dataset.closing) return;
    const done = () => { delete element.dataset.closing; element.close(); };
    const clip = panel.current && !reducedMotion() ? railClip(panel.current, more.current?.closest('.sidebar-nav')) : null;
    if (!panel.current || !clip) return done();
    element.dataset.closing = 'true';
    // The contents go first, so what folds into the rail is one solid teal shape that becomes it.
    for (const part of panel.current.children) {
      part.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-out', fill: 'forwards' });
    }
    void panel.current.animate([
      { clipPath: clip.full },
      { clipPath: clip.rail },
    ], { duration: 260, easing: 'cubic-bezier(.5, 0, .2, 1)', fill: 'forwards' }).finished.then(() => {
      done();
      // The rail takes the panel back with a soft wobble, without the spreading rings.
      splash(more.current, { rings: false });
    });
  }, []);
  const show = () => {
    squeeze(more.current);
    dialog.current?.showModal();
    setOpen(true);
  };

  // Opening: the panel unfolds out of the rail.
  useLayoutEffect(() => {
    const target = panel.current;
    if (!open || !target || reducedMotion()) return;
    const clip = railClip(target, more.current?.closest('.sidebar-nav'));
    if (!clip) return;
    void target.animate([
      { clipPath: clip.rail, opacity: 0.5 },
      { clipPath: clip.full, opacity: 1 },
    ], { duration: 300, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }, [open]);

  useEffect(() => { close(); }, [pathname, close]);

  const signOut = () => {
    close();
    onSignOut();
  };

  return <>
    <button ref={more} type="button" className={`sidebar-link sidebar-more ${active ? 'active' : ''}`} onClick={show} aria-haspopup="dialog" aria-expanded={open}>
      <span className="sidebar-icon"><DotsThreeIcon size={22} weight="bold" aria-hidden="true" /></span>
      <span className="sidebar-label">{text('كل الاختيارات', 'All options')}</span>
    </button>
    <dialog ref={dialog} className="side-drawer" aria-label={text('القائمة', 'Menu')}
      onClose={() => setOpen(false)}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      {open && <div ref={panel} className="side-drawer-panel">
        <div className="side-drawer-head">
          <div className="side-drawer-who">{header}</div>
          <button type="button" className="side-drawer-close" onClick={close} aria-label={text('اقفل القائمة', 'Close menu')}>
            <XIcon size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <nav className="side-drawer-nav" aria-label={text('القائمة الرئيسية', 'Main navigation')}>
          {groups.map(group => <Fragment key={group.en}>
            <p className="side-drawer-group">{text(group.ar, group.en)}</p>
            {group.items.map((item, index) => <NavLink key={item.to} to={item.to} end={item.end} className="side-drawer-link"
              style={{ '--i': index } as CSSProperties} onClick={close}>
              <span className="side-drawer-icon"><item.icon size={20} aria-hidden="true" /></span>
              <span className="side-drawer-label">{text(item.ar, item.en)}</span>
              {item.badge}
            </NavLink>)}
          </Fragment>)}
        </nav>

        <div className="side-drawer-foot">
          {publicUrl && <a className="side-drawer-link" href={publicUrl} target="_blank" rel="noreferrer">
            <span className="side-drawer-icon"><ArrowSquareOutIcon size={20} aria-hidden="true" /></span>
            <span className="side-drawer-label">{text('شوف المنيو زي الزبون', 'View your public menu')}</span>
          </a>}
          <button type="button" className="side-drawer-link" onClick={toggleLanguage} lang={text('en', 'ar')}>
            <span className="side-drawer-icon"><GlobeHemisphereWestIcon size={20} aria-hidden="true" /></span>
            <span className="side-drawer-label">{text('English', 'عربي')}</span>
          </button>
          <button type="button" className="side-drawer-link side-drawer-signout" onClick={signOut}>
            <span className="side-drawer-icon"><SignOutIcon size={20} className="directional" aria-hidden="true" /></span>
            <span className="side-drawer-label">{text('تسجيل الخروج', 'Sign out')}</span>
          </button>
        </div>
      </div>}
    </dialog>
  </>;
}
