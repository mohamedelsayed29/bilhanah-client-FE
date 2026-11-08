import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowDownIcon, ArrowLeftIcon, CaretDownIcon, PaintBrushIcon, ShoppingBagIcon, SparkleIcon, SquaresFourIcon, StackIcon, StickerIcon, StorefrontIcon, TruckIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useLanguage } from '../../lib/language';
import { productOf, productPrices, purposes, shapeName, type ProductId, type PurposeId, type ShapeId } from './catalog';
import { services, type ServiceId } from './ServiceRequest';
import { ProductFilm } from './ProductFilm';

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
  { key: 'stand', category: 'stands', product: 'stand', image: '/media/acrylic-stand-cafe-brand-v1.jpg', focus: '50% 55%', tag: { ar: 'QR مع NFC اختياري', en: 'QR, NFC optional' } },
  { key: 'sticker', category: 'stickers', product: 'sticker', image: '/media/table-stickers-brand-v1.jpg', focus: '55% 62%', tag: { ar: 'مربع أو دايرة', en: 'Square or round' } },
  { key: 'branding', category: 'services', service: 'branding', image: '/media/branding-pack-brand-v1.jpg', focus: '55% 50%', tag: { ar: 'للسلاسل والفروع', en: 'For chains' } },
  { key: 'custom', category: 'services', service: 'custom', image: '/media/custom-design-brand-v1.jpg', focus: '50% 60%', tag: { ar: 'خدمة إضافية', en: 'Add-on service' } },
  { key: 'stand-arch', category: 'stands', product: 'stand', shape: 'arch', image: '/media/nfc-arch-brand-v1.jpg', tag: { ar: 'شكل قوس', en: 'Arch shape' },
    name: { ar: 'حامل أكريليك قوس', en: 'Arch acrylic stand' }, description: { ar: 'انحناءة ناعمة بشخصية مختلفة على الترابيزة.', en: 'A soft curve with its own character on the table.' } },
  { key: 'stand-tilt', category: 'stands', product: 'stand', shape: 'tilt', image: '/media/nfc-tilt-brand-v1.jpg', tag: { ar: 'شكل مائل', en: 'Tilted' },
    name: { ar: 'حامل أكريليك مائل', en: 'Tilted acrylic stand' }, description: { ar: 'ميلة خفيفة تخلي الكود سهل المسح من الكرسي.', en: 'A gentle lean that makes the code easy to scan from the seat.' } },
  { key: 'stand-wood', category: 'stands', product: 'stand', shape: 'wood', image: '/media/nfc-wood-brand-v1.jpg', tag: { ar: 'قاعدة خشب', en: 'Wood base' },
    name: { ar: 'حامل بقاعدة خشب', en: 'Wood-base stand' }, description: { ar: 'أكريليك شفاف على قاعدة خشب طبيعي، دافي وأنيق.', en: 'Clear acrylic in a natural wood base, warm and refined.' } },
  { key: 'stand-reviews', category: 'stands', product: 'stand', purpose: 'reviews', image: '/media/nfc-acrylic-table-brand-v1.jpg', focus: '50% 45%', tag: { ar: 'تقييمات Google', en: 'Google reviews' },
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
  // Links from the home page open the shop on one category (?category=stands|stickers|services).
  const [params] = useSearchParams();
  const [category, setCategory] = useState<Category | 'all'>(() => {
    const requested = params.get('category');
    return requested === 'stands' || requested === 'stickers' || requested === 'services' ? requested : 'all';
  });
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
  const countOf = (id: Category | 'all') => catalogItems.filter(item => id === 'all' || item.category === id).length;
  const standFrom = productPrices('stand').unit;
  const open = (key: string) => onOpen(catalogItems.find(item => item.key === key)!);
  const steps: { icon: Icon; title: string; body: string }[] = [
    { icon: PaintBrushIcon, title: text('اختار وخصّص', 'Choose & customize'), body: text('اختار المنتج والشكل، حط رابط المنيو ولوجو مطعمك، وشوف المعاينة على طول.', 'Pick the product and shape, add your menu link and logo, and see the preview right away.') },
    { icon: ShoppingBagIcon, title: text('راجع السلة', 'Review your bag'), body: text('كل تصميم بكميته وسعره، والإضافات زي NFC واضحة قدامك.', 'Every design with its quantity and price, with add-ons like NFC spelled out.') },
    { icon: TruckIcon, title: text('أكّد وتابع طلبك', 'Confirm & track'), body: text('اكتب بيانات التوصيل واختار طريقة الدفع، وتابع طلبك من رابط خاص بيه.', 'Enter delivery details, choose how to pay, and follow your order from its own link.') },
  ];
  return <div className="shop-catalog">
    <section className="shop-hero page-container" aria-labelledby="shop-hero-title">
      <div className="shop-hero-panel">
        <div className="shop-hero-copy">
          <h1 id="shop-hero-title" tabIndex={-1}>{text('أدوات ذكية ', 'Smart tools for ')}<em>{text('لمطعمك وكافيهك.', 'modern restaurants.')}</em></h1>
          <p>{text('حوامل QR وNFC، وستيكرز للترابيزات، وتصميم بهوية مطعمك. كله معمول عشان ضيفك يوصل للمنيو في ثانية.', 'QR and NFC stands, table stickers and designs in your brand, all made so guests reach your menu in a second.')}</p>
          <div className="shop-hero-actions">
            <button type="button" className="button button-teal" onClick={() => open('stand')}>{text('صمّم حاملك دلوقتي', 'Design your stand')}<ArrowLeftIcon size={18} className="directional-arrow" aria-hidden="true" /></button>
            <a className="shop-hero-link" href="#catalog">{text('تصفّح المنتجات', 'Browse products')}<ArrowDownIcon size={17} aria-hidden="true" /></a>
          </div>
          <dl className="shop-hero-facts">
            <div><dt>{text('الحوامل', 'Stands')}</dt><dd>{text(`من ${number(standFrom)} ج.م`, `From ${number(standFrom)} EGP`)}</dd></div>
            <div><dt>QR</dt><dd>{text('مع كل قطعة', 'On every piece')}</dd></div>
            <div><dt>NFC</dt><dd>{text('اختياري', 'Optional')}</dd></div>
          </dl>
        </div>
        <ProductFilm />
      </div>
    </section>

    <section id="catalog" className="shop-catalog-body page-container" aria-labelledby="shop-products-title">
      <header className="shop-section-head">
        <div>
          <p className="shop-kicker">{text('منتجاتنا', 'Our products')}</p>
          <h2 id="shop-products-title">{text('كل اللي ترابيزتك محتاجاه', 'Everything your tables need')}</h2>
        </div>
        <label className="shop-sort">{text('ترتيب حسب', 'Sort by')}
          <select value={sort} onChange={event => setSort(event.target.value as Sort)}>
            <option value="featured">{text('المميز', 'Featured')}</option>
            <option value="price-low">{text('السعر: الأقل الأول', 'Price: low to high')}</option>
            <option value="price-high">{text('السعر: الأعلى الأول', 'Price: high to low')}</option>
          </select>
          <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
        </label>
      </header>
      <div className="shop-categories" role="group" aria-label={text('التصنيفات', 'Categories')}>
        {CATEGORIES.map(entry => <button key={entry.id} type="button" aria-pressed={category === entry.id} onClick={() => setCategory(entry.id)}>
          <entry.icon size={17} aria-hidden="true" />{text(entry.name.ar, entry.name.en)}<span className="shop-category-count" aria-hidden="true">{number(countOf(entry.id))}</span>
        </button>)}
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
              <h3>{name}</h3>
              <p>{descriptionOf(item)}</p>
              {item.shape && <small className="shop-card-meta">{text('الشكل:', 'Shape:')} {shapeName(item.shape, language)}</small>}
              {item.purpose && <small className="shop-card-meta">{purposes.find(entry => entry.id === item.purpose)!.hint[language]}</small>}
              <div className="shop-card-foot">
                <p className="shop-card-price">{price === null
                  ? <><span>{text('السعر', 'Price')}</span><b className="shop-card-quote">{text('حسب طلبك', 'Tailored quote')}</b></>
                  : <><span>{text('يبدأ من', 'From')}</span><b>{number(price)} <small>{text('ج.م', 'EGP')}</small></b></>}</p>
                <button type="button" className="shop-card-cta" onClick={() => onOpen(item)}>
                  {item.service ? text('اطلب عرض سعر', 'Request a quote') : text('صمّم واطلب', 'Customize & order')}
                  <ArrowLeftIcon size={16} weight="bold" className="directional-arrow" aria-hidden="true" />
                </button>
              </div>
            </div>
          </li>;
        })}
      </ul>
    </section>

    <section className="shop-steps page-container" aria-labelledby="shop-steps-title">
      <h2 id="shop-steps-title">{text('طلبك في ٣ خطوات', 'Your order in 3 steps')}</h2>
      <ol>
        {steps.map((step, index) => <li key={step.title}>
          <span className="shop-step-icon" aria-hidden="true"><step.icon size={22} /></span>
          <span className="shop-step-num" aria-hidden="true">{number(index + 1).padStart(2, number(0))}</span>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </li>)}
      </ol>
    </section>

    <section className="shop-custom page-container" aria-labelledby="shop-custom-title">
      <div className="shop-custom-panel">
        <img src="/media/custom-design-brand-v1.jpg" alt="" width="1536" height="1024" loading="lazy" />
        <div>
          <h2 id="shop-custom-title">{text('محتاج حاجة على مقاسك؟', 'Need something made for you?')}</h2>
          <p>{text('ابعتلنا فكرتك، ومصمّمينا يحوّلوها لتصميم جاهز للطباعة بهوية مطعمك.', 'Send us your idea and our designers turn it into a print-ready design in your brand.')}</p>
          <button type="button" className="button button-teal" onClick={() => open('custom')}><SparkleIcon size={19} aria-hidden="true" />{text('ابدأ تصميم مخصوص', 'Start a custom design')}</button>
        </div>
      </div>
    </section>
  </div>;
}
