import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import { useSiteActions } from '../../../app/SiteLayout';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { PosDevice } from '../components/PosShowcase';
import { ReportSamples } from '../components/ReportsShowcase';
import { LoyaltyFilm, LoyaltyGrowth } from '../components/LoyaltyShowcase';
import { featurePages, services } from '../data/services';
import { usePlans } from '../hooks/usePlans';
import { NotFoundPage } from './NotFoundPage';
import './feature-page.css';

/** /features/:slug — one service in more depth. */
export function FeaturePage() {
  const { slug } = useParams();
  const page = featurePages.find(item => item.slug === slug);
  if (!page) return <NotFoundPage />;
  return <FeatureContent slug={page.slug} />;
}

/** A real screenshot of the dashboard, in the visitor's language. */
function Screenshot({ name, alt }: { name: string; alt: string }) {
  const { language } = useLanguage();
  return <div className="fp-frame"><img src={`/media/dashboard/${name}-${language}.webp`} alt={alt} width="1600" height="1000" /></div>;
}

function FeatureContent({ slug }: { slug: string }) {
  const { text, number, language } = useLanguage();
  const { selectPlan } = useSiteActions();
  const plans = usePlans();
  const page = featurePages.find(item => item.slug === slug)!;
  const service = services.find(item => item.key === page.service)!;
  const plan = plans.find(item => item.id === service.from)!;
  usePageTitle(`${service.name.ar} | بالهنا`, `${service.name.en} | Bilhanah`);
  const related = featurePages.filter(item => item.slug !== slug);
  const title = page.title[language];
  const visuals: Record<string, ReactElement> = {
    pos: <PosDevice />,
    menu: <Screenshot name="menu" alt={title} />,
    ordering: <Screenshot name="tables" alt={title} />,
    reports: <Screenshot name="orders" alt={title} />,
    loyalty: <LoyaltyFilm />,
  };
  const visual = visuals[slug];
  return <>
    <section className={`page-hero fp-hero ${visual ? 'has-visual' : ''}`} aria-labelledby="page-title">
      <div className="page-container fp-hero-copy">
        <p className="fp-eyebrow">{service.name[language]}</p>
        <h1 id="page-title">{title}</h1>
        <p className="fp-lead">{page.intro[language]}</p>
        <div className="fp-actions">
          {slug === 'reports'
            ? <a className="button button-teal" href="#sample">{text('حمّل تقرير نموذجي', 'Download a sample report')}</a>
            : <button className="button button-teal" onClick={() => selectPlan(plan.id)}>{text('ابدأ ببلاش ٣٠ يوم', 'Start free for 30 days')}</button>}
          <Link className="fp-link" to="/pricing">{service.from === 'menu'
            ? text('متاح في كل الباقات', 'Included in every plan')
            : text(`من باقة ${plan.name.ar} · ${number(plan.price)} جنيه/شهر`, `From ${plan.name.en} · EGP ${number(plan.price)}/mo`)}<ArrowLeftIcon className="directional-arrow" size={16} /></Link>
        </div>
      </div>
    </section>
    {visual && <div className="page-container fp-visual">{visual}</div>}
    <section className="page-container fp-points" aria-labelledby="points-title">
      <h2 id="points-title" className="fp-points-title">{text(`اللي هتلاقيه في ${service.name.ar}`, `What you get with ${service.name.en}`)}</h2>
      <ol>{page.points.map((point, index) => <li key={point.title.en}>
        <span className="fp-num">{number(0)}{number(index + 1)}</span>
        <h2>{point.title[language]}</h2>
        <p>{point.body[language]}</p>
      </li>)}</ol>
    </section>
    {slug === 'reports' && <div className="page-container fp-sample"><ReportSamples /></div>}
    {slug === 'loyalty' && <LoyaltyGrowth />}
    <nav className="page-container fp-related" aria-labelledby="related-title">
      <h2 id="related-title">{text('خدمات تانية', 'Other services')}</h2>
      <ul>{related.map(item => {
        const other = services.find(entry => entry.key === item.service)!;
        return <li key={item.slug}><Link to={`/features/${item.slug}`}><strong>{other.name[language]}</strong><span>{other.line[language]}</span></Link></li>;
      })}</ul>
      <Link className="fp-link fp-all" to="/features">{text('كل الخدمات', 'All services')}<ArrowLeftIcon className="directional-arrow" size={16} /></Link>
    </nav>
  </>;
}
