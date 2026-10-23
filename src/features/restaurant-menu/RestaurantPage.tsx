import { useCallback, useEffect, useState } from 'react';
import { ArrowClockwiseIcon, GlobeHemisphereWestIcon, StorefrontIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../lib/language';
import { fetchPublicMenu, type MenuResult } from './menu-api';
import { MenuView } from './MenuView';
import './restaurant-menu.css';

type State = { status: 'loading' } | { status: 'error' } | MenuResult;

/** The public page at `{subdomain}.bilhanah.com`, opened from table QR codes. */
export function RestaurantPage({ subdomain }: { subdomain: string }) {
  const { text, toggleLanguage, setLanguage, hasPreference } = useLanguage();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setState({ status: 'loading' }); setAttempt(value => value + 1); }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchPublicMenu(subdomain, controller.signal)
      .then(result => {
        if (result.status === 'ready' && !hasPreference) setLanguage(result.menu.restaurant.defaultLanguage);
        setState(result);
      })
      .catch(error => { if (!controller.signal.aborted) { console.error(error); setState({ status: 'error' }); } });
    return () => controller.abort();
    // The visitor's language choice must not refetch the menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subdomain, attempt]);

  if (state.status === 'ready' && state.menu.restaurant.availability === 'AVAILABLE') {
    return <MenuView restaurant={state.menu.restaurant} categories={state.menu.categories} />;
  }

  if (state.status === 'loading') {
    return <main className="menu-page" aria-busy="true">
      <p className="visually-hidden" role="status">{text('جاري تحميل المنيو…', 'Loading the menu…')}</p>
      <div className="menu-skeleton" aria-hidden="true">
        <div className="skeleton-cover" />
        <div className="menu-container"><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-tabs"><span /><span /><span /></div>{[0, 1, 2].map(index => <div className="skeleton-dish" key={index}><div><span className="skeleton-line" /><span className="skeleton-line short" /></div><span className="skeleton-thumb" /></div>)}</div>
      </div>
    </main>;
  }

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
