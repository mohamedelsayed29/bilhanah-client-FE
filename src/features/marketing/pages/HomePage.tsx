import { useSiteActions } from '../../../app/SiteLayout';
import { usePageTitle } from '../../../lib/language';
import { Hero } from '../components/Hero';
import { Features, HowItWorks } from '../components/Features';
import { Pricing } from '../components/Pricing';
import { FAQ } from '../components/FAQ';
import { NfcStands } from '../components/NfcStands';
import { DashboardShowcase } from '../components/DashboardShowcase';

export function HomePage() {
  const { start, openDemo, selectPlan } = useSiteActions();
  usePageTitle('بالهنا | منيو ديجيتال للمطاعم والكافيهات', 'Bilhanah | Digital menus for restaurants & cafés');
  return <>
    <div className="hero-wrap"><Hero onStart={start} onDemo={openDemo} /></div>
    <Features onDemo={openDemo} />
    <NfcStands />
    <DashboardShowcase onStart={start} />
    <HowItWorks />
    <Pricing onSelect={selectPlan} />
    <FAQ />
  </>;
}
