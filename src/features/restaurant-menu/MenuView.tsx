import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ClockIcon, FacebookLogoIcon, GlobeHemisphereWestIcon, GlobeSimpleIcon, InstagramLogoIcon, MagnifyingGlassIcon, MapPinIcon, PhoneIcon, PlusIcon, WhatsappLogoIcon, XIcon } from '@phosphor-icons/react';
import { isOpenAt, WEEKDAYS, type PublicMenuCategory, type PublicMenuItem, type PublicRestaurant } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import { DishSheet } from './DishSheet';
import { useWebAppIdentity } from './web-app';
import { DAY_NAMES, formatPrice, formatTime, hasAnyHours, imageAttributes, localized, readableTextOn, variantLabel } from './menu-format';

export type AvailableRestaurant = Extract<PublicRestaurant, { availability: 'AVAILABLE' }>;

export const DEFAULT_BRAND = '#075e54';

/** What the ordering layer adds to the menu while the restaurant takes orders. */
export type MenuOrdering = {
  /** Header additions, e.g. the scanned table. */
  meta: ReactNode;
  /** Below the header actions, e.g. a link to the diner's recent order. */
  banner: ReactNode;
  /** Cart bar, cart sheet and notices. */
  overlay: ReactNode;
  hasCart: boolean;
  quantityOf: (itemId: string) => number;
  /** The card's add button: dishes with one size go straight to the cart. Returns false to open the dish instead. */
  quickAdd: (item: PublicMenuItem) => boolean;
  /** Size, quantity and note in the dish sheet; `close` dismisses the sheet. */
  addForm: (item: PublicMenuItem, close: () => void) => ReactNode;
};

/** Arabic-insensitive search: ignores case, diacritics, and alef/yaa/taa marbuta variants. */
function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[ً-ٰٟ̀-ͯ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
}

/** "12 Tahrir Street" + "Cairo" → "12 Tahrir Street, Cairo"; Arabic text joins with an Arabic comma. */
function joinAddress(address: string, city: string): string {
  const parts = [address.trim(), city.trim()].filter(Boolean);
  const arabic = /[\u0600-\u06ff]/.test(parts[0] ?? '');
  return parts.join(arabic ? '، ' : ', ');
}

/** wa.me needs an international number; Egyptian mobiles are stored as 01xxxxxxxxx. */
function whatsappLink(number: string): string {
  const digits = number.replace(/\D/g, '');
  return `https://wa.me/${/^01\d{9}$/.test(digits) ? `2${digits}` : digits}`;
}

export function useIsOpen(restaurant: AvailableRestaurant): boolean | null {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return hasAnyHours(restaurant.openingHours) ? isOpenAt(restaurant.openingHours, now, restaurant.timezone) : null;
}

export function MenuView({ restaurant, categories, ordering }: { restaurant: AvailableRestaurant; categories: PublicMenuCategory[]; ordering?: MenuOrdering }) {
  const { language, text, toggleLanguage } = useLanguage();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? '');
  const [openDish, setOpenDish] = useState<PublicMenuItem | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const isOpen = useIsOpen(restaurant);
  const brand = restaurant.brandColor ?? DEFAULT_BRAND;

  useEffect(() => {
    document.title = text(`${restaurant.name} | المنيو`, `${restaurant.name} | Menu`);
  }, [restaurant.name, text]);
  useWebAppIdentity(restaurant.name, brand);

  // Highlight the category being read, and keep its tab in view.
  useEffect(() => {
    if (query) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveCategory(visible.target.id.replace('category-', ''));
    }, { rootMargin: '-140px 0px -55% 0px' });
    document.querySelectorAll('.menu-category').forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [categories, query]);

  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>(`[data-category="${activeCategory}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeCategory]);

  const visibleCategories = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return categories;
    return categories
      .map(category => ({ ...category, items: category.items.filter(item => [item.nameAr, item.nameEn, item.descriptionAr, item.descriptionEn].some(value => value && normalize(value).includes(needle))) }))
      .filter(category => category.items.length > 0);
  }, [categories, query]);

  const style = { '--brand': brand, '--on-brand': readableTextOn(brand) } as CSSProperties;
  const socials = [
    restaurant.whatsappNumber && { href: whatsappLink(restaurant.whatsappNumber), label: text('واتساب', 'WhatsApp'), icon: <WhatsappLogoIcon size={20} /> },
    restaurant.instagramUrl && { href: restaurant.instagramUrl, label: 'Instagram', icon: <InstagramLogoIcon size={20} /> },
    restaurant.facebookUrl && { href: restaurant.facebookUrl, label: 'Facebook', icon: <FacebookLogoIcon size={20} /> },
    restaurant.websiteUrl && { href: restaurant.websiteUrl, label: text('الموقع', 'Website'), icon: <GlobeSimpleIcon size={20} /> },
  ].filter(link => !!link);

  return <div className={`menu-page ${ordering?.hasCart ? 'has-cart' : ''}`} style={style}>
    <header className="menu-header">
      <div className={`menu-cover ${restaurant.cover ? '' : 'menu-cover-plain'}`}>
        {restaurant.cover && <img {...imageAttributes(restaurant.cover, '100vw')} alt="" fetchPriority="high" />}
        <button className="menu-language" onClick={toggleLanguage} aria-label={text('Switch to English', 'التبديل للعربية')}><GlobeHemisphereWestIcon size={18} /><span>{text('EN', 'عربي')}</span></button>
      </div>
      <div className="menu-container menu-identity">
        {restaurant.logo
          ? <img className="menu-logo" {...imageAttributes(restaurant.logo, '88px')} alt={text(`شعار ${restaurant.name}`, `${restaurant.name} logo`)} />
          : <span className="menu-logo menu-logo-initial" aria-hidden="true">{restaurant.name.trim().charAt(0)}</span>}
        <h1>{restaurant.name}</h1>
        <div className="menu-meta">
          {isOpen !== null && <span className={`open-badge ${isOpen ? 'is-open' : 'is-closed'}`}><ClockIcon size={15} weight="bold" />{isOpen ? text('مفتوح دلوقتي', 'Open now') : text('مقفول دلوقتي', 'Closed now')}</span>}
          {ordering?.meta}
          {/* Owners write the address in either language: it keeps its own direction and punctuation. */}
          <span className="menu-address"><MapPinIcon size={17} aria-hidden="true" /><bdi dir="auto">{joinAddress(restaurant.address, restaurant.city)}</bdi></span>
        </div>
        <div className="menu-actions">
          <a className="menu-action" href={`tel:${restaurant.phone}`}><PhoneIcon size={20} /><span>{text('اتصل', 'Call')}</span></a>
          {socials.map(link => <a className="menu-action" key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">{link.icon}<span>{link.label}</span></a>)}
        </div>
        {ordering?.banner}
      </div>
    </header>

    <main className="menu-container menu-body" id="menu">
      {categories.length === 0 ? <p className="menu-empty">{text('المنيو بيتجهز، وهيظهر هنا قريب.', 'The menu is being prepared and will appear here soon.')}</p> : <>
        <div className="menu-toolbar">
          <label className="menu-search">
            <MagnifyingGlassIcon size={19} aria-hidden="true" />
            <span className="visually-hidden">{text('ابحث في المنيو', 'Search the menu')}</span>
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={text('بتدور على إيه؟', 'What are you craving?')} enterKeyHint="search" />
            {query && <button type="button" className="menu-search-clear" onClick={() => setQuery('')} aria-label={text('مسح البحث', 'Clear search')}><XIcon size={16} /></button>}
          </label>
          {!query && categories.length > 1 && <nav className="menu-tabs" ref={tabsRef} aria-label={text('أقسام المنيو', 'Menu sections')}>
            {categories.map(category => <a key={category.id} href={`#category-${category.id}`} data-category={category.id} className={activeCategory === category.id ? 'active' : ''} aria-current={activeCategory === category.id ? 'true' : undefined} onClick={() => setActiveCategory(category.id)}>{localized(language, category.nameAr, category.nameEn)}</a>)}
          </nav>}
        </div>

        {query && <p className="menu-search-status" role="status">{visibleCategories.length ? text(`نتايج البحث عن "${query.trim()}"`, `Results for "${query.trim()}"`) : text('مفيش أكلة بالاسم ده. جرّب كلمة تانية.', 'No dishes match. Try another word.')}</p>}

        {visibleCategories.map(category => <section className="menu-category" id={`category-${category.id}`} key={category.id} aria-labelledby={`heading-${category.id}`}>
          <h2 id={`heading-${category.id}`}>{localized(language, category.nameAr, category.nameEn)}</h2>
          <ul className="dish-list">
            {category.items.map(item => <li key={item.id}>{ordering
              ? <OrderableDishCard item={item} quantity={ordering.quantityOf(item.id)} onOpen={() => setOpenDish(item)} onAdd={() => { if (!ordering.quickAdd(item)) setOpenDish(item); }} />
              : <DishCard item={item} onOpen={() => setOpenDish(item)} />}</li>)}
          </ul>
        </section>)}

        {hasAnyHours(restaurant.openingHours) && <section className="menu-hours" aria-labelledby="hours-heading">
          <h2 id="hours-heading">{text('مواعيد العمل', 'Opening hours')}</h2>
          <dl>{WEEKDAYS.map(day => <div key={day}><dt>{DAY_NAMES[day][language]}</dt><dd>{restaurant.openingHours![day].length ? restaurant.openingHours![day].map(range => `${formatTime(range.opens, language)} – ${formatTime(range.closes, language)}`).join(text('، ', ', ')) : text('مقفول', 'Closed')}</dd></div>)}</dl>
        </section>}
      </>}
    </main>

    <footer className="menu-footer"><a href="https://bilhanah.com" target="_blank" rel="noopener">{text('منيو رقمي من بالهنا', 'Digital menu by Bilhanah')}</a></footer>
    {openDish && <DishSheet item={openDish} onClose={() => setOpenDish(null)} addForm={ordering && (close => ordering.addForm(openDish, close))} />}
    {ordering?.overlay}
  </div>;
}

function DishCard({ item, onOpen }: { item: PublicMenuItem; onOpen: () => void }) {
  const { language, text } = useLanguage();
  const name = localized(language, item.nameAr, item.nameEn);
  const description = localized(language, item.descriptionAr, item.descriptionEn);
  const prices = item.variants.map(variant => variant.pricePiastres);
  const [lowest, highest] = [Math.min(...prices), Math.max(...prices)];
  return <button type="button" className={`dish-card ${item.isAvailable ? '' : 'sold-out'}`} onClick={onOpen} aria-haspopup="dialog">
    <span className="dish-text">
      <span className="dish-name">{name}</span>
      {description && <span className="dish-description">{description}</span>}
      <span className="dish-price-line">
        {item.variants.length > 1 && <span className="dish-from">{text('من', 'From')}</span>}
        <strong>{formatPrice(lowest, language)}</strong>{lowest !== highest && <> – <strong>{formatPrice(highest, language)}</strong></>} <small>{text('ج.م', 'EGP')}</small>
        {item.variants.length > 1 && <span className="dish-sizes">{item.variants.map(variant => variantLabel(variant, language)).join(' · ')}</span>}
      </span>
      {!item.isAvailable && <span className="sold-out-badge">{text('خلصت النهارده', 'Sold out today')}</span>}
    </span>
    {item.image && <img className="dish-thumb" {...imageAttributes(item.image, '112px')} alt="" loading="lazy" decoding="async" />}
  </button>;
}

/** A dish card with an add button beside it (a button cannot hold another button). */
function OrderableDishCard({ item, quantity, onOpen, onAdd }: { item: PublicMenuItem; quantity: number; onOpen: () => void; onAdd: () => void }) {
  const { language, text, number } = useLanguage();
  const name = localized(language, item.nameAr, item.nameEn);
  return <div className={`dish-item ${item.image ? '' : 'no-image'}`}>
    <DishCard item={item} onOpen={onOpen} />
    {item.isAvailable && <button type="button" className={`dish-add ${quantity ? 'in-cart' : ''}`} onClick={onAdd}
      aria-label={quantity ? text(`أضف ${name} تاني، في طلبك ${number(quantity)}`, `Add another ${name}, ${quantity} in your order`) : text(`أضف ${name} للطلب`, `Add ${name} to your order`)}>
      <PlusIcon size={20} weight="bold" />{quantity > 0 && <span className="dish-add-count" aria-hidden="true">{number(quantity)}</span>}
    </button>}
  </div>;
}
