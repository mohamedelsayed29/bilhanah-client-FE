import { useSiteActions } from '../../../app/SiteLayout';
import { usePageTitle } from '../../../lib/language';
import { Hero } from '../components/Hero';
import { Features } from '../components/Features';
import { Pricing } from '../components/Pricing';
import { FAQ } from '../components/FAQ';
import { OrderJourney, ServicesTeaser, TrustBar } from '../components/ProductSections';
import { Integrations } from '../components/Integrations';
import { BusinessTypes } from '../components/BusinessTypes';

/** The short version: what Bilhanah is, a live try, the plans. Details live on their own pages. */
export function HomePage() {
  const { start, openDemo, selectPlan } = useSiteActions();
  usePageTitle('بالهنا | منيو وطلبات وكاشير وولاء لمطعمك', 'Bilhanah | Menu, ordering, POS and loyalty for restaurants');
  return <>
    <div className="hero-wrap"><Hero onStart={start} onDemo={openDemo} /></div>
    <TrustBar />
    <ServicesTeaser />
    <Integrations />
    <BusinessTypes />
    <Features onDemo={openDemo} />
    <OrderJourney moreLink />
    <Pricing onSelect={selectPlan} compareLink />
    <FAQ limit={5} />
  </>;
}
