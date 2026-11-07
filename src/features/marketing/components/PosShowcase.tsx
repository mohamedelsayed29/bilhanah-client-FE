import { Link } from 'react-router';
import {
  ArrowLeftIcon, CreditCardIcon, DevicesIcon, LightningIcon, MoneyIcon, PlugsConnectedIcon, ShieldCheckIcon, UserCircleIcon, WalletIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import './pos-showcase.css';

/**
 * A promotional picture of the Bilhanah POS terminal, drawn in HTML so it stays sharp and follows the
 * language. The bill is a worked example: 500 subtotal, 12% service, 14% tax = 630.
 */
export function PosDevice() {
  const { text, number } = useLanguage();
  const categories = [text('الكل', 'All'), text('رئيسي', 'Mains'), text('باستا', 'Pasta'), text('خفيف', 'Light'), text('مشروبات', 'Drinks')];
  const dishes: { name: string; price: number; tone: string; count?: number }[] = [
    { name: text('برجر البيت', 'House burger'), price: 185, tone: 'mains', count: 2 },
    { name: text('فراخ مشوية', 'Grilled chicken'), price: 210, tone: 'mains' },
    { name: text('باستا بيستو', 'Pesto pasta'), price: 155, tone: 'pasta' },
    { name: text('باستا ألفريدو', 'Alfredo pasta'), price: 165, tone: 'pasta' },
    { name: text('سلطة الحديقة', 'Garden salad'), price: 95, tone: 'light', count: 1 },
    { name: text('شوربة عدس', 'Lentil soup'), price: 70, tone: 'light' },
    { name: text('لاتيه', 'Latte'), price: 35, tone: 'drinks', count: 1 },
    { name: text('ليمون نعناع', 'Mint lemonade'), price: 45, tone: 'drinks' },
    { name: text('تشيز كيك', 'Cheesecake'), price: 110, tone: 'desserts' },
  ];
  const cart = [
    { name: text('برجر البيت', 'House burger'), qty: 2, total: 370, note: text('من غير بصل', 'No onions') },
    { name: text('سلطة الحديقة', 'Garden salad'), qty: 1, total: 95 },
    { name: text('لاتيه', 'Latte'), qty: 1, total: 35 },
  ];
  return <figure className="pos-stage" aria-label={text('شكل شاشة كاشير بالهنا', 'The Bilhanah POS screen')}>
    <div className="pos-device">
      <div className="pos-screen" aria-hidden="true">
        <header className="pos-top">
          <span className="pos-brand"><img src="/brand/bilhanah-mark.svg" alt="" />{text('بالهنا POS', 'Bilhanah POS')}</span>
          <span className="pos-chip is-table">{text('ترابيزة ٤', 'Table 4')}</span>
          <span className="pos-chip">{text('صالة', 'Dine-in')}</span>
          <span className="pos-top-end"><span className="pos-live" />{text('متصل', 'Online')}<UserCircleIcon weight="fill" />{text('سارة', 'Sara')}</span>
        </header>
        <div className="pos-body">
          <nav className="pos-cats">{categories.map((category, index) => <span key={category} className={index === 0 ? 'is-on' : ''}>{category}</span>)}</nav>
          <div className="pos-grid">{dishes.map(dish => <div className={`pos-dish tone-${dish.tone} ${dish.count ? 'is-picked' : ''}`} key={dish.name}>
            <span className="pos-dish-name">{dish.name}</span>
            <b>{number(dish.price)}</b>
            {dish.count && <i>{number(dish.count)}</i>}
          </div>)}</div>
          <aside className="pos-cart">
            <p className="pos-cart-title">{text('الطلب', 'Order')} <span>#{number(1048)}</span></p>
            <ul>{cart.map(line => <li key={line.name}>
              <span className="pos-qty">{number(line.qty)}×</span>
              <span className="pos-line">{line.name}{line.note && <small>{line.note}</small>}</span>
              <b>{number(line.total)}</b>
            </li>)}</ul>
            <dl>
              <div><dt>{text('المجموع', 'Subtotal')}</dt><dd>{number(500)}</dd></div>
              <div><dt>{text('خدمة ١٢٪', 'Service 12%')}</dt><dd>{number(60)}</dd></div>
              <div><dt>{text('ضريبة ١٤٪', 'Tax 14%')}</dt><dd>{number(70)}</dd></div>
              <div className="pos-total"><dt>{text('الإجمالي', 'Total')}</dt><dd>{number(630)}</dd></div>
            </dl>
            <div className="pos-pay"><span><MoneyIcon weight="duotone" />{text('كاش', 'Cash')}</span><span><CreditCardIcon weight="duotone" />{text('كارت', 'Card')}</span><span><WalletIcon weight="duotone" />{text('محفظة', 'Wallet')}</span></div>
            <span className="pos-charge">{text(`ادفع ${number(630)} جنيه`, `Charge EGP ${number(630)}`)}</span>
          </aside>
        </div>
      </div>
    </div>
  </figure>;
}

/** The services page: a short statement, then the product itself. */
export function PosHero({ onStart }: { onStart: () => void }) {
  const { text } = useLanguage();
  const facts: { icon: Icon; title: string; body: string }[] = [
    { icon: DevicesIcon, title: text('على أي جهاز', 'Any device'), body: text('كمبيوتر أو تابلت، من غير أجهزة خاصة.', 'A computer or tablet, no special hardware.') },
    { icon: LightningIcon, title: text('أسرع في الزحمة', 'Built for rush hour'), body: text('الطلب يروح للمطبخ في نفس اللحظة.', 'Orders reach the kitchen instantly.') },
    { icon: ShieldCheckIcon, title: text('حساب مضبوط', 'Accurate bills'), body: text('الضريبة والخدمة والخصم من السيرفر.', 'Tax, service and discounts from the server.') },
    { icon: PlugsConnectedIcon, title: text('يشتغل مع سيستمك', 'Works with your stack'), body: text('ربط بأي كاشير بيدعم webhooks.', 'Connect any POS with webhooks.') },
  ];
  return <>
    <section className="page-hero fx-hero" aria-labelledby="page-title">
      <div className="page-container fx-hero-copy">
        <p className="fx-eyebrow">{text('منصة بالهنا للمطاعم', 'The Bilhanah restaurant platform')}</p>
        <h1 id="page-title">{text('مطعمك كله، في نظام واحد.', 'Your whole restaurant, in one system.')}</h1>
        <p className="fx-lead">{text('منيو وطلبات، كاشير ومطبخ، ولاء ومخزون وتقارير. كله متصل، وبتشغّل منه اللي محتاجه بس.', 'Menu and ordering, POS and kitchen, loyalty, inventory and reports. All connected, and you switch on only what you need.')}</p>
        <div className="fx-actions">
          <button className="button button-teal" onClick={onStart}>{text('ابدأ ببلاش ٣٠ يوم', 'Start free for 30 days')}</button>
          <Link className="fx-link" to="/pricing">{text('شوف الأسعار', 'See pricing')}<ArrowLeftIcon className="directional-arrow" size={16} /></Link>
        </div>
      </div>
    </section>
    <div className="page-container fx-device"><PosDevice /></div>
    <div className="page-container">
      <ul className="fx-facts">{facts.map(({ icon: FactIcon, title, body }) => <li key={title}>
        <FactIcon size={22} aria-hidden="true" />
        <strong>{title}</strong>
        <p>{body}</p>
      </li>)}</ul>
    </div>
  </>;
}
