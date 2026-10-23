import { ArrowLeftIcon, ArrowUpIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';
import { Brand } from '../../../components/Brand';
import { useLanguage } from '../../../lib/language';

export function Footer({ onStart, showClosing = true }: { onStart: () => void; showClosing?: boolean }) {
  const { text } = useLanguage();
  const columns = [
    { title: text('المنتج', 'Product'), links: [
      { href: '/#features', label: text('المميزات', 'Features') },
      { href: '/shop', label: text('متجر حوامل QR وNFC', 'QR & NFC stand shop') },
      { href: '/#how-it-works', label: text('إزاي بيشتغل', 'How it works') },
      { href: '/#pricing', label: text('الباقات والأسعار', 'Plans & pricing') },
    ] },
    { title: text('الشركة', 'Company'), links: [
      { href: '/about', label: text('عن بالهنا', 'About Bilhanah') },
      { href: '/contact', label: text('تواصل معانا', 'Contact us') },
      { href: '/#faq', label: text('الأسئلة الشائعة', 'FAQ') },
    ] },
    { title: text('قانوني', 'Legal'), links: [
      { href: '/privacy', label: text('سياسة الخصوصية', 'Privacy policy') },
      { href: '/terms', label: text('شروط الاستخدام', 'Terms of service') },
    ] },
  ];
  return <>
    {showClosing && <section id="your-next-menu" className="closing-section page-container" aria-labelledby="closing-title">
      <img className="closing-image" src="/media/food-truck-order-ready-v1.jpg" width="1672" height="941" loading="lazy" decoding="async" alt={text('مشهد توضيحي لعربية أكل عليها QR وعملاء على ترابيزات خارجية، وموبايل يعرض طلبك جاهز مع علامات اهتزاز.', 'Illustrative food truck with an exterior QR sign and customers at outdoor tables. A phone shows an order-ready alert with vibration marks.')} />
      <div className="closing-shade" aria-hidden="true" />
      <div className="closing-inner">
        <div className="closing-copy"><h2 id="closing-title">{text('سيب انطباع حلو من قبل أول لقمة', 'Make a good impression before the first bite')}</h2><p>{text('إنت ركّز في الأكل والضيافة، وسيب المنيو علينا.', 'You focus on the food and the welcome. Leave the menu to us.')}</p></div>
        <div className="closing-action"><button className="button button-guava" onClick={onStart}>{text('ابدأ تجربتك المجانية', 'Start your free trial')}<ArrowLeftIcon className="directional-arrow" size={20} /></button><span>{text('٣٠ يوم مجانًا على الباقة الكاملة.', '30 days free on the Full Experience plan.')}</span></div>
      </div>
    </section>}
    <footer className="site-footer">
      <div className="page-container">
        <div className="footer-main">
          <div className="footer-brand">
            <Brand inverse />
            <p>{text('منيو رقمي وطلبات من الترابيزة للمطاعم والكافيهات في مصر.', 'Digital menus and table ordering for restaurants and cafés in Egypt.')}</p>
          </div>
          <div className="footer-links">{columns.map(column => <nav key={column.title} className="footer-column" aria-label={column.title}>
            <h3>{column.title}</h3>
            <ul>{column.links.map(link => <li key={link.href}><Link to={link.href}>{link.label}</Link></li>)}</ul>
          </nav>)}</div>
        </div>
        <div className="footer-bottom">
          <span>{text('© ٢٠٢٦ بالهنا. كل الحقوق محفوظة.', '© 2026 Bilhanah. All rights reserved.')}</span>
          <a className="footer-top" href="#main-content" onClick={event => { event.preventDefault(); window.scrollTo({ top: 0 }); }}>{text('لفوق', 'Back to top')}<ArrowUpIcon size={14} /></a>
        </div>
      </div>
    </footer>
  </>;
}
