import { useState } from 'react';
import { ArrowLeftIcon, ContactlessPaymentIcon, PaintBrushIcon, QrCodeIcon, ShoppingCartSimpleIcon, SquaresFourIcon, StackIcon, StickerIcon, StorefrontIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useLanguage } from '../../lib/language';
import { productOf, productPrices, purposes, shapeName, type ProductId, type PurposeId, type ShapeId } from './catalog';
import { services, type ServiceId } from './ServiceRequest';

type Category = 'stands' | 'stickers' | 'services';
type Bilingual = { ar: string; en: string };

/**
 * What the shop sells, as cards. Every card is a real product or service: the stand shapes and the
 * review stand open the same designer with that shape or purpose chosen; services open their quote form.
 */
export type CatalogItem = {
  key: string;
  category: Category;
  image: string;
  /** Position of the photo's subject, so each crop shows the product. */
  focus?: string;
  tag: Bilingual;
} & ({ product: ProductId; shape?: ShapeId; purpose?: PurposeId; name?: Bilingual; description?: Bilingual; service?: never } | { service: ServiceId; product?: never; shape?: never; purpose?: never; name?: never; description?: never });

export const catalogItems: readonly CatalogItem[] = [
  { key: 'stand', category: 'stands', product: 'stand', image: '/media/acrylic-stand-cafe-v1.jpg', focus: '50% 55%', tag: { ar: 'QR مع NFC اختياري', en: 'QR, NFC optional' } },
  { key: 'sticker', category: 'stickers', product: 'sticker', image: '/media/table-stickers-v1.jpg', focus: '55% 62%', tag: { ar: 'مربع أو دايرة', en: 'Square or round' } },
  { key: 'branding', category: 'services', service: 'branding', image: '/media/branding-pack-v1.jpg', focus: '55% 50%', tag: { ar: 'للسلاسل والفروع', en: 'For chains' } },
  { key: 'custom', category: 'services', service: 'custom', image: '/media/custom-design-v2.jpg', focus: '50% 60%', tag: { ar: 'خدمة إضافية', en: 'Add-on service' } },
  { key: 'stand-arch', category: 'stands', product: 'stand', shape: 'arch', image: '/media/nfc-arch-v1.jpg', tag: { ar: 'شكل قوس', en: 'Arch shape' },
    name: { ar: 'حامل أكريليك قوس', en: 'Arch acrylic stand' }, description: { ar: 'انحناءة ناعمة بشخصية مختلفة على الترابيزة.', en: 'A soft curve with its own character on the table.' } },
  { key: 'stand-tilt', category: 'stands', product: 'stand', shape: 'tilt', image: '/media/nfc-tilt-v1.jpg', tag: { ar: 'شكل مائل', en: 'Tilted' },
    name: { ar: 'حامل أكريليك مائل', en: 'Tilted acrylic stand' }, description: { ar: 'ميلة خفيفة تخلي الكود سهل المسح من الكرسي.', en: 'A gentle lean that makes the code easy to scan from the seat.' } },
  { key: 'stand-wood', category: 'stands', product: 'stand', shape: 'wood', image: '/media/nfc-wood-v1.jpg', tag: { ar: 'قاعدة خشب', en: 'Wood base' },
    name: { ar: 'حامل بقاعدة خشب', en: 'Wood-base stand' }, description: { ar: 'أكريليك شفاف على قاعدة خشب طبيعي، دافي وأنيق.', en: 'Clear acrylic in a natural wood base, warm and refined.' } },
  { key: 'stand-reviews', category: 'stands', product: 'stand', purpose: 'reviews', image: '/media/nfc-acrylic-table-v1.jpg', focus: '50% 45%', tag: { ar: 'تقييمات Google', en: 'Google reviews' },
    name: { ar: 'حامل تقييمات Google', en: 'Google review stand' }, description: { ar: 'ضيفك يقيّمك على Google بسكان أو لمسة موبايل.', en: 'Guests review you on Google with a scan or a tap.' } },
];

const CATEGORIES: { id: Category | 'all'; icon: Icon; name: Bilingual }[] = [
  { id: 'all', icon: SquaresFourIcon, name: { ar: 'كل المنتجات', en: 'All products' } },
  { id: 'stands', icon: StackIcon, name: { ar: 'حوامل أكريليك', en: 'Acrylic stands' } },
  { id: 'stickers', icon: StickerIcon, name: { ar: 'ستيكرز الترابيزة', en: 'Table stickers' } },
  { id: 'services', icon: StorefrontIcon, name: { ar: 'هوية المطعم', en: 'Restaurant branding' } },
];

type Sort = 'featured' | 'price-low' | 'price-high';

/** The price a card shows: the product's base price, or null for a quoted service. */
const fromPrice = (item: CatalogItem) => (item.product ? productPrices(item.product).unit : null);

export function ShopCatalog({ onOpen }: { onOpen: (item: CatalogItem) => void }) {
  const { text, language, number } = useLanguage();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [sort, setSort] = useState<Sort>('featured');
  const shown = catalogItems.filter(item => category === 'all' || item.category === category);
  if (sort !== 'featured') {
    // Quoted services have no price; they stay at the end either way.
    shown.sort((a, b) => {
      const first = fromPrice(a), second = fromPrice(b);
      if (first === null || second === null) return first === second ? 0 : first === null ? 1 : -1;
      return sort === 'price-low' ? first - second : second - first;
    });
  }
  const nameOf = (item: CatalogItem) => item.service ? services.find(entry => entry.id === item.service)!.name[language]
    : item.name?.[language] ?? productOf(item.product).name[language];
  const descriptionOf = (item: CatalogItem) => item.service ? services.find(entry => entry.id === item.service)!.description[language]
    : item.description?.[language] ?? productOf(item.product).description[language];
  const features: { icon: Icon; label: string }[] = [
    { icon: QrCodeIcon, label: text('منيو QR', 'QR menus') },
    { icon: ContactlessPaymentIcon, label: text('حوامل NFC', 'NFC stands') },
    { icon: StickerIcon, label: text('ستيكرز ترابيزة', 'Table stickers') },
    { icon: PaintBrushIcon, label: text('تصميم مخصوص', 'Custom design') },
  ];
  return <div className="shop-catalog">
    <section className="shop-hero" aria-labelledby="shop-hero-title">
      <div className="shop-hero-copy page-container">
        <span className="shop-hero-eyebrow">{text('حلول ديجيتال للمطاعم والكافيهات', 'Digital solutions for restaurants & cafés')}</span>
        <h1 id="shop-hero-title" tabIndex={-1}>{text('أدوات ذكية لمطعمك وكافيهك.', 'Smart tools for modern restaurants.')}</h1>
        <p>{text('حوامل QR وNFC، وستيكرز للترابيزات، وتصميم بهوية مطعمك. كله معمول عشان ضيفك يوصل للمنيو في ثانية.', 'QR and NFC stands, table stickers and designs in your brand, all made so guests reach your menu in a second.')}</p>
        <ul className="shop-hero-features">
          {features.map(feature => <li key={feature.label}><span aria-hidden="true"><feature.icon size={18} weight="bold" /></span>{feature.label}</li>)}
        </ul>
      </div>
      <img className="shop-hero-image" src="/media/acrylic-stand-cafe-v1.jpg" alt="" width="1536" height="1024" fetchPriority="high" />
    </section>

    <div className="shop-catalog-body page-container">
      <div className="shop-filters">
        <div className="shop-categories" role="group" aria-label={text('التصنيفات', 'Categories')}>
          {CATEGORIES.map(entry => <button key={entry.id} type="button" aria-pressed={category === entry.id} onClick={() => setCategory(entry.id)}>
            <entry.icon size={17} aria-hidden="true" />{text(entry.name.ar, entry.name.en)}
          </button>)}
        </div>
        <label className="shop-sort">{text('ترتيب حسب', 'Sort by')}
          <select value={sort} onChange={event => setSort(event.target.value as Sort)}>
            <option value="featured">{text('المميز', 'Featured')}</option>
            <option value="price-low">{text('السعر: الأقل الأول', 'Price: low to high')}</option>
            <option value="price-high">{text('السعر: الأعلى الأول', 'Price: high to low')}</option>
          </select>
        </label>
      </div>

      <ul className="shop-grid" aria-label={text('المنتجات', 'Products')}>
        {shown.map(item => {
          const price = fromPrice(item);
          const name = nameOf(item);
          return <li key={item.key} className="shop-card" data-testid={`catalog-${item.key}`}>
            <div className="shop-card-media">
              <img src={item.image} alt="" width="1536" height="1024" loading="lazy" style={item.focus ? { objectPosition: item.focus } : undefined} />
              <span className="shop-card-tag">{item.tag[language]}</span>
            </div>
            <div className="shop-card-body">
              <h2>{name}</h2>
              <p>{descriptionOf(item)}</p>
              {item.shape && <small className="shop-card-meta">{text('الشكل:', 'Shape:')} {shapeName(item.shape, language)}</small>}
              {item.purpose && <small className="shop-card-meta">{purposes.find(entry => entry.id === item.purpose)!.hint[language]}</small>}
              <p className="shop-card-price">{price === null
                ? <><b>{text('عرض سعر', 'Quote')}</b> <span>{text('حسب طلبك', 'tailored to you')}</span></>
                : <><span>{text('من', 'From')}</span> <b>{number(price)}</b> <span>{text('ج.م', 'EGP')}</span></>}</p>
              <div className="shop-card-actions">
                <button type="button" className="shop-card-cta" onClick={() => onOpen(item)}>
                  <ShoppingCartSimpleIcon size={17} aria-hidden="true" />{item.service ? text('اطلب عرض سعر', 'Request a quote') : text('صمّم واطلب', 'Customize & order')}
                </button>
                <button type="button" className="shop-card-more" onClick={() => onOpen(item)} aria-label={text(`تفاصيل ${name}`, `Details: ${name}`)}>
                  <ArrowLeftIcon size={17} className="directional-arrow" aria-hidden="true" />
                </button>
              </div>
            </div>
          </li>;
        })}
      </ul>
    </div>
  </div>;
}
