import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ArrowLeftIcon, ArrowCounterClockwiseIcon, CheckIcon, ReceiptIcon, CubeIcon, ContactlessPaymentIcon, FloppyDiskIcon, ForkKnifeIcon, LinkSimpleIcon, MinusIcon, PlusIcon, QrCodeIcon, ShoppingBagIcon, StarIcon, TrashIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { PlaceStandOrderResponse } from '@bilhanah/contracts';
import { newIdempotencyKey } from '../../lib/api';
import { useLanguage, usePageTitle } from '../../lib/language';
import { defaultConfig, designLabel, designs, destinationError, loadBag, loadDraft, saveBag, MAX_QUANTITY, productOf, productPrices, purposes, shapeName, shapes, shapesOf, stickerShapes, unitPrice, lineTotal, type CartItem, type Delivery, type PurposeId, type StandConfig } from './catalog';
import { LineThumb } from './LineThumb';
import { StickerThumb } from './StickerPreview';
import { StandPreview, type StandPreviewMode } from './StandPreview';
import { ServiceRequest, services, type ServiceId } from './ServiceRequest';
import { catalogItems, ShopCatalog, type CatalogItem } from './ShopCatalog';
import { ShopCheckout } from './ShopCheckout';
import { StandColorPicker, StandColorSummary } from './StandColorPicker';
import { StandPriceBreakdown } from './StandPriceBreakdown';
import { loadRecentStandOrders, rememberStandOrder } from './shop-api';
import { useShopInfo } from './use-shop-info';
import './shop.css';

/** The catalog of products first; a product opens the designer (?item=<card key>), then the bag and checkout. */
type Stage = 'catalog' | 'design' | 'bag' | 'checkout';
const emptyDelivery = (): Delivery => ({ name: '', phone: '', email: '', city: '', address: '', notes: '', payment: 'cash' });

export function ShopPage() {
  const { text, language, number } = useLanguage();
  usePageTitle('متجر حوامل وستيكرز QR وNFC | بالهنا', 'QR & NFC stands and stickers | Bilhanah');
  const [config, setConfig] = useState<StandConfig>(loadDraft);
  const [view, setView] = useState<StandPreviewMode>('photo');
  const [searchParams, setSearchParams] = useSearchParams();
  const item = searchParams.get('item');
  const [stage, setStage] = useState<Stage>(() => (item && catalogItems.some(entry => entry.key === item) ? 'design' : 'catalog'));
  // A quoted service (branding pack, custom design) replaces the configurator with its request form.
  const [service, setService] = useState<ServiceId | null>(null);
  const [bag, setBag] = useState<CartItem[]>(loadBag);
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [urlError, setUrlError] = useState('');
  const [logoError, setLogoError] = useState('');
  const [readingLogo, setReadingLogo] = useState(false);
  const [delivery, setDelivery] = useState<Delivery>(emptyDelivery);
  const [lastOrder] = useState(() => loadRecentStandOrders()[0] ?? null);
  const shop = useShopInfo();
  const navigate = useNavigate();
  // One Idempotency-Key per checkout attempt: kept across retries, renewed when the bag changes or an order goes through.
  const orderKey = useRef<string | null>(null);
  const idempotencyKey = useCallback(() => orderKey.current ??= newIdempotencyKey(), []);
  const renewIdempotencyKey = useCallback(() => { orderKey.current = null; }, []);
  const logoIds = useRef(new Map<string, string>());
  const heading = useRef<HTMLHeadingElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const logoRead = useRef(0);
  const count = bag.reduce((sum, item) => sum + item.config.quantity, 0);
  const sticker = config.product === 'sticker';
  const noun = productOf(config.product).noun;
  const price = productPrices(config.product);
  const bagNoun = bag.length && bag.every(item => item.config.product === 'stand') ? 'stands' : bag.every(item => item.config.product === 'sticker') && bag.length ? 'stickers' : 'items';

  useEffect(() => { saveBag(bag); orderKey.current = null; }, [bag]);

  useEffect(() => {
    if (stage === 'checkout') return;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [stage]);

  function update<K extends keyof StandConfig>(key: K, value: StandConfig[K]) { setConfig(current => ({ ...current, [key]: value })); setStatus(''); }
  function changePurpose(purpose: PurposeId) {
    setConfig(current => ({ ...current, purpose, url: purpose === 'menu' ? `${window.location.origin}/?demo=1` : '', caption: '' }));
    setUrlError('');
  }
  /** A catalog card opens the designer with its product (and shape or purpose) chosen, or a service's quote form. */
  function openItem(entry: CatalogItem, push = true) {
    setStatus(''); setUrlError('');
    if (entry.service) setService(entry.service);
    else {
      setService(null);
      setConfig(current => {
        const base = current.product === entry.product ? current : { ...current, product: entry.product, shape: shapesOf(entry.product)[0]!.id };
        const shaped = entry.shape ? { ...base, shape: entry.shape } : base;
        return entry.purpose && entry.purpose !== shaped.purpose
          ? { ...shaped, purpose: entry.purpose, url: entry.purpose === 'menu' ? `${window.location.origin}/?demo=1` : '', caption: '' }
          : shaped;
      });
      setView('photo');
    }
    setStage('design');
    if (push) setSearchParams({ item: entry.key });
  }
  function showCatalog() { setEditing(null); setStage('catalog'); setSearchParams({}); }
  // The address decides catalog or designer, so Back and Forward move between them.
  useEffect(() => {
    const entry = item ? catalogItems.find(candidate => candidate.key === item) : undefined;
    if (entry) openItem(entry, false);
    else setStage(current => (current === 'design' ? 'catalog' : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the address changes
  }, [item]);
  function saveDraft() {
    try { localStorage.setItem('bilhanah:stand-draft:v1', JSON.stringify(config)); setStatus(text('تصميمك اتحفظ على الجهاز. هتلاقيه لما ترجع.', 'Your design is saved on this device for your next visit.')); }
    catch { setStatus(text('مش قادرين نحفظ على الجهاز. تصميمك لسه موجود طول ما الصفحة مفتوحة.', 'Device storage is unavailable. Your design is still here while this page stays open.')); }
  }
  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const sequence = ++logoRead.current;
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setLogoError(text('اختار صورة PNG أو JPG أو WebP، بحد أقصى ٢ ميجابايت.', 'Choose a PNG, JPG or WebP image up to 2 MB.')); event.target.value = ''; return; }
    setReadingLogo(true);
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      await new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(); image.onerror = reject; image.src = data; });
      if (sequence === logoRead.current) { update('logo', data); }
    } catch { if (sequence === logoRead.current) setLogoError(text('الصورة ما اتفتحتش. جرّب ملف تاني.', 'We couldn’t open this image. Try another file.')); }
    finally { if (sequence === logoRead.current) setReadingLogo(false); }
  }
  function addToBag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = destinationError(config, language === 'en');
    setUrlError(error);
    if (error) { urlInput.current?.focus(); return; }
    const snapshot = { ...config, brand: config.brand.trim(), url: config.url.trim() };
    if (editing) { setBag(current => current.map(item => item.id === editing ? { ...item, config: snapshot } : item)); setEditing(null); setStage('bag'); }
    else { setBag(current => [...current, { id: crypto.randomUUID(), config: snapshot }]); setStatus(sticker ? text('الستيكر اتضاف للسلة. كمّل تصميم تاني أو راجع طلبك.', 'Added to your bag. Make another design or review your order.') : text('حاملك اتضاف للسلة. كمّل تصميم تاني أو راجع طلبك.', 'Added to your bag. Make another design or review your order.')); }
  }
  function editItem(item: CartItem) { setService(null); setConfig({ ...item.config }); setEditing(item.id); setStatus(''); setUrlError(''); setView('3d'); setStage('design'); }
  function placed(response: PlaceStandOrderResponse) {
    rememberStandOrder({ trackingToken: response.trackingToken, reference: response.order.reference, placedAt: response.order.createdAt });
    saveBag([]);
    setBag([]);
    setDelivery(emptyDelivery());
    logoIds.current.clear();
    orderKey.current = null;
    // Online orders go to Paymob (the checkout sends the browser there); cash orders go straight to their page.
    if (!response.checkoutUrl) navigate(`/shop/orders/${encodeURIComponent(response.trackingToken)}`, { state: { token: response.trackingToken, order: response.order } });
  }
  // The steps of the purchase: beside the heading while designing and reviewing, on their own at checkout.
  const journeySteps = (inHeader: boolean) => <ol className={`shop-journey ${inHeader ? '' : 'page-container'}`} aria-label={text('خطوات الشراء', 'Shopping steps')}>
    {[text('اختار وخصّص', 'Choose & customize'), text('راجع السلة', 'Review bag'), text('بيانات الطلب', 'Order details')].map((label, index) => {
      const step = stage === 'design' ? 0 : stage === 'bag' ? 1 : 2;
      return <li key={label} className={index === step ? 'current' : ''} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <CheckIcon size={13} aria-hidden="true" /> : number(index + 1)}</span>{label}</li>;
    })}
  </ol>;
  function reset() { setService(null); logoRead.current++; setReadingLogo(false); setConfig(current => defaultConfig(current.product)); setUrlError(''); setLogoError(''); setStatus(''); setEditing(null); if (logoInput.current) logoInput.current.value = ''; }

  return <div className="stand-shop">
    <div className="shop-topbar page-container">
      <nav aria-label={text('مسار الصفحة', 'Breadcrumb')}><Link to="/">{text('الرئيسية', 'Home')}</Link><span>/</span>{stage === 'catalog'
        ? <span>{text('المتجر', 'Shop')}</span>
        : <><button type="button" className="shop-crumb" onClick={showCatalog}>{text('المتجر', 'Shop')}</button><span>/</span><span>{stage === 'design' ? (service ? services.find(entry => entry.id === service)!.name[language] : productOf(config.product).name[language]) : stage === 'bag' ? text('السلة', 'Bag') : text('بيانات الطلب', 'Order details')}</span></>}</nav>
      <button type="button" className="shop-bag-trigger" onClick={() => { setStage('bag'); setStatus(''); }}><ShoppingBagIcon size={19} aria-hidden="true" />{text('السلة', 'Bag')}<b>{number(count)}</b></button>
    </div>
    {(stage === 'design' || stage === 'bag') && <header className="shop-heading page-container">
      <div><h1 ref={heading} tabIndex={-1}>{stage === 'design' && service ? (service === 'branding' ? text('هوية واحدة لكل فروعك.', 'One identity across every branch.') : text('تصميم معمول لمطعمك بس.', 'A design made only for you.')) : stage === 'design' ? (sticker ? text('ستيكر على ذوق براندك.', 'A sticker that’s yours.') : text('حامل على ذوق براندك.', 'A stand that’s yours.')) : bagNoun === 'stands' ? text('راجع حواملك قبل ما تكمّل.', 'Your stands, ready to review.') : text('راجع طلبك قبل ما تكمّل.', 'Your order, ready to review.')}</h1>
        <p>{stage === 'design' && service ? (service === 'branding' ? text('باقة كاملة للمطاعم الكبيرة والسلاسل: ستاندات، استيكرات تغليف، وتصميم موحّد.', 'A complete pack for large restaurants and chains: stands, packaging stickers and one unified design.') : text('ابعتلنا فكرتك، ومصمّمينا يحوّلوها لتصميم جاهز للطباعة.', 'Send us your idea and our designers turn it into a print-ready design.')) : stage === 'design' ? (sticker ? text('اختار الشكل، حدّد الرابط، وخصّص الطباعة. QR مع كل ستيكر، وNFC لو حبيت.', 'Choose the shape, add your link and personalize the print. QR is included. NFC is up to you.') : text('اختار الشكل، حدّد الرابط، وخصّص الطباعة. QR مع كل حامل، وNFC لو حبيت.', 'Choose the shape, add your link and personalize the print. QR is included. NFC is up to you.')) : text('كل تصميم بسعره وكميته، والإضافات واضحة في الملخص.', 'Review each design, its quantity and the price of every add-on.')}</p>
      </div>
      {stage === 'design' && journeySteps(true)}
      {stage === 'bag' && <div className="shop-price-intro"><span>{text('إجمالي المنتجات', 'Product total')}</span><strong>{number(bag.reduce((sum, item) => sum + lineTotal(item.config), 0))} <small>{text('ج.م', 'EGP')}</small></strong><small>{text('قبل إضافة الشحن', 'Before shipping')}</small></div>}
    </header>}
    {(stage === 'bag' || stage === 'checkout') && journeySteps(false)}
    {lastOrder && stage !== 'checkout' && <p className="shop-last-order page-container"><ReceiptIcon size={16} aria-hidden="true" />{text('آخر طلب ليك:', 'Your last order:')} <Link to={`/shop/orders/${encodeURIComponent(lastOrder.trackingToken)}`}><bdi dir="ltr">{lastOrder.reference}</bdi> · {text('تابع حالته', 'Track it')}</Link></p>}
    {stage === 'catalog' ? <ShopCatalog onOpen={entry => openItem(entry)} /> : stage === 'design' && service ? <ServiceRequest key={service} service={service} /> : stage === 'checkout' ? <ShopCheckout items={bag} delivery={delivery} onDelivery={setDelivery} onBack={() => setStage('bag')} shop={shop} idempotencyKey={idempotencyKey} renewIdempotencyKey={renewIdempotencyKey} logoIds={logoIds.current} onPlaced={placed} /> : stage === 'design' ? <div className="shop-workspace page-container">
      <StandPreview config={config} view={view} onView={setView} />
      <form className="stand-config" onSubmit={addToBag}>
        {editing && <div className="shop-edit-notice">{text('بتعدّل تصميم موجود في السلة.', 'Editing a design in your bag.')}<button type="button" onClick={() => { setEditing(null); setStage('bag'); }}>{text('إلغاء التعديل', 'Cancel edit')}</button></div>}
        <fieldset className="shop-fieldset">
          <legend><span aria-hidden="true">{number(1)}</span>{sticker ? text('اختار شكل الستيكر', 'Choose your sticker shape') : text('اختار حاملك', 'Choose your stand')}</legend>
          <p className="shop-section-intro">{sticker ? text('ستيكر مطبوع بيتلزق على سطح الترابيزة. الشكلين بنفس السعر.', 'A printed sticker for the tabletop. Both shapes cost the same.') : text('أكريليك شفاف بقاعدة. كل الأشكال بنفس السعر الأساسي.', 'Clear acrylic with a base. Every shape has the same base price.')}</p>
          {sticker ? <div className="shop-shape-options shop-sticker-options">{stickerShapes.map(shape => <label key={shape.id} className={`shop-shape-option ${config.shape === shape.id ? 'selected' : ''}`}><input type="radio" name="shape" value={shape.id} checked={config.shape === shape.id} onChange={() => update('shape', shape.id)} /><span className="shop-sticker-sample"><StickerThumb config={{ ...config, shape: shape.id }} size="large" /></span><span>{shape.name[language]}<CheckIcon className="shop-choice-check" size={15} weight="bold" aria-hidden="true" /></span><small>{shape.description[language]}</small></label>)}</div>
            : <div className="shop-shape-options">{shapes.map(shape => <label key={shape.id} className={`shop-shape-option ${config.shape === shape.id ? 'selected' : ''}`}><input type="radio" name="shape" value={shape.id} checked={config.shape === shape.id} onChange={() => update('shape', shape.id)} /><img src={shape.image} alt="" width="110" height="137" loading="lazy" /><span>{shape.name[language]}<CheckIcon className="shop-choice-check" size={15} weight="bold" aria-hidden="true" /></span></label>)}</div>}
          <fieldset className="shop-connection"><legend>{text('طريقة فتح الرابط', 'How guests open your link')}</legend><div className="shop-connection-options">
            <label className={!config.nfc ? 'selected' : ''}><input type="radio" name="connection" checked={!config.nfc} onChange={() => update('nfc', false)} /><QrCodeIcon size={23} aria-hidden="true" /><span><strong>{text('QR فقط', 'QR only')}</strong><small>{text('مسح الكود بكاميرا الموبايل', 'Scan with the phone camera')}</small></span><b>{number(price.unit)} <small>{text('ج.م', 'EGP')}</small></b><CheckIcon className="shop-choice-check" size={16} aria-hidden="true" /></label>
            <label className={config.nfc ? 'selected' : ''}><input type="radio" name="connection" checked={config.nfc} onChange={() => update('nfc', true)} /><ContactlessPaymentIcon size={23} aria-hidden="true" /><span><strong>{text('QR + شريحة NFC', 'QR + NFC chip')}</strong><small>{text('مسح الكود أو لمسة بموبايل متوافق', 'Scan, or tap with a compatible phone')}</small></span><b>{number(price.unit + price.nfc)} <small>{text('ج.م', 'EGP')}</small><em>+{number(price.nfc)} {text('للشريحة', 'for NFC')}</em></b><CheckIcon className="shop-choice-check" size={16} aria-hidden="true" /></label>
          </div></fieldset>
        </fieldset>
        <fieldset className="shop-fieldset">
          <legend><span aria-hidden="true">{number(2)}</span>{text(`ال${noun.ar} هيفتح إيه؟`, 'Where should it take guests?')}</legend>
          <p className="shop-section-intro">{text('اختار الوظيفة، وبعدها حط الرابط اللي عايز ضيفك يفتحه.', 'Choose its purpose, then add the link you want guests to open.')}</p>
          <div className="shop-purpose-options">{purposes.map(purpose => {
            const Icon = purpose.id === 'menu' ? ForkKnifeIcon : purpose.id === 'reviews' ? StarIcon : LinkSimpleIcon;
            return <label key={purpose.id} className={config.purpose === purpose.id ? 'selected' : ''}><input type="radio" name="purpose" value={purpose.id} checked={config.purpose === purpose.id} onChange={() => changePurpose(purpose.id)} /><Icon size={20} aria-hidden="true" /><span><strong>{purpose.name[language]}</strong><small>{purpose.hint[language]}</small></span><span className="shop-radio-dot" aria-hidden="true" /></label>;
          })}</div>
          <label className="shop-label" htmlFor="stand-url">{config.purpose === 'reviews' ? text('رابط تقييمات Google', 'Google review link') : config.purpose === 'menu' ? text('رابط المنيو', 'Menu link') : text('الرابط اللي هيفتح', 'Destination link')}</label>
          <input ref={urlInput} id="stand-url" className="shop-input" type="url" dir="ltr" value={config.url} maxLength={2048} required onChange={event => { update('url', event.target.value); setUrlError(''); }} placeholder={config.purpose === 'reviews' ? 'https://g.page/r/…/review' : 'https://your-website.com'} aria-invalid={!!urlError} aria-describedby={urlError ? 'stand-url-error' : 'stand-url-help'} />
          {urlError ? <p className="shop-error" id="stand-url-error" role="alert">{urlError}</p> : <p className="shop-field-help" id="stand-url-help">{config.purpose === 'menu' ? text('الرابط الحالي يفتح المنيو التجريبي. استبدله برابط منيو مطعمك.', 'The default link opens the sample menu. Replace it with your own menu link.') : config.purpose === 'reviews' ? text('انسخ رابط طلب التقييم من ملف نشاطك على Google.', 'Paste the review-request link from your Google Business Profile.') : text('اكتب الرابط كاملًا، مثل رابط موقعك أو واتساب.', 'Use the full address of your website, WhatsApp or another page.')}</p>}
        </fieldset>
        <fieldset className="shop-fieldset">
          <legend><span aria-hidden="true">{number(3)}</span>{text('خلّيه يشبه براندك', 'Make it your brand')}</legend>
          <div className="shop-two-fields"><label className="shop-label">{text('اسم البراند', 'Brand name')}<input className="shop-input" name="brand" maxLength={35} required value={config.brand} placeholder={text('مثال: بيت الزيتون', 'e.g. Olive House')} onChange={event => update('brand', event.target.value)} /></label><label className="shop-label">{text(`العبارة على ال${noun.ar}`, sticker ? 'Sticker message' : 'Stand message')} <small>{text('(اختياري)', '(optional)')}</small><input className="shop-input" maxLength={60} value={config.caption} placeholder={purposes.find(item => item.id === config.purpose)!.caption[language]} onChange={event => update('caption', event.target.value)} /></label></div>
          <fieldset className="shop-print-style"><legend>{text('لون الطباعة', 'Print style')}</legend><div className="shop-design-options">{designs.map(design => <label key={design.id} className={config.design === design.id && !config.customColors ? 'selected' : ''}><input type="radio" name="design" value={design.id} checked={config.design === design.id && !config.customColors} onChange={() => { setConfig(current => ({ ...current, design: design.id, customColors: null })); setStatus(''); }} /><span className="shop-design-sample" style={{ background: design.background, color: design.ink }}><span /><QrCodeIcon size={24} aria-hidden="true" /><i style={{ background: design.accent }} /></span><span>{design.name[language]}</span></label>)}<StandColorPicker config={config} onChange={colors => update('customColors', colors)} /></div></fieldset>
          <div className="shop-logo-upload">{config.logo && <img className="shop-logo-preview" src={config.logo} alt={text('لوجو البراند المرفوع', 'Your uploaded brand logo')} />}<label className="shop-upload-button"><UploadSimpleIcon size={18} aria-hidden="true" />{readingLogo ? text('بنجهّز اللوجو…', 'Opening logo…') : config.logo ? text('غيّر اللوجو', 'Replace logo') : text('ارفع لوجو البراند', 'Upload your logo')}<input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} disabled={readingLogo} /></label>{config.logo && <button className="shop-text-button" type="button" onClick={() => { logoRead.current++; update('logo', ''); if (logoInput.current) logoInput.current.value = ''; }}>{text('إزالة', 'Remove')}</button>}<small>{text('اختياري · PNG, JPG, WebP · حتى ٢ ميجابايت', 'Optional · PNG, JPG, WebP · up to 2 MB')}</small></div>
          {logoError && <p className="shop-error" role="alert">{logoError}</p>}
          <label className="shop-check"><input type="checkbox" checked={config.numbered} onChange={event => update('numbered', event.target.checked)} /><span>{text('أضف ترقيم للترابيزات', 'Add table numbers')}<small>{text('رقم مختلف على كل قطعة في نفس التصميم.', 'A different number on each stand in this design.')}</small></span></label>
          {config.numbered && <label className="shop-label shop-number-start">{text('ابدأ الترقيم من', 'Start numbering from')}<input className="shop-input" type="number" min={1} max={9999} required value={config.startNumber} onChange={event => update('startNumber', Math.min(9999, Math.max(1, Math.floor(Number(event.target.value) || 1))))} /></label>}
          <details className="shop-extra-details"><summary>{text('عندك ملاحظات على التصميم؟', 'Any design notes?')}</summary><label className="shop-label">{text('ملاحظات على التصميم', 'Design notes')} <small>{text('(اختياري)', '(optional)')}</small><textarea className="shop-input" maxLength={300} rows={2} value={config.notes} placeholder={text('تفاصيل تحب نراعيها في الطباعة…', 'Details you’d like us to consider…')} onChange={event => update('notes', event.target.value)} /></label></details>
          <button type="button" className="shop-preview-design" onClick={() => { setView('3d'); document.getElementById('stand-preview')?.scrollIntoView({ block: 'start', behavior: 'instant' }); }}><CubeIcon size={18} aria-hidden="true" />{sticker ? text('راجع تصميمك كامل', 'Review your full design') : text('راجع تصميمك في 3D', 'Review your design in 3D')}<ArrowLeftIcon size={16} className="directional-arrow" aria-hidden="true" /></button>
        </fieldset>
        <section className="shop-purchase-panel" aria-label={text('الكمية والسعر', 'Quantity and price')}>
          <div className="shop-config-total"><div className="shop-price-intro"><span>{text('سعر القطعة حسب اختيارك', `Per ${noun.en}, with your options`)}</span><strong>{number(unitPrice(config))} <small>{text('ج.م', 'EGP')}</small></strong><small>{config.nfc ? text(`QR + NFC · يشمل إضافة ${number(price.nfc)} ج.م`, `QR + NFC · includes the ${price.nfc} EGP add-on`) : text(`QR فقط · إضافة NFC بـ${number(price.nfc)} ج.م`, `QR only · add NFC for ${price.nfc} EGP`)}</small></div><div><label htmlFor="stand-quantity">{text('عدد القطع', 'Quantity')}</label><div className="shop-quantity"><button type="button" disabled={config.quantity <= 1} onClick={() => update('quantity', Math.max(1, config.quantity - 1))} aria-label={sticker ? text('تقليل عدد الستيكرز', 'Decrease sticker quantity') : text('تقليل عدد الحوامل', 'Decrease stand quantity')}><MinusIcon size={15} aria-hidden="true" /></button><input id="stand-quantity" aria-label={sticker ? text('عدد الستيكرز', 'Sticker quantity') : text('عدد الحوامل', 'Stand quantity')} type="number" min={1} max={MAX_QUANTITY} required value={config.quantity} onChange={event => update('quantity', Math.min(MAX_QUANTITY, Math.max(1, Math.floor(Number(event.target.value) || 1))))} /><button type="button" disabled={config.quantity >= MAX_QUANTITY} onClick={() => update('quantity', Math.min(MAX_QUANTITY, config.quantity + 1))} aria-label={sticker ? text('زيادة عدد الستيكرز', 'Increase sticker quantity') : text('زيادة عدد الحوامل', 'Increase stand quantity')}><PlusIcon size={15} aria-hidden="true" /></button></div></div></div>
          <StandPriceBreakdown items={[config]} />
          <p className="shop-field-help shop-shipping-note">{text('الشحن غير محسوب في الإجمالي.', 'Shipping is not included in this total.')}</p>
          <button type="submit" className="button button-teal shop-add-button" disabled={readingLogo}><ShoppingBagIcon size={19} aria-hidden="true" />{editing ? text('احفظ التعديل في السلة', 'Save changes to bag') : text('أضف تصميمك للسلة', 'Add your design to bag')}<ArrowLeftIcon size={19} className="directional-arrow" aria-hidden="true" /></button>
          <div className="shop-save-actions"><button type="button" onClick={saveDraft}><FloppyDiskIcon size={16} aria-hidden="true" />{text('احفظ التصميم للجاي', 'Save for later')}</button><button type="button" onClick={reset}><ArrowCounterClockwiseIcon size={16} aria-hidden="true" />{text('تصميم جديد', 'Start fresh')}</button></div>
          <div className="shop-feedback" role="status">{status}{status && bag.length > 0 && <button type="button" onClick={() => setStage('bag')}>{text('عرض السلة', 'View bag')}<ArrowLeftIcon size={14} className="directional-arrow" aria-hidden="true" /></button>}</div>
        </section>
      </form>
    </div> : <section className="shop-bag-layout page-container" aria-label={text('سلة المشتريات', 'Shopping bag')}>
      {bag.length === 0 ? <div className="shop-empty"><ShoppingBagIcon size={48} weight="duotone" aria-hidden="true" /><h2>{text('لسه المساحة لبصمتك.', 'Room for your first design.')}</h2><p>{text('اختار حامل أو ستيكر وخصصه، وهتلاقيه هنا.', 'Choose a stand or a sticker and make it yours. You’ll find it here.')}</p><button className="button button-teal" onClick={() => { reset(); showCatalog(); }}>{text('صمّم أول قطعة', 'Design your first piece')}</button></div> : <>
        <div className="shop-bag-items">{bag.map(item => <article className="shop-bag-line" key={item.id}>
          <LineThumb config={item.config} width={90} />
          <div className="shop-bag-line-copy"><h2>{item.config.brand}</h2><p>{productOf(item.config.product).name[language]} · {shapeName(item.config.shape, language)} · {designLabel(item.config, language)} · {purposes.find(purpose => purpose.id === item.config.purpose)!.name[language]}</p>
            <StandColorSummary config={item.config} /><span className="shop-tech-label">{item.config.nfc ? 'QR + NFC' : text('QR فقط · بدون NFC', 'QR only · no NFC')}</span><p>{number(unitPrice(item.config))} {text('ج.م للقطعة', `EGP per ${productOf(item.config.product).noun.en}`)}</p>
            {item.config.numbered && <small>{text('ترابيزة', 'Table')} {number(item.config.startNumber)}–{number(item.config.startNumber + item.config.quantity - 1)}</small>}
            <div className="shop-bag-line-controls"><label className="shop-label">{text('الكمية', 'Quantity')}<input className="shop-input" aria-label={`${text('كمية', 'Quantity for')} ${item.config.brand}`} type="number" min={1} max={MAX_QUANTITY} value={item.config.quantity} onChange={event => setBag(current => current.map(line => line.id === item.id ? { ...line, config: { ...line.config, quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.floor(Number(event.target.value) || 1))) } } : line))} /></label><button type="button" className="shop-text-button" onClick={() => editItem(item)}>{text('عدّل التصميم', 'Edit design')}</button><button type="button" className="shop-text-button shop-remove" onClick={() => setBag(current => current.filter(line => line.id !== item.id))} aria-label={`${text('احذف', 'Remove')} ${item.config.brand}`}><TrashIcon size={15} aria-hidden="true" />{text('حذف', 'Remove')}</button></div>
          </div><strong className="shop-bag-line-price">{number(lineTotal(item.config))} <small>{text('ج.م', 'EGP')}</small></strong>
        </article>)}<button type="button" className="shop-back" onClick={() => { reset(); showCatalog(); }}><PlusIcon size={17} aria-hidden="true" />{text('أضف تصميم تاني', 'Add another design')}</button></div>
        <aside className="shop-summary"><h2>{text('ملخص السلة', 'Your bag at a glance')}</h2><StandPriceBreakdown items={bag.map(item => item.config)} /><p>{shop.state.status !== 'ready' ? text('التوصيل بيتحسب في الخطوة الجاية.', 'Delivery is added in the next step.') : shop.state.info.deliveryFeePiastres === null ? text('سعر التوصيل بيتأكد معاك بالتليفون.', 'We’ll confirm the delivery fee with you by phone.') : shop.state.info.deliveryFeePiastres === 0 ? text('التوصيل مجاني.', 'Delivery is free.') : text(`التوصيل ${number(shop.state.info.deliveryFeePiastres / 100)} ج.م، بيتضاف في الخطوة الجاية.`, `Delivery is ${number(shop.state.info.deliveryFeePiastres / 100)} EGP, added in the next step.`)}</p><button className="button button-teal" type="button" onClick={() => setStage('checkout')}>{text('كمّل بيانات الطلب', 'Continue to order details')}<ArrowLeftIcon size={18} className="directional-arrow" aria-hidden="true" /></button><small>{text('هتختار طريقة الدفع في الخطوة الجاية.', 'You’ll choose how to pay in the next step.')}</small></aside>
      </>}
    </section>}
    {stage === 'catalog' && <section className="shop-details page-container"><div><h2>{text('كل حاجة واضحة قبل ما تختار.', 'Know exactly what you’re choosing.')}</h2><p>{text('الشكل والطباعة على ذوقك. طريقة الاستخدام والسعر حسب اختيارك.', 'Your shape and print. Your choice of scan, or scan and tap.')}</p></div><div className="shop-faq">
      <details><summary>{text('أختار حامل ولا ستيكر؟', 'Stand or sticker?')}</summary><p>{text('الحامل أكريليك بيقف على الترابيزة أو الكاونتر وتقدر تنقله من مكان لمكان. الستيكر بيتلزق على سطح الترابيزة نفسها، فمش بياخد مساحة. الاتنين فيهم QR، وNFC إضافة اختيارية.', 'A stand is acrylic: it sits on a table or counter and moves wherever you need it. A sticker goes on the tabletop itself and takes no space. Both carry a QR code, with NFC as an option.')}</p></details>
      <details><summary>{text('إيه الفرق بين QR وNFC؟', 'What’s the difference between QR and NFC?')}</summary><p>{text('الـQR بيتفتح بكاميرا الموبايل وموجود في كل قطعة: الحامل بـ٣٥٠ ج.م والستيكر بـ١٥٠ ج.م. شريحة NFC إضافة اختيارية بـ١٠٠ ج.م للقطعة؛ بتفتح نفس الرابط بلمسة موبايل متوافق، مع وجود الـQR كمان.', 'QR opens through the phone camera and is always included: 350 EGP per stand, 150 EGP per sticker. An optional NFC chip adds 100 EGP per piece and opens the same link with a compatible phone.')}</p></details>
      <details><summary>{text('لازم أكون مشترك في منيو بالهنا؟', 'Do I need a Bilhanah menu subscription?')}</summary><p>{text('لأ. الحامل يقدر يفتح أي رابط منيو، تقييمات Google، موقعك أو واتساب. انت بتحدد الرابط.', 'No. Use any menu link, Google reviews, your website or WhatsApp. You choose the destination.')}</p></details>
      <details><summary>{text('الصورة هي نفس تصميمي النهائي؟', 'Does the product photo show my final print?')}</summary><p>{text('صور الحوامل توضيحية للشكل والخامة؛ افتح عرض 3D عشان تراجع اللوجو والألوان والطباعة. معاينة الستيكر مرسومة من تصميمك نفسه. وفي الحالتين هنكلمك نأكد التصميم قبل الطباعة.', 'Stand photos illustrate the shape and material; open the 3D view to review your logo, colors and print. The sticker preview is drawn from your own design. Either way, we confirm the design with you before printing.')}</p></details>
      <details><summary>{text('بعد ما أأكّد الطلب، إيه اللي بيحصل؟', 'What happens after I place my order?')}</summary><p>{text('بتاخد رقم طلب وصفحة تتابع منها حالته. هنكلمك نأكد التصميم والعنوان قبل الطباعة، وبعدها بنصنّع ونشحن. تقدر تدفع كاش للمندوب، أو أونلاين بالكارت أو المحفظة لو متاح.', 'You get an order number and a page to follow it. We call you to confirm the design and address before printing, then make and ship your stands. Pay the courier in cash, or online by card or wallet when available.')}</p></details>
    </div></section>}
  </div>;
}
