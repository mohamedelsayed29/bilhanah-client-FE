import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ClockIcon, CookingPotIcon, MonitorIcon, PaintBrushBroadIcon, ReceiptIcon, ShieldCheckIcon, StorefrontIcon } from '@phosphor-icons/react';
import { PageHeader } from '../../../components/PageHeader';
import { useCopy } from '../../../lib/copy';
import { useLanguage } from '../../../lib/language';

/** Scrolls a sideways tab strip so its current tab is fully visible, in either reading direction. */
export function scrollTabIntoView(strip: HTMLElement | null) {
  const tab = strip?.querySelector<HTMLElement>('.active');
  if (!strip || !tab) return;
  const outer = strip.getBoundingClientRect();
  const inner = tab.getBoundingClientRect();
  if (inner.left < outer.left) strip.scrollLeft -= outer.left - inner.left + 16;
  else if (inner.right > outer.right) strip.scrollLeft += inner.right - outer.right + 16;
}

export function SettingsLayout() {
  const { text } = useLanguage();
  const t = useCopy();
  const { pathname } = useLocation();
  const nav = useRef<HTMLElement>(null);
  // On phones the section list scrolls sideways; keep the current one in view.
  // Only the tab strip scrolls (scrollIntoView could also move the page).
  useEffect(() => { scrollTabIntoView(nav.current); }, [pathname]);
  const sections = [
    { to: '/settings', end: true, icon: StorefrontIcon, label: text('بيانات المطعم', 'Restaurant'), hint: text('الاسم والتواصل والعنوان', 'Name, contact and address') },
    { to: '/settings/branding', icon: PaintBrushBroadIcon, label: text('الشكل والألوان', 'Branding'), hint: text('اللوجو والغلاف واللون', 'Logo, cover and colour') },
    { to: '/settings/hours', icon: ClockIcon, label: text('مواعيد الشغل', 'Opening hours'), hint: text('أيام وساعات الفتح', 'Days and hours you open') },
    { to: '/settings/ordering', icon: ReceiptIcon, label: text('الطلبات', 'Ordering'), hint: text('الصالة والتيك أواي', 'Dine-in and pickup') },
    { to: '/settings/kitchen-display', icon: MonitorIcon, label: text('شاشة المطبخ', 'Kitchen display'), hint: text('المحطات ووقت التحضير', 'Stations and prep times') },
    { to: '/settings/kitchen', icon: CookingPotIcon, label: t.settingsBranches.teamLabel, hint: t.settingsBranches.teamHint },
    { to: '/settings/account', icon: ShieldCheckIcon, label: text('الحساب والأمان', 'Account'), hint: text('كلمة السر والأجهزة', 'Password and devices') },
  ];
  // Each section is a row: an icon tile, its name, and a one-line summary (left out of the link's name).
  return <div className="page settings-page">
    <PageHeader title={text('الإعدادات', 'Settings')}
      description={text('كل حاجة تخص مطعمك في مكان واحد: البيانات، وشكل المنيو، والمواعيد، والطلبات، وحسابك.', 'Everything about your restaurant in one place: details, menu look, hours, ordering and your account.')} />
    <div className="settings-shell">
      <nav ref={nav} className="settings-nav" aria-label={text('أقسام الإعدادات', 'Settings sections')}>
        {sections.map(section => <NavLink key={section.to} to={section.to} end={section.end} className="settings-nav-link">
          <span className="settings-nav-icon" aria-hidden="true"><section.icon size={19} weight="bold" /></span>
          <span className="settings-nav-text"><strong>{section.label}</strong><small aria-hidden="true">{section.hint}</small></span>
        </NavLink>)}
      </nav>
      <div className="settings-content"><Outlet /></div>
    </div>
  </div>;
}
