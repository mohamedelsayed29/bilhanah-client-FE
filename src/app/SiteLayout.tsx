import { useEffect, useState } from 'react';
import { Outlet, useLocation, useOutletContext } from 'react-router';
import { CheckIcon, SignInIcon, UserPlusIcon } from '@phosphor-icons/react';
import { Dialog } from '../components/Dialog';
import { DASHBOARD_URL } from '../lib/config';
import { useLanguage } from '../lib/language';
import { Header } from '../features/marketing/components/Header';
import { Footer } from '../features/marketing/components/Footer';
import { DemoShowcase } from '../features/marketing/components/DemoShowcase';
import { usePlans } from '../features/marketing/hooks/usePlans';
import type { PlanId } from '../features/marketing/data/plans';

export type SiteActions = { start: () => void; openDemo: () => void; selectPlan: (plan: PlanId) => void };

/** Actions shared by every marketing page: open the trial dialog, the sample menu, or a specific plan. */
export function useSiteActions() {
  return useOutletContext<SiteActions>();
}

/** Route changes start at the top of the page; links with a hash scroll to that section once it renders. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return; }
    const frame = requestAnimationFrame(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);
  return null;
}

export function SiteLayout() {
  const { pathname } = useLocation();
  // The stand shop and its order pages share the store's header.
  const store = pathname === '/shop' || pathname.startsWith('/shop/');
  const { language, text, number } = useLanguage();
  const [demoOpen, setDemoOpen] = useState(() => new URLSearchParams(location.search).get('demo') === '1');
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const plans = usePlans();
  const selected = plans.find(plan => plan.id === selectedPlan);
  const openDemo = () => setDemoOpen(true);
  const start = () => setSelectedPlan('advanced');
  return <>
    <a className="skip-link" href="#main-content">{text('انتقل للمحتوى', 'Skip to content')}</a>
    <Header onStart={start} store={store} />
    <ScrollManager />
    <main id="main-content">
      <Outlet context={{ start, openDemo, selectPlan: setSelectedPlan } satisfies SiteActions} />
      <Footer onStart={start} showClosing={!store} />
    </main>
    <Dialog open={demoOpen} onClose={() => setDemoOpen(false)} title={text('منيو بالهنا التجريبي', 'Bilhanah sample menu')} className="demo-dialog"><DemoShowcase /></Dialog>
    <Dialog open={!!selected} onClose={() => setSelectedPlan(null)} title={text('تجربتك مع بالهنا', 'Your Bilhanah experience')} className="trial-dialog">
      {selected && <>
        <div className="trial-hero">
          <span className="trial-icon"><img src="/brand/bilhanah-mark.svg" alt="" width="445" height="479" /></span>
          <span className="trial-badge">{text('٣٠ يوم مجانًا', '30 days free')}</span>
        </div>
        <div className="trial-body">
          <h2>{text('منيو مطعمك أو كافيهك يبدأ من هنا.', 'Your restaurant or café menu starts here.')}</h2>
          <p>{text('اعمل حسابك وجرّب التجربة الكاملة ٣٠ يوم، من غير تجديد تلقائي.', 'Create your account and try the Full Experience for 30 days. No automatic renewal.')}</p>
          <div className="trial-plan"><span><CheckIcon size={16} weight="bold" />{selected.name[language]}</span><small>{text(`بعد التجربة ${number(selected.price)} جنيه / شهر`, `Then ${number(selected.price)} EGP / month`)}</small></div>
          {DASHBOARD_URL
            ? <div className="trial-actions">
              <a className="button button-teal" href={`${DASHBOARD_URL}/register?plan=${selected.id}`}><UserPlusIcon size={19} />{text('أنشئ حساب جديد', 'Create account')}</a>
              <a className="button button-outline" href={`${DASHBOARD_URL}/login`}><SignInIcon size={19} />{text('تسجيل الدخول', 'Log in')}</a>
              <small>{text('عندك حساب بالفعل؟ سجّل دخولك وكمّل من مكانك.', 'Already have an account? Log in and pick up where you left off.')}</small>
            </div>
            : <div className="launch-notice" role="status">{text('إنشاء الحسابات هيتاح قريبًا.', 'Account registration is coming soon.')}</div>}
        </div>
      </>}
    </Dialog>
  </>;
}
