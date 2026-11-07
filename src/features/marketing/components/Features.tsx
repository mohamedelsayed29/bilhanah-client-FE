import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeftIcon, CheckIcon, QrCodeIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import { OrderFlowDemo } from './OrderFlowDemo';

export function Features({ onDemo }: { onDemo: () => void }) {
  const { text } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const demoUrl = `${window.location.origin}/?demo=1`;
  const benefits = [
    { title: text('كل صنف ياخد حقه', 'Give every item its moment'), body: text('صور واضحة، وصف يشهّي، وكل حجم بسعره. خلّي الاختيار أسهل لزبونك.', 'Beautiful photos, appetizing descriptions, and a price for every size. Make choosing easy.') },
    { title: text('إنت تدير، وإحنا نرتّب', 'Your menu, under your control'), body: text('غيّر سعر، أضف طبق، أو وقّف صنف خلص. من لوحة واحدة ومن غير طباعة جديدة.', 'Change a price, add a dish, or mark something sold out. One dashboard, no new print run.') },
    { title: text('طلبات أوضح. زبون أروق.', 'Clearer orders. Happier tables.'), body: text('استقبل طلبات الترابيزات والاستلام، ومع الباقة الكاملة نبّه الزبون لما طلبه يجهز.', 'Receive dine-in and pickup orders. With the Full Experience plan, alert customers when food is ready.') },
  ];
  async function copyLink() {
    try { await navigator.clipboard.writeText(demoUrl); setCopied(true); setCopyError(false); } catch { setCopyError(true); }
  }
  return <section id="features" className="features-section page-container section-space" aria-labelledby="features-title">
    <div className="feature-copy">
      <h2 id="features-title">{text('الأكل والمشروبات شغلتك، والمنيو علينا.', 'You make the food and drinks. We make the menu easy.')}</h2>
      <p className="section-intro">{text('منيو لمطعمك أو كافيهك بالصور والأسعار على موبايل كل زبون، بتعدّله من لوحة واحدة، وبياخد طلبات الترابيزات لما تحب.', 'A menu for your restaurant or café, with photos and prices on every guest’s phone. You edit it from one dashboard, and it takes table orders when you’re ready.')}</p>
      <div className="feature-list">{benefits.map(({ title, body }) => <article className="feature-row" key={title}><h3>{title}</h3><p>{body}</p></article>)}</div>
      <button className="text-link" onClick={onDemo}>{text('افتح المنيو وجرّب بنفسك', 'Open the menu and try it')}<ArrowLeftIcon className="directional-arrow" size={19} /></button>
    </div>
    <div className="menu-showcase">
      <OrderFlowDemo />
      <div className="qr-stand"><QRCodeSVG value={demoUrl} size={84} fgColor="#35172F" bgColor="#ffffff" level="M" marginSize={0} title={text('امسح لفتح المنيو التجريبي', 'Scan to open the sample menu')} /><span>{text('سكان وبالهنا!', 'Scan. Explore. Enjoy!')}</span><button onClick={copyLink}>{copied ? <CheckIcon size={13} /> : <QrCodeIcon size={13} />}{copied ? text('اتنسخ اللينك', 'Link copied') : text('انسخ لينك التجربة', 'Copy demo link')}</button>{copyError && <small role="status">{text('افتح التجربة من الزر أسفلها.', 'Open the sample with the button below.')}</small>}</div>
    </div>
  </section>;
}

export function HowItWorks() {
  const { text, number } = useLanguage();
  const steps = [
    { title: text('ضيف لمستك', 'Make it yours'), body: text('سجّل بيانات مطعمك أو كافيهك، ارفع اللوجو، وضيف أكلاتك ومشروباتك بصورها وأسعارها.', 'Add your restaurant or café details, upload your logo, and bring your food and drinks to life with photos and prices.') },
    { title: text('حط المنيو على الترابيزة', 'Bring your menu to the table'), body: text('اطبع الـQR، أو اختار حامل الأكريليك اللي بيجمع QR وNFC. زبونك يعمل سكان أو يقرّب موبايله ويفتح المنيو.', 'Print your QR, or choose an acrylic stand with QR and NFC. Guests can scan the code or tap their phone to open your menu.') },
    { title: text('واستقبل زباينك بالهنا', 'Let good hospitality happen'), body: text('زبونك يعمل سكان، يتصفح المنيو، ويطلب حسب الباقة اللي اخترتها.', 'Your customer scans, explores, and orders with the features included in your plan.') },
  ];
  return <section id="how-it-works" className="how-section section-space" aria-labelledby="how-title"><div className="page-container">
    <div className="how-heading"><h2 id="how-title">{text('من التسجيل لأول طلب في ٣ خطوات', 'From sign-up to first order in three steps')}</h2></div>
    <div className="how-grid">{steps.map((step, index) => <article className="how-step" key={step.title}><span className="step-index">{number(index + 1)}</span><h3>{step.title}</h3><p>{step.body}</p></article>)}</div>
  </div></section>;
}
