import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CaretDownIcon, SparkleIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import './products-menu.css';

type Item = { label: string; to: string };
type Group = { title: string; items: Item[] };

/** The "Products" entry of the header: a mega menu on desktop, an expandable list in the mobile menu. */
export function ProductsMenu({ onNavigate }: { onNavigate: () => void }) {
  const { text } = useLanguage();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);

  const features = [
    { to: '/features/pos', image: '/media/business/takeaway.jpg', badge: text('جديد', 'New'), title: text('كاشير بالهنا', 'Bilhanah POS'), body: text('بيع أسرع على أي جهاز، وكل طلب يروح للمطبخ.', 'Sell faster on any device; every order reaches the kitchen.') },
    { to: '/features/loyalty', image: '/media/ready.jpg', badge: text('جديد', 'New'), title: text('الولاء والنقاط', 'Loyalty & points'), body: text('زباين بترجع تاني، بنقاط ومكافآت باسم مطعمك.', 'Guests who come back, with points and rewards in your name.') },
    { to: '/shop', image: '/media/nfc-acrylic-table-brand-v1.jpg', badge: text('مميز', 'Featured'), title: text('متجر حوامل QR وNFC', 'QR & NFC stand shop'), body: text('حوامل وستيكرات بتصميم مطعمك، جاهزة للترابيزة.', 'Stands and stickers in your design, ready for the table.') },
  ];
  const columns: Group[][] = [
    [
      { title: text('استقبل زباينك', 'Welcome guests'), items: [
        { label: text('المنيو الرقمي وQR', 'Digital menu & QR'), to: '/features/menu' },
        { label: text('الطلب من الموبايل', 'Mobile ordering'), to: '/features/ordering' },
        { label: text('الترشيحات الذكية', 'Smart suggestions'), to: '/features#guests' },
      ] },
      { title: text('رجّع زباينك', 'Bring guests back'), items: [
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
      { title: text('المتجر', 'Shop'), items: [
        { label: text('حوامل أكريليك QR وNFC', 'Acrylic QR & NFC stands'), to: '/shop?item=stand' },
        { label: text('ستيكرات الترابيزة', 'Table stickers'), to: '/shop?item=sticker' },
        { label: text('باكدج البراند', 'Branding pack'), to: '/shop?item=branding' },
        { label: text('تصميم مخصوص', 'Custom design'), to: '/shop?item=custom' },
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
          {/* Bilhanah IQ is not released yet: shown, but not a link. */}
          <div className="pm-card is-soon" aria-label={text('Bilhanah IQ، قريبًا', 'Bilhanah IQ, coming soon')}>
            <span className="pm-thumb is-iq" aria-hidden="true"><SparkleIcon weight="fill" /></span>
            <span className="pm-card-copy">
              <em className="pm-badge is-soon">{text('قريبًا', 'Coming soon')}</em>
              <strong>Bilhanah IQ</strong>
              <small>{text('مساعد ذكي بيساعدك تدير مطعمك، ويقترح خطط تزوّد مبيعاتك وتجذب زباين أكتر.', 'An AI assistant that helps you run your restaurant and suggests plans to grow sales and bring in more guests.')}</small>
            </span>
          </div>
          {features.map(card => <Link key={card.to} to={card.to} className="pm-card" onClick={go}>
          <span className="pm-thumb"><img src={card.image} alt="" loading="lazy" /></span>
          <span className="pm-card-copy">
            {card.badge && <em className="pm-badge">{card.badge}</em>}
            <strong>{card.title}</strong>
            <small>{card.body}</small>
          </span>
        </Link>)}
        </div>
        <div className="pm-columns">{columns.map((column, index) => <div key={index} className="pm-column">
          {column.map(group => <div key={group.title} className="pm-group">
            <p className="pm-group-title">{group.title}</p>
            <ul>{group.items.map(item => <li key={item.label}><Link to={item.to} onClick={go}>{item.label}</Link></li>)}</ul>
          </div>)}
        </div>)}</div>
      </div>
      <div className="pm-foot"><Link to="/features" onClick={go}>{text('شوف كل المنتجات', 'See all products')}</Link><span aria-hidden="true">·</span><Link to="/pricing" onClick={go}>{text('الأسعار', 'Pricing')}</Link></div>
    </div>
  </div>;
}
