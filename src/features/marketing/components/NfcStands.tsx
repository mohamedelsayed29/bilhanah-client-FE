import { ArrowLeftIcon, ContactlessPaymentIcon, QrCodeIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';
import { useLanguage } from '../../../lib/language';
import { productPrices } from '../../stand-shop/catalog';
import './nfc-stands.css';

type Bilingual = { ar: string; en: string };
type Product = { key: string; category: 'stands' | 'stickers' | 'services'; image: string; focus: string; name: Bilingual; description: Bilingual; from: number | null };

/** Everything the stand shop sells; each card opens the shop on its category. */
const PRODUCTS: Product[] = [
  { key: 'stands', category: 'stands', image: '/media/acrylic-stand-cafe-brand-v1.jpg', focus: '50% 55%', from: productPrices('stand').unit,
    name: { ar: 'حوامل أكريليك', en: 'Acrylic stands' },
    description: { ar: 'أربع أشكال: كلاسيك، قوس، مائل، وقاعدة خشب. والـNFC اختياري.', en: 'Four shapes: classic, arch, tilt and wood base. NFC optional.' } },
  { key: 'stickers', category: 'stickers', image: '/media/table-stickers-brand-v1.jpg', focus: '50% 62%', from: productPrices('sticker').unit,
    name: { ar: 'ستيكرز الترابيزة', en: 'Table stickers' },
    description: { ar: 'مربع أو دايرة، بيتلزق على سطح الترابيزة. والـNFC اختياري.', en: 'Square or round, flat on the table. NFC optional.' } },
  { key: 'branding', category: 'services', image: '/media/branding-pack-brand-v1.jpg', focus: '55% 50%', from: null,
    name: { ar: 'Restaurant Branding Pack', en: 'Restaurant Branding Pack' },
    description: { ar: 'ستاندات وتغليف وهوية واحدة لكل فروعك.', en: 'Stands, packaging and one identity for all your branches.' } },
  { key: 'custom', category: 'services', image: '/media/custom-design-brand-v1.jpg', focus: '50% 60%', from: null,
    name: { ar: 'تصميم مخصوص', en: 'Custom design' },
    description: { ar: 'ابعت فكرتك ومصمّمينا يحوّلوها لتصميم باسم مطعمك.', en: 'Send your idea and our designers make it yours.' } },
];

export function NfcStands() {
  const { text, language, number } = useLanguage();
  return <section id="nfc-stands" className="nfc-section page-container section-space" aria-labelledby="nfc-title">
    <div className="nfc-intro-row">
      <figure className="nfc-table-photo">
        <img src="/media/nfc-acrylic-table-brand-v1.jpg" width="1536" height="1024" loading="lazy" decoding="async" alt={text('تصوّر لحامل أكريليك شفاف من بالهنا، عليه QR وعلامة NFC، على ترابيزة مطعم بجوار طبق باستا.', 'Illustrative Bilhanah clear acrylic stand with a QR code and NFC symbol on a restaurant table beside a pasta dish.')} />
        <figcaption><QrCodeIcon size={17} aria-hidden="true" /><span dir="ltr">QR + NFC</span></figcaption>
      </figure>
      <div className="nfc-copy">
        <span className="nfc-eyebrow">{text('متجر بالهنا', 'Bilhanah shop')}</span>
        <h2 id="nfc-title">{text('حوامل QR وNFC للترابيزة', 'QR & NFC table stands')}</h2>
        <p className="nfc-intro">{text('حوامل وستيكرز مطبوع عليها QR مطعمك، ومعاها شريحة NFC لو حبيت. الزبون يفتح المنيو بالكاميرا أو بلمسة موبايل، من غير ما ينزّل تطبيق.', 'Stands and stickers printed with your restaurant’s QR code, with an NFC chip if you want one. Guests open your menu with the camera or a tap of the phone. No app to download.')}</p>
        <ul className="nfc-methods">
          <li><span className="nfc-method-icon"><QrCodeIcon size={20} aria-hidden="true" /></span><span><strong>{text('سكان بالكاميرا', 'Scan with the camera')}</strong>{text('يفتح منيو مطعمك مباشرة.', 'Opens your menu instantly.')}</span></li>
          <li><span className="nfc-method-icon"><ContactlessPaymentIcon size={21} aria-hidden="true" /></span><span><strong>{text('لمسة بالـNFC', 'Tap with NFC')}</strong>{text('يقرّب الموبايل ويضغط على اللينك.', 'Hold the phone near and tap the link.')}</span></li>
        </ul>
        <div className="nfc-shopping-actions">
          <Link className="button button-teal" to="/shop">{text('استكشف المتجر', 'Explore the shop')}<ArrowLeftIcon size={18} className="directional-arrow" aria-hidden="true" /></Link>
          <Link className="text-link" to="/contact?topic=nfc">{text('اسأل عن حوامل الترابيزة', 'Ask about your table stands')}</Link>
        </div>
      </div>
    </div>

    <ul className="nfc-products" aria-label={text('منتجات المتجر', 'Shop products')}>
      {PRODUCTS.map(product => <li key={product.key}>
        <Link className="nfc-product" to={`/shop?category=${product.category}`}>
          <span className="nfc-product-image"><img src={product.image} alt="" width="1536" height="1024" loading="lazy" decoding="async" style={{ objectPosition: product.focus }} /></span>
          <span className="nfc-product-body">
            <strong>{product.name[language]}</strong>
            <span>{product.description[language]}</span>
            <span className="nfc-product-foot">
              <span className="nfc-product-price">{product.from === null ? text('بعرض سعر', 'Quote on request') : text(`يبدأ من ${number(product.from)} جنيه`, `From EGP ${number(product.from)}`)}</span>
              <ArrowLeftIcon size={16} className="directional-arrow" aria-hidden="true" />
            </span>
          </span>
        </Link>
      </li>)}
    </ul>
    <p className="nfc-image-note">{text('الصور تصوّر توضيحي للمنتج. واللمس يحتاج موبايل يدعم NFC مع تفعيله.', 'Images are illustrative product concepts. Tap requires a compatible phone with NFC enabled.')}</p>
  </section>;
}
