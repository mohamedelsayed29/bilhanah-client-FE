import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CaretDownIcon, WhatsappLogoIcon } from '@phosphor-icons/react';
import { IqIcon } from '../../../components/IqIcon';
import { useLanguage } from '../../../lib/language';
import './products-menu.css';

/** `soon`: announced, not released yet (the page says so too). */
type Item = { label: string; to: string; soon?: boolean };
type Group = { title: string; items: Item[] };

/** The "Products" entry of the header: a mega menu on desktop, an expandable list in the mobile menu. */
export function ProductsMenu({ onNavigate }: { onNavigate: () => void }) {
  const { text } = useLanguage();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);

  const features = [
    { to: '/features/pos', image: '/media/business/takeaway.jpg', badge: text('جديد', 'New'), title: text('كاشير بالهنا', 'Bilhanah POS'), body: text('بيع أسرع على أي جهاز', 'Sell faster on any device') },
    { to: '/features/loyalty', image: '/media/ready.jpg', badge: text('جديد', 'New'), title: text('الولاء والنقاط', 'Loyalty & points'), body: text('نقاط ومكافآت باسم مطعمك', 'Points and rewards in your name') },
    { to: '/products', image: '/media/nfc-acrylic-table-brand-v1.jpg', badge: text('مميز', 'Featured'), title: text('منتجات QR وNFC', 'QR & NFC products'), body: text('حوامل وستيكرات بتصميمك', 'Stands and stickers in your design') },
  ];
  const columns: Group[][] = [
    [
      { title: text('استقبل زباينك', 'Welcome guests'), items: [
        { label: text('المنيو الرقمي وQR', 'Digital menu & QR'), to: '/features/menu' },
        { label: text('الطلب من الموبايل', 'Mobile ordering'), to: '/features/ordering' },
        { label: text('الترشيحات الذكية', 'Smart suggestions'), to: '/features#guests' },
      ] },
      { title: text('رجّع زباينك', 'Bring guests back'), items: [
        { label: text('CRM وواتساب', 'CRM & WhatsApp'), to: '/features/crm', soon: true },
        { label: text('الولاء والنقاط', 'Loyalty & points'), to: '/features/loyalty' },
        { label: text('التقييمات وآراء الزباين', 'Reviews & feedback'), to: '/features/reviews' },
      ] },
    ],
    [
      { title: text('شغّل مطعمك', 'Run your restaurant'), items: [
        { label: text('الكاشير (POS)', 'Point of sale'), to: '/features/pos' },
        { label: text('شاشة المطبخ', 'Kitchen display'), to: '/features#operations' },
        { label: text('الطاولات والحجوزات', 'Tables & reservations'), to: '/features#operations' },
        { label: text('الفروع', 'Branches'), to: '/features#operations' },
      ] },
      { title: text('الربط والتكامل', 'Integrations'), items: [
        { label: text('Webhooks وسيستم الكاشير', 'Webhooks & your POS'), to: '/features#integrations' },
        { label: text('واتساب وجوجل', 'WhatsApp & Google'), to: '/features#integrations' },
      ] },
    ],
    [
      { title: text('اتحكم في أرقامك', 'Know your numbers'), items: [
        { label: text('التقارير والإحصائيات', 'Reports & insights'), to: '/features/reports' },
        { label: text('المخزون وتكلفة الطبق', 'Inventory & costing'), to: '/features/inventory' },
        { label: text('الخزنة والورديات', 'Cash drawer & shifts'), to: '/features#numbers' },
        { label: text('حضور الموظفين', 'Staff attendance'), to: '/features#numbers' },
      ] },
      { title: text('المنتجات', 'Products'), items: [
        { label: text('حوامل أكريليك QR وNFC', 'Acrylic QR & NFC stands'), to: '/products?item=stand' },
        { label: text('ستيكرات الترابيزة', 'Table stickers'), to: '/products?item=sticker' },
        { label: text('باكدج البراند', 'Branding pack'), to: '/products?item=branding' },
        { label: text('تصميم مخصوص', 'Custom design'), to: '/products?item=custom' },
      ] },
    ],
  ];

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onClick = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const enter = () => { window.clearTimeout(closeTimer.current); setOpen(true); };
  const leave = () => { closeTimer.current = window.setTimeout(() => setOpen(false), 140); };
  const go = () => { setOpen(false); onNavigate(); };

  return <div className={`pm ${open ? 'is-open' : ''}`} ref={root} onMouseEnter={enter} onMouseLeave={leave}>
    <button type="button" className="pm-trigger" aria-expanded={open} aria-controls="products-menu" onClick={() => setOpen(value => !value)}>
      {text('المنتجات', 'Products')}<CaretDownIcon size={14} weight="bold" aria-hidden="true" />
    </button>
    <div className="pm-panel" id="products-menu" hidden={!open}>
      <div className="pm-inner">
        <div className="pm-features">
          <p className="pm-group-title">{text('مميز', 'Featured')}</p>
          {/* Bilhanah IQ and CRM are not released yet: their pages say so. */}
          <Link to="/features/iq" className="pm-card" onClick={go}>
            <span className="pm-thumb is-iq" aria-hidden="true"><IqIcon size={40} /></span>
            <span className="pm-card-copy">
              <strong>Bilhanah IQ<em className="pm-badge is-soon">{text('قريبًا', 'Soon')}</em></strong>
              <small>{text('مساعد ذكي لمطعمك', 'Your restaurant’s AI assistant')}</small>
            </span>
          </Link>
          <Link to="/features/crm" className="pm-card" onClick={go}>
            <span className="pm-thumb is-crm" aria-hidden="true"><WhatsappLogoIcon weight="fill" /></span>
            <span className="pm-card-copy">
              <strong>{text('CRM وواتساب', 'CRM & WhatsApp')}<em className="pm-badge is-soon">{text('قريبًا', 'Soon')}</em></strong>
              <small>{text('ملفات الزباين وصندوق واتساب', 'Guest profiles and a WhatsApp inbox')}</small>
            </span>
          </Link>
          {features.map(card => <Link key={card.to} to={card.to} className="pm-card" onClick={go}>
            <span className="pm-thumb"><img src={card.image} alt="" loading="lazy" /></span>
            <span className="pm-card-copy">
              <strong>{card.title}{card.badge && <em className="pm-badge">{card.badge}</em>}</strong>
              <small>{card.body}</small>
            </span>
          </Link>)}
        </div>
        <div className="pm-columns">{columns.map((column, index) => <div key={index} className="pm-column">
          {column.map(group => <div key={group.title} className="pm-group">
            <p className="pm-group-title">{group.title}</p>
            <ul>{group.items.map(item => <li key={item.label}><Link to={item.to} onClick={go}>{item.label}{item.soon && <em className="pm-tag">{text('قريبًا', 'Soon')}</em>}</Link></li>)}</ul>
          </div>)}
        </div>)}</div>
      </div>
      <div className="pm-foot"><Link to="/features" onClick={go}>{text('شوف كل المنتجات', 'See all products')}</Link><span aria-hidden="true">·</span><Link to="/pricing" onClick={go}>{text('الأسعار', 'Pricing')}</Link></div>
    </div>
  </div>;
}
