import { Link } from 'react-router';
import { useSiteActions } from '../../../app/SiteLayout';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { PageHero } from '../components/PageHero';
import { HowItWorks } from '../components/Features';
import { Pricing } from '../components/Pricing';
import { FAQ } from '../components/FAQ';
import { NfcStands } from '../components/NfcStands';
import { SupportBand } from '../components/SupportBand';
import { PosHero } from '../components/PosShowcase';
import { ProductTour } from '../components/ProductTour';
import { PlatformFilm } from '../components/PlatformFilm';
import { Integrations } from '../components/Integrations';
import { Audiences, ModularServices, OrderJourney, PlanComparison, Services } from '../components/ProductSections';

/** /features — the product, a tour of real screens, then every service. */
export function FeaturesPage() {
  const { selectPlan } = useSiteActions();
  usePageTitle('خدمات بالهنا | منيو وطلبات وكاشير وولاء ومخزون', 'Bilhanah services | Menu, ordering, POS, loyalty and inventory');
  return <>
    <PosHero onStart={() => selectPlan('orders')} />
    <ProductTour />
    <Services />
    <Integrations />
  </>;
}

/** /how-it-works — the platform as a film, then the steps, one order end to end, and the table stands. */
export function HowItWorksPage() {
  const { text } = useLanguage();
  usePageTitle('بالهنا بيشتغل إزاي؟', 'How Bilhanah works');
  return <>
    <section className="page-hero pf-hero" aria-labelledby="page-title">
      <div className="page-container pf-hero-copy">
        <p>{text('بتشتغل إزاي؟', 'How it works')}</p>
        <h1 id="page-title">{text('من التسجيل لإدارة مطعمك كله', 'From sign-up to running your whole restaurant')}</h1>
        <p>{text('تسجيل حقيقي من لوحة تحكم بالهنا: من أول ما تسجّل، للمنيو والـQR، لأول طلب، لحد التقارير.', 'A real recording of the Bilhanah dashboard: from signing up, to the menu and QR codes, the first order, and your reports.')}</p>
      </div>
    </section>
    <div className="page-container pf-stage"><PlatformFilm /></div>
    <HowItWorks />
    <OrderJourney />
    <NfcStands />
  </>;
}

/** /pricing — the plans, a service picker, and the full comparison. */
export function PricingPage() {
  const { text } = useLanguage();
  const { start, selectPlan } = useSiteActions();
  usePageTitle('أسعار وباقات بالهنا', 'Bilhanah plans & pricing');
  return <>
    <PageHero compact eyebrow={text('الأسعار', 'Pricing')} title={text('ادفع على قد اللي بتستخدمه', 'Pay for what you use')} lead={text('٣٠ يوم مجانًا على الباقة الكاملة، واشتراك شهري من غير تجديد تلقائي.', '30 days free on the Full Experience plan, then monthly with no automatic renewal.')} />
    <Pricing onSelect={selectPlan} />
    <PlanComparison />
    <ModularServices onSelect={selectPlan} />
    <SupportBand onStart={start} />
  </>;
}

/** /solutions — who Bilhanah is for. */
export function SolutionsPage() {
  const { text } = useLanguage();
  const { selectPlan } = useSiteActions();
  usePageTitle('لمين بالهنا؟ | كافيهات ومطاعم وسلاسل', 'Who Bilhanah is for | Cafés, restaurants and chains');
  return <>
    <PageHero eyebrow={text('لمين بالهنا؟', 'Who it’s for')} title={text('على مقاس مكانك، صغير أو كبير', 'Fits your place, small or large')} lead={text('كافيه بفرع واحد أو سلسلة بعشر فروع: ابدأ بالخدمات اللي تناسبك وكبّر وقت ما تحب.', 'A one-branch café or a ten-branch chain: start with the services that suit you and grow whenever you like.')} />
    <Audiences onSelect={selectPlan} />
    <ModularServices onSelect={selectPlan} />
  </>;
}

/** /faq — every common question, then support. */
export function FaqPage() {
  const { text } = useLanguage();
  const { start } = useSiteActions();
  usePageTitle('الأسئلة الشائعة | بالهنا', 'FAQ | Bilhanah');
  return <>
    <PageHero compact eyebrow={text('الأسئلة الشائعة', 'FAQ')} title={text('أسئلة بتتسأل كتير', 'Common questions')} lead={<>{text('مش لاقي إجابتك؟', 'Didn’t find your answer?')} <Link className="inline-link page-hero-link" to="/contact">{text('كلّمنا', 'Ask us')}</Link></>} />
    <FAQ heading={false} />
    <SupportBand onStart={start} />
  </>;
}
