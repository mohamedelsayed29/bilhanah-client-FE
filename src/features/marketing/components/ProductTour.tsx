import { useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { Link } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import { PosDevice } from './PosShowcase';
import './product-tour.css';

type Stop = { id: string; tab: string; title: string; body: string; points: string[]; link?: string; shot?: string; view?: ReactElement };

/** A tabbed tour of the real product: dashboard screenshots and the POS terminal. */
export function ProductTour() {
  const { text, language } = useLanguage();
  const shot = (name: string) => `/media/dashboard/${name}-${language}.webp`;
  const stops: Stop[] = [
    { id: 'menu', tab: text('المنيو', 'Menu'), title: text('منيو بيتعدّل في ثواني', 'A menu you change in seconds'), body: text('أقسام وأصناف بصورها وأحجامها وأسعارها، عربي وإنجليزي، والتعديل بيوصل للزبون على طول.', 'Categories and dishes with photos, sizes and prices, in Arabic and English. Changes reach guests at once.'),
      points: [text('وقّف صنف خلص بضغطة', 'Mark a dish sold out in one tap'), text('QR لكل طاولة وحوامل NFC', 'A QR per table, and NFC stands'), text('ثيم ولوجو وألوان مطعمك', 'Your theme, logo and colours')], link: '/features/menu', shot: shot('menu') },
    { id: 'tables', tab: text('الطلبات والطاولات', 'Orders & tables'), title: text('الصالة كلها قدامك', 'The whole floor at a glance'), body: text('كل طاولة وحالتها، الطلبات اللي داخلة، وطلبات الويتر والحساب، لحظة بلحظة.', 'Every table and its status, incoming orders, and waiter and bill requests, live.'),
      points: [text('طلبات الترابيزة والاستلام', 'Table and pickup orders'), text('دمج ونقل الطاولات', 'Merge and move tables'), text('شاشة للمطبخ لكل محطة', 'A kitchen screen per station')], link: '/features/ordering', shot: shot('tables') },
    { id: 'pos', tab: text('الكاشير', 'POS'), title: text('كاشير سريع على أي جهاز', 'A fast POS on any device'), body: text('من نفس المنيو والطاولات. الدفع المقسّم والضريبة والخدمة والإيصال، وكل طلب بيروح للمطبخ.', 'From the same menu and tables. Split payments, tax, service and receipts, and every order goes to the kitchen.'),
      points: [text('كاش وكارت ومحفظة على نفس الحساب', 'Cash, card and wallet on one bill'), text('وردية وخزنة لكل كاشير', 'A shift and drawer per cashier'), text('خصم بصلاحية بس', 'Discounts only with permission')], link: '/features/pos', view: <PosDevice /> },
    { id: 'insights', tab: text('التقارير', 'Reports'), title: text('أرقامك من غير ما تسأل حد', 'Your numbers without asking anyone'), body: text('الزيارات والطلبات والإيراد يوم بيوم، أكتر الأصناف، وتقارير PDF وCSV جاهزة.', 'Visits, orders and revenue day by day, top dishes, and ready PDF and CSV reports.'),
      points: [text('مقارنة بالفترة اللي قبلها', 'Compared with the previous period'), text('لكل فرع أو لكلهم', 'Per branch or all together'), text('حمّل تقرير نموذجي', 'Download a sample report')], link: '/features/reports', shot: shot('orders') },
    { id: 'branches', tab: text('الفروع', 'Branches'), title: text('فرع واحد أو عشرة', 'One branch or ten'), body: text('لكل فرع منيو وأسعار وفريق ومخزون، وانت شايف الكل من لوحة واحدة.', 'Each branch has its menu, prices, team and stock, and you see them all from one dashboard.'),
      points: [text('صلاحيات لكل موظف', 'Permissions per team member'), text('مخزون وتحويلات بين الفروع', 'Stock and transfers between branches'), text('حتى ١٠ فروع', 'Up to 10 branches')], link: '/pricing', shot: shot('branches') },
  ];
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const stop = stops[active];
  const onKey = (event: KeyboardEvent) => {
    const forward = language === 'ar' ? 'ArrowLeft' : 'ArrowRight';
    const back = language === 'ar' ? 'ArrowRight' : 'ArrowLeft';
    let next = -1;
    if (event.key === forward) next = (active + 1) % stops.length;
    if (event.key === back) next = (active - 1 + stops.length) % stops.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = stops.length - 1;
    if (next < 0) return;
    event.preventDefault(); setActive(next); tabs.current[next]?.focus();
  };
  return <section className="tour page-container section-space" aria-labelledby="tour-title">
    <div className="tour-head">
      <h2 id="tour-title">{text('شوف بالهنا من جوه', 'See Bilhanah from the inside')}</h2>
      <p>{text('دي شاشات حقيقية من لوحة التحكم، مش تصميمات.', 'These are real screens from the dashboard, not mock-ups.')}</p>
    </div>
    <div className="tour-tabs" role="tablist" aria-label={text('أجزاء المنتج', 'Product areas')} onKeyDown={onKey}>
      {stops.map((item, index) => <button key={item.id} ref={element => { tabs.current[index] = element; }} role="tab" id={`tour-tab-${item.id}`} aria-controls="tour-panel" aria-selected={index === active} tabIndex={index === active ? 0 : -1} onClick={() => setActive(index)}>{item.tab}</button>)}
    </div>
    <div className="tour-panel" id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${stop.id}`}>
      <div className="tour-copy">
        <h3>{stop.title}</h3>
        <p>{stop.body}</p>
        <ul>{stop.points.map(point => <li key={point}>{point}</li>)}</ul>
        {stop.link && <Link className="fx-link tour-link" to={stop.link}>{text('اعرف أكتر', 'Learn more')}<ArrowLeftIcon className="directional-arrow" size={16} /></Link>}
      </div>
      <div className="tour-media">{stop.view ?? <div className="tour-frame"><img key={stop.shot} src={stop.shot} alt={stop.title} width="1600" height="1000" loading="lazy" /></div>}</div>
    </div>
  </section>;
}
