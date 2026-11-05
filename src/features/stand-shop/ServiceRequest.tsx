import { useState } from 'react';
import type { FormEvent } from 'react';
import { CashRegisterIcon, CheckCircleIcon, EnvelopeSimpleIcon, PackageIcon, PaintBrushIcon, PaletteIcon, PaperPlaneTiltIcon, StickerIcon, StorefrontIcon, WhatsappLogoIcon } from '@phosphor-icons/react';
import { API_URL, CONTACT_EMAIL, CONTACT_WHATSAPP } from '../../lib/config';
import { useLanguage } from '../../lib/language';

/** Quoted services shown beside the products: not bag items, they reach us as a contact request. */
export const services = [
  { id: 'branding', name: { ar: 'Restaurant Branding Pack', en: 'Restaurant Branding Pack' }, description: { ar: 'ستاندات وتغليف وهوية واحدة لكل فروعك.', en: 'Stands, packaging and one identity for every branch.' }, tag: { ar: 'للمطاعم الكبيرة والفروع', en: 'For large & multi-branch' } },
  { id: 'custom', name: { ar: 'تصميم مخصوص', en: 'Custom design' }, description: { ar: 'ابعت فكرتك ومصمّمينا يحوّلوها لتصميمك.', en: 'Send your idea, our designers make it real.' }, tag: { ar: 'خدمة إضافية', en: 'Add-on service' } },
] as const;
export type ServiceId = typeof services[number]['id'];

type SendState = 'idle' | 'sending' | 'sent' | 'failed';
const customPieces = ['stand', 'sticker', 'packaging', 'menu', 'other'] as const;

export function ServiceRequest({ service }: { service: ServiceId }) {
  const { text, number, language } = useLanguage();
  const [sendState, setSendState] = useState<SendState>('idle');
  const branding = service === 'branding';
  const pieceLabels: Record<typeof customPieces[number], string> = { stand: text('ستاند / حامل', 'Stand'), sticker: text('ستيكر ترابيزة', 'Table sticker'), packaging: text('استيكر تغليف', 'Packaging sticker'), menu: text('منيو مطبوع', 'Printed menu'), other: text('حاجة تانية', 'Something else') };
  const whatsapp = CONTACT_WHATSAPP && `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(branding ? text('أهلًا، حابب أعرف تفاصيل Restaurant Branding Pack.', 'Hi, I’d like to know more about the Restaurant Branding Pack.') : text('أهلًا، عايز أبعت فكرة لتصميم مخصوص.', 'Hi, I’d like to send an idea for a custom design.'))}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? '').trim();
    const details = branding
      ? [`[Restaurant Branding Pack]`, `Branches: ${value('branches')}`, `Tables: ${value('tables') || '-'}`, value('message')]
      : [`[Custom design]`, `Pieces: ${data.getAll('pieces').join(', ') || '-'}`, `Quantity: ${value('quantity') || '-'}`, value('message')];
    setSendState('sending');
    try {
      const response = await fetch(`${API_URL}/v1/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value('name'), email: value('email'), phone: value('phone'), restaurant: value('restaurant') || undefined, topic: 'nfc', message: details.filter(Boolean).join('\n').slice(0, 2000), website: value('website') || undefined }),
      });
      if (!response.ok) throw new Error(`Service request failed with ${response.status}`);
      form.reset();
      setSendState('sent');
    } catch (error) {
      console.error(error);
      setSendState('failed');
    }
  }

  const includes = branding
    ? [{ icon: CashRegisterIcon, title: text('ستاندات الطاولات والكاشير', 'Table & cashier stands'), detail: text('QR وNFC على كل ترابيزة وعند الكاشير.', 'QR and NFC on every table and at the till.') },
      { icon: PackageIcon, title: text('استيكرات التغليف', 'Packaging stickers'), detail: text('لأكياس وعلب التيك أواي والدليفري.', 'For takeaway and delivery bags and boxes.') },
      { icon: PaletteIcon, title: text('تصميم موحّد لهوية المطعم', 'One unified identity'), detail: text('نفس الألوان واللوجو في كل الفروع.', 'The same colors and logo in every branch.') }]
    : [{ icon: PaintBrushIcon, title: text('ابعت فكرتك', 'Share your idea'), detail: text('اوصف اللي في دماغك، أو ابعت صور ومراجع.', 'Describe it, or send pictures and references.') },
      { icon: PaletteIcon, title: text('نصمّم لك', 'We design it'), detail: text('مصمّم بيشتغل على هوية مطعمك وألوانه.', 'A designer works from your brand and colors.') },
      { icon: StickerIcon, title: text('تراجع قبل الطباعة', 'Approve, then print'), detail: text('بنبعتلك التصميم وبنعدّل لحد ما يعجبك.', 'We send drafts and revise until you’re happy.') }];

  return <div className="shop-service page-container">
    <section className={`shop-service-intro shop-service-intro-${service}`} aria-labelledby="shop-service-title">
      <div className="shop-service-visual">{branding ? <img src="/media/branding-pack-brand-v1.jpg" alt={text('ستاند QR على ترابيزة، وشنطة تيك أواي وكوباية ومنيو، كلهم بنفس هوية المطعم', 'A QR stand on a table beside a takeaway bag, a cup and a menu, all in one restaurant identity')} width="1536" height="1024" /> : <img src="/media/custom-design-brand-v1.jpg" alt={text('منيو وستاند QR وستيكرات وشنطة وكوباية وجراب أدوات أكل، بتصميم مخصوص بنقشة واحدة', 'A menu, QR stand, stickers, bag, cup and cutlery sleeve in one custom patterned design')} width="1536" height="1024" />}</div>
      <div className="shop-service-body">
      <span className="shop-service-badge">{branding ? <StorefrontIcon size={15} weight="bold" aria-hidden="true" /> : <PaintBrushIcon size={15} weight="bold" aria-hidden="true" />}{services.find(item => item.id === service)!.tag[language]}</span>
      <h2 id="shop-service-title">{branding ? <><bdi dir="ltr">Restaurant Branding Pack</bdi><small>{text('باقة هوية المطعم الكاملة', 'Your complete restaurant identity')}</small></> : <>{text('تصميم مخصوص لمطعمك', 'A design made for your restaurant')}<small>{text('خدمة إضافية مع الحوامل والستيكرز', 'An add-on to our stands and stickers')}</small></>}</h2>
      <p>{branding ? text('ستاندات الطاولات والكاشير، واستيكرات التغليف، وتصميم موحّد لهوية مطعمك. كل حاجة بنفس الروح، من الترابيزة لحد شنطة الدليفري.', 'Table and cashier stands, packaging stickers and one unified design. One look, from the table to the delivery bag.') : text('مش لاقي التصميم اللي في دماغك في القوالب؟ ابعتلنا فكرتك، ومصمّمينا يعملولك تصميم خاص لحوامل وستيكرز وتغليف مطعمك.', 'Can’t find your look in our templates? Send us your idea and our designers will create a one-off design for your stands, stickers and packaging.')}</p>
      <ol className="shop-service-includes">{includes.map(({ icon: Icon, title, detail }, index) => <li key={title}><span aria-hidden="true">{branding ? <Icon size={20} /> : number(index + 1)}</span><div><strong>{title}</strong><small>{detail}</small></div></li>)}</ol>
      <p className="shop-service-note">{branding ? text('السعر حسب عدد الفروع والكميات. بنكلمك خلال يوم عمل بعرض سعر مفصّل.', 'Priced by branches and quantities. We reply within one business day with a detailed quote.') : text('السعر حسب التصميم والكمية. بنكلمك خلال يوم عمل نتفق على التفاصيل.', 'Priced by design and quantity. We reply within one business day to agree the details.')}</p>
      </div>
    </section>
    <form className="shop-service-form" onSubmit={submit}>
      {sendState === 'sent' ? <div className="shop-service-sent" role="status">
        <CheckCircleIcon size={44} weight="duotone" aria-hidden="true" />
        <h3>{text('طلبك وصلنا', 'Request received')}</h3>
        <p>{branding ? text('هنراجع تفاصيل مطعمك ونرجعلك بعرض سعر خلال يوم عمل.', 'We’ll review your details and come back with a quote within one business day.') : text('هنراجع فكرتك ونكلمك خلال يوم عمل. لو عندك صور أو لوجو، ابعتهم دلوقتي.', 'We’ll review your idea and call you within one business day. Got pictures or a logo? Send them now.')}</p>
        <div className="shop-service-channels">
          {whatsapp && <a className="button button-outline" href={whatsapp} target="_blank" rel="noreferrer"><WhatsappLogoIcon size={18} aria-hidden="true" />{text('ابعت على واتساب', 'Send on WhatsApp')}</a>}
          <a className="button button-outline" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(branding ? 'Restaurant Branding Pack' : 'Custom design')}`}><EnvelopeSimpleIcon size={18} aria-hidden="true" />{text('ابعت بالإيميل', 'Send by email')}</a>
        </div>
        <button type="button" className="shop-text-button" onClick={() => setSendState('idle')}>{text('ابعت طلب تاني', 'Send another request')}</button>
      </div> : <>
        <div className="shop-service-form-heading"><h3>{branding ? text('اطلب عرض سعر', 'Request a quote') : text('اطلب تصميمك', 'Request your design')}</h3><p>{text('دقيقة واحدة، وبنرجعلك خلال يوم عمل.', 'Takes a minute. We reply within one business day.')}</p></div>
        <div className="shop-two-fields">
          <label className="shop-label">{text('اسمك', 'Your name')}<input className="shop-input" name="name" autoComplete="name" required minLength={2} maxLength={80} /></label>
          <label className="shop-label">{text('اسم المطعم', 'Restaurant name')}<input className="shop-input" name="restaurant" autoComplete="organization" required maxLength={80} /></label>
          <label className="shop-label">{text('رقم الموبايل', 'Mobile number')}<input className="shop-input" name="phone" type="tel" autoComplete="tel" dir="ltr" required maxLength={30} /></label>
          <label className="shop-label">{text('الإيميل', 'Email')}<input className="shop-input" name="email" type="email" autoComplete="email" dir="ltr" required /></label>
        </div>
        {branding ? <div className="shop-two-fields">
          <label className="shop-label">{text('عدد الفروع', 'Branches')}<input className="shop-input" name="branches" type="number" min={1} max={500} required defaultValue={2} /></label>
          <label className="shop-label">{text('عدد الترابيزات تقريبًا', 'Tables, roughly')} <small>{text('(اختياري)', '(optional)')}</small><input className="shop-input" name="tables" type="number" min={1} max={10000} /></label>
        </div> : <>
          <fieldset className="shop-service-pieces"><legend>{text('عايز تصميم لإيه؟', 'What should we design?')}</legend><div>{customPieces.map(piece => <label key={piece}><input type="checkbox" name="pieces" value={piece} defaultChecked={piece === 'sticker'} /><span>{pieceLabels[piece]}</span></label>)}</div></fieldset>
          <label className="shop-label">{text('الكمية المتوقعة', 'Expected quantity')} <small>{text('(اختياري)', '(optional)')}</small><input className="shop-input" name="quantity" type="number" min={1} max={100000} /></label>
        </>}
        <label className="shop-label">{branding ? text('تفاصيل إضافية', 'Anything else') : text('اوصف فكرتك', 'Describe your idea')} {branding && <small>{text('(اختياري)', '(optional)')}</small>}<textarea className="shop-input" name="message" rows={4} maxLength={1800} required={!branding} minLength={branding ? undefined : 10} placeholder={branding ? text('مثلًا: ألوان البراند، مواعيد الافتتاح، نوع التغليف…', 'e.g. brand colors, opening dates, packaging types…') : text('الألوان، الستايل، الكلام المكتوب، أي مرجع عجبك…', 'Colors, style, wording, any reference you like…')} /></label>
        {/* Hidden from people; bots that fill it in are ignored by the API. */}
        <label className="shop-sr-only" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <button type="submit" className="button button-teal shop-service-submit" disabled={sendState === 'sending'}><PaperPlaneTiltIcon size={19} aria-hidden="true" />{sendState === 'sending' ? text('بيتبعت…', 'Sending…') : branding ? text('ابعت طلب عرض السعر', 'Send quote request') : text('ابعت طلب التصميم', 'Send design request')}</button>
        <p className="shop-field-help">{text('الصور واللوجو تقدر تبعتهم على واتساب أو الإيميل بعد ما تبعت الطلب.', 'You can send pictures and your logo by WhatsApp or email after sending this request.')}</p>
        {sendState === 'failed' && <p className="shop-error" role="alert">{text(`ماقدرناش نبعت الطلب. جرّب تاني أو ابعتلنا على ${CONTACT_EMAIL}`, `We couldn’t send your request. Try again or email ${CONTACT_EMAIL}`)}</p>}
      </>}
    </form>
  </div>;
}
