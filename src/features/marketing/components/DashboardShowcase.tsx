import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ArrowLeftIcon, ChartLineUpIcon, ForkKnifeIcon, StorefrontIcon, TableIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import './dashboard-showcase.css';

type Bilingual = { ar: string; en: string };
type View = { key: string; icon: Icon; title: Bilingual; description: Bilingual; points: Bilingual[]; alt: Bilingual };

/** Four views of the real restaurant dashboard (screenshots of the demo restaurant, in both languages). */
const VIEWS: View[] = [
  { key: 'orders', icon: ChartLineUpIcon,
    title: { ar: 'الطلبات والإيرادات', en: 'Orders & revenue' },
    description: { ar: 'زيارات المنيو، عدد الطلبات، والإيراد يوم بيوم، لكل فرع أو للمطعم كله.', en: 'Menu visits, orders and revenue day by day, for one branch or the whole restaurant.' },
    points: [{ ar: 'إيراد ومتوسط الطلب', en: 'Revenue and average order' }, { ar: 'آخر ٧ أو ٣٠ أو ٩٠ يوم', en: 'Last 7, 30 or 90 days' }],
    alt: { ar: 'صفحة الإحصائيات في لوحة تحكم بالهنا: زيارات المنيو، الطلبات، إيراد الطلبات، ومتوسط الطلب، مع رسم يوم بيوم.', en: 'The Bilhanah dashboard insights page: menu visits, orders, order revenue and average order, with day-by-day charts.' } },
  { key: 'tables', icon: TableIcon,
    title: { ar: 'الطاولات النشطة', en: 'Active tables' },
    description: { ar: 'خريطة صالتك قدامك: مين فاضي، مين مشغول، ومين محجوز، ولكل طاولة QR خاص بيها.', en: 'Your floor at a glance: which tables are free, occupied or reserved, each with its own QR code.' },
    points: [{ ar: 'مناطق داخلي وخارجي وVIP', en: 'Indoor, outdoor and VIP areas' }, { ar: 'حجوزات وحالة كل طاولة', en: 'Reservations and live status' }],
    alt: { ar: 'صفحة إدارة الطاولات: عدد الطاولات المتاحة والمشغولة والمحجوزة، وخريطة الصالة بالمناطق.', en: 'The tables page: available, occupied and reserved counts, and the floor plan by area.' } },
  { key: 'menu', icon: ForkKnifeIcon,
    title: { ar: 'أداء المنيو', en: 'Menu performance' },
    description: { ar: 'أكتر الأطباق طلبًا وإيراد كل طبق، والزبون وصل للمنيو منين.', en: 'Your best-selling dishes and what each one earns, and how diners found your menu.' },
    points: [{ ar: 'أكتر ٥ أطباق مبيعًا', en: 'Top five dishes' }, { ar: 'صالة أو تيك أواي', en: 'Dine-in versus pickup' }],
    alt: { ar: 'أداء المنيو: أكتر الأطباق طلبًا بالكمية والإيراد، ومصدر زيارات المنيو.', en: 'Menu performance: top dishes by quantity and revenue, and where menu visits came from.' } },
  { key: 'branches', icon: StorefrontIcon,
    title: { ar: 'إدارة الفروع', en: 'Branch management' },
    description: { ar: 'كل فرع بعنوانه ومواعيده وطاولاته وفريقه، ومنيو واحد بأسعار وتوفر لكل فرع.', en: 'Each branch with its own address, hours, tables and team, sharing one menu with per-branch prices.' },
    points: [{ ar: 'الطلبات النشطة لكل فرع', en: 'Active orders per branch' }, { ar: 'صنف خلص أو مخفي في فرع بعينه', en: 'Sold out or hidden per branch' }],
    alt: { ar: 'صفحة الفروع: كل فرع بعنوانه ورقمه، وطلباته النشطة وطاولاته وحساباته.', en: 'The branches page: each branch with its address and phone, active orders, tables and accounts.' } },
];

export function DashboardShowcase({ onStart }: { onStart: () => void }) {
  const { text, language } = useLanguage();
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const view = VIEWS[active]!;
  // Arrow keys move between the tabs (in reading order, so they follow the page direction).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowDown: 1, ArrowUp: -1, ArrowRight: language === 'ar' ? -1 : 1, ArrowLeft: language === 'ar' ? 1 : -1 }[event.key];
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : step === undefined ? null : (active + step + VIEWS.length) % VIEWS.length;
    if (target === null) return;
    event.preventDefault();
    setActive(target);
    tabs.current[target]?.focus();
  };
  return <section id="dashboard" className="control-section section-space" aria-labelledby="control-title">
    <div className="page-container">
      <div className="control-heading">
        <span className="control-eyebrow">{text('لوحة تحكم بالهنا', 'The Bilhanah dashboard')}</span>
        <h2 id="control-title">{text('مطعمك، ', 'Your restaurant, ')}<span>{text('تحت السيطرة.', 'under control.')}</span></h2>
        <p>{text('لوحة تحكم واحدة تتابع منها الطلبات والإيراد، الطاولات، أداء المنيو، وكل فروعك. من الكمبيوتر أو الموبايل.', 'One dashboard to follow orders and revenue, tables, menu performance and every branch, from a laptop or a phone.')}</p>
      </div>

      <div className="control-body">
        <div className="control-tabs" role="tablist" aria-label={text('شاشات لوحة التحكم', 'Dashboard views')} aria-orientation="vertical" onKeyDown={onKeyDown}>
          {VIEWS.map((item, index) => <button key={item.key} ref={element => { tabs.current[index] = element; }} type="button" role="tab"
            id={`${id}-tab-${item.key}`} aria-controls={`${id}-panel`} aria-selected={index === active} tabIndex={index === active ? 0 : -1}
            className={`control-tab ${index === active ? 'is-active' : ''}`} onClick={() => setActive(index)}>
            <span className="control-tab-icon"><item.icon size={22} aria-hidden="true" /></span>
            <span className="control-tab-copy">
              <strong>{item.title[language]}</strong>
              <span>{item.description[language]}</span>
            </span>
          </button>)}
        </div>

        <div className="control-stage" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${view.key}`}>
          <p className="control-stage-text">{view.description[language]}</p>
          <div className="control-frame">
            <div className="control-frame-bar" aria-hidden="true"><i /><i /><i /><span dir="ltr">app.bilhanah.com</span></div>
            <img key={`${view.key}-${language}`} src={`/media/dashboard/${view.key}-${language}.webp`} width="1600" height="1000" loading="lazy" decoding="async" alt={view.alt[language]} />
          </div>
          <ul className="control-points">{view.points.map(point => <li key={point.en}>{point[language]}</li>)}</ul>
        </div>
      </div>

      <div className="control-actions">
        <button className="button button-teal" onClick={onStart}>{text('جرّب لوحة التحكم ٣٠ يوم مجانًا', 'Try the dashboard free for 30 days')}<ArrowLeftIcon className="directional-arrow" size={18} aria-hidden="true" /></button>
        <span>{text('على الباقة الكاملة، من غير تجديد تلقائي.', 'On the Full Experience, with no automatic renewal.')}</span>
      </div>
    </div>
  </section>;
}
