import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeftIcon, ChatCircleDotsIcon, EnvelopeSimpleIcon, ForkKnifeIcon, PaperPlaneTiltIcon, QuestionIcon } from '@phosphor-icons/react';
import { Link, useSearchParams } from 'react-router';
import { useSiteActions } from '../../../app/SiteLayout';
import type { ContactTopic } from '@bilhanah/contracts';
import { API_URL, CONTACT_EMAIL, CONTACT_WHATSAPP } from '../../../lib/config';
import { usePageTitle, useLanguage } from '../../../lib/language';
import { PageHero } from '../components/PageHero';

type SendState = 'idle' | 'sending' | 'sent' | 'failed';

export function ContactPage() {
  const { text } = useLanguage();
  const [params] = useSearchParams();
  const brandingInquiry = params.get('topic') === 'branding';
  const standInquiry = params.get('topic') === 'nfc' || brandingInquiry;
  const { openDemo } = useSiteActions();
  const [sendState, setSendState] = useState<SendState>('idle');
  usePageTitle('تواصل معانا | بالهنا', 'Contact | Bilhanah');
  const topics: { id: ContactTopic; label: string }[] = [
    { id: 'subscription', label: text('الاشتراك والباقات', 'Plans and subscriptions') },
    { id: 'nfc', label: text('حوامل الأكريليك QR وNFC', 'QR & NFC acrylic stands') },
    { id: 'support', label: text('مساعدة في الحساب', 'Help with my account') },
    { id: 'partnership', label: text('شراكة أو تعاون', 'Partnership') },
    { id: 'other', label: text('حاجة تانية', 'Something else') },
  ];

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? '').trim();
    setSendState('sending');
    try {
      const response = await fetch(`${API_URL}/v1/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: value('name'),
          email: value('email'),
          phone: value('phone') || undefined,
          restaurant: value('restaurant') || undefined,
          topic: value('topic'),
          message: value('message'),
          website: value('website') || undefined,
        }),
      });
      if (!response.ok) throw new Error(`Contact request failed with ${response.status}`);
      form.reset();
      setSendState('sent');
    } catch (error) {
      console.error(error);
      setSendState('failed');
    }
  };

  return <>
    <PageHero
      title={text('عندك سؤال؟ إحنا هنا', 'Got a question? We’re here')}
      lead={text('بتفكر تبدأ، محتاج مساعدة في حسابك، أو عايز حوامل لترابيزاتك؟ ابعتلنا وهنرد عليك على الإيميل.', 'Thinking of starting, need help with your account, or want stands for your tables? Write to us and we’ll reply by email.')}
    />

    <section className="page-container section-space contact-layout" aria-label={text('طرق التواصل', 'Ways to reach us')}>
      <form className="contact-form" onSubmit={onSubmit}>
        <div className="contact-form-heading">
          <h2>{text('ابعتلنا رسالة', 'Send us a message')}</h2>
        </div>
        <div className="contact-grid">
          <label className="contact-field"><span>{text('اسمك', 'Your name')}</span><input name="name" autoComplete="name" required /></label>
          <label className="contact-field"><span>{text('الإيميل', 'Email')}</span><input name="email" type="email" autoComplete="email" dir="ltr" required /></label>
          <label className="contact-field"><span>{text('اسم المطعم أو الكافيه', 'Restaurant or café name')} <small>{text('(اختياري)', '(optional)')}</small></span><input name="restaurant" autoComplete="organization" /></label>
          <label className="contact-field"><span>{text('رقم التليفون', 'Phone number')} <small>{text('(اختياري)', '(optional)')}</small></span><input name="phone" type="tel" autoComplete="tel" dir="ltr" /></label>
          <label className="contact-field"><span>{text('الموضوع', 'Topic')}</span><select name="topic" defaultValue={standInquiry ? 'nfc' : 'subscription'}>{topics.map(topic => <option key={topic.id} value={topic.id}>{topic.label}</option>)}</select></label>
          <label className="contact-field contact-field-wide"><span>{text('رسالتك', 'Your message')}</span><textarea name="message" rows={5} required minLength={10} maxLength={2000} defaultValue={brandingInquiry ? text('حابب أعرف تفاصيل وسعر باقة هوية المطعم (Restaurant Branding Pack): ستاندات الطاولات والكاشير، استيكرات التغليف، والتصميم الموحّد. عندنا … فرع وحوالي … ترابيزة.', 'I’d like details and pricing for the Restaurant Branding Pack: table and cashier stands, packaging stickers and a unified design. We have … branches and about … tables.') : standInquiry ? text('حابب أعرف تفاصيل حوامل الأكريليك اللي بتجمع QR وNFC، وإزاي أطلبها لمطعمي.', 'I’d like to know more about your QR & NFC acrylic stands and how to order them for my restaurant.') : ''} /></label>
          {/* Hidden from people; bots that fill it in are ignored by the API. */}
          <label className="contact-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
        <div className="contact-submit">
          <button type="submit" className="button button-teal" disabled={sendState === 'sending'}>{sendState === 'sending' ? text('بيتبعت…', 'Sending…') : text('ابعت الرسالة', 'Send message')}<PaperPlaneTiltIcon size={18} /></button>
          {sendState === 'sent' && <p role="status">{text('وصلتنا رسالتك. هنرد عليك قريب.', 'Message received. We’ll get back to you soon.')}</p>}
          {sendState === 'failed' && <p role="alert">{text(`ماقدرناش نبعت الرسالة. جرب تاني أو ابعتلنا على ${CONTACT_EMAIL}`, `We couldn’t send your message. Try again or email ${CONTACT_EMAIL}`)}</p>}
        </div>
      </form>
      <div className="contact-channels">
        <h2 className="contact-channels-title">{text('أو كلّمنا على طول', 'Or reach us directly')}</h2>
        <a className="channel-card" href={`mailto:${CONTACT_EMAIL}`}>
          <span className="channel-icon"><EnvelopeSimpleIcon size={24} /></span>
          <span className="channel-copy"><strong>{text('ابعتلنا إيميل', 'Email us')}</strong><span dir="ltr">{CONTACT_EMAIL}</span></span>
          <ArrowLeftIcon className="directional-arrow channel-arrow" size={18} />
        </a>
        {CONTACT_WHATSAPP && <a className="channel-card" href={`https://wa.me/${CONTACT_WHATSAPP}`} target="_blank" rel="noreferrer">
          <span className="channel-icon"><ChatCircleDotsIcon size={24} /></span>
          <span className="channel-copy"><strong>{text('كلّمنا واتساب', 'Message us on WhatsApp')}</strong><span dir="ltr">+{CONTACT_WHATSAPP}</span></span>
          <ArrowLeftIcon className="directional-arrow channel-arrow" size={18} />
        </a>}
        <button className="channel-card" onClick={openDemo}>
          <span className="channel-icon"><ForkKnifeIcon size={24} /></span>
          <span className="channel-copy"><strong>{text('جرّب المنيو التجريبي', 'Try the sample menu')}</strong><span>{text('شوف بالهنا من مكان زبونك', 'See Bilhanah from your guest’s seat')}</span></span>
          <ArrowLeftIcon className="directional-arrow channel-arrow" size={18} />
        </button>
        <Link className="channel-card" to="/#faq">
          <span className="channel-icon"><QuestionIcon size={24} /></span>
          <span className="channel-copy"><strong>{text('الأسئلة الشائعة', 'Frequently asked questions')}</strong><span>{text('يمكن إجابتك موجودة هنا', 'Your answer may already be here')}</span></span>
          <ArrowLeftIcon className="directional-arrow channel-arrow" size={18} />
        </Link>
      </div>

    </section>
  </>;
}
