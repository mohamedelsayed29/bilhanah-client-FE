import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/**
 * After client-side navigation, scroll to the top and move focus to the new page's
 * heading so screen-reader and keyboard users land on the content.
 */
export function useRouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('[data-page-title]') ?? document.getElementById('main-content');
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
}
