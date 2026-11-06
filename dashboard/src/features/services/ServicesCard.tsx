import { Link } from 'react-router';
import { ArrowLeftIcon, RocketLaunchIcon } from '@phosphor-icons/react';
import { type OwnerRestaurant, RESTAURANT_SERVICES, SERVICE_LABELS } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';
import { SERVICE_INFO } from './catalog';

/** Shown on the overview until the owner has chosen services (or skipped). */
export function SetupPrompt({ restaurant }: { restaurant: OwnerRestaurant }) {
  const { text } = useLanguage();
  const { can } = useWorkspace();
  if (restaurant.setup.completedAt || !can('settings.manage')) return null;
  return <section className="card svc-prompt" aria-labelledby="svc-prompt-title" data-testid="setup-prompt">
    <span className="svc-prompt-icon" aria-hidden="true"><RocketLaunchIcon size={22} weight="duotone" /></span>
    <div>
      <h2 id="svc-prompt-title">{text('كمّل تجهيز مطعمك', 'Finish setting up')}</h2>
      <p>{text('قولنا عندك منيو QR ولا لأ، واختار الخدمات اللي محتاجها بس. دقيقة واحدة.', 'Tell us whether you have a QR menu, and pick only the services you need. One minute.')}</p>
    </div>
    <Link className="button button-primary button-small" to="/setup">{text('اختار خدماتك', 'Choose your services')}</Link>
  </section>;
}

/** The restaurant's services at a glance: open the ones that are on, turn on the others. */
export function ServicesCard() {
  const { text } = useLanguage();
  const { service, can } = useWorkspace();
  const on = RESTAURANT_SERVICES.filter(key => service(key));
  const off = RESTAURANT_SERVICES.filter(key => !service(key));
  return <section className="card section overview-card svc-card" aria-labelledby="svc-card-title" data-testid="services-card">
    <div className="section-head"><h2 id="svc-card-title">{text('خدماتك', 'Your services')}</h2>
      {can('settings.manage') && <Link className="link-action" to="/settings/services">{text('إدارة', 'Manage')}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>}</div>
    <ul className="svc-card-list">
      {on.map(key => { const Icon = SERVICE_INFO[key].icon; return <li key={key}><Link to={SERVICE_INFO[key].path}><Icon size={18} weight="duotone" aria-hidden="true" />{text(...SERVICE_LABELS[key])}</Link></li>; })}
    </ul>
    {off.length > 0 && can('settings.manage') && <p className="svc-card-more">
      {text('متاح كمان:', 'Also available:')} {off.map(key => text(...SERVICE_LABELS[key])).join(text('، ', ', '))}
    </p>}
  </section>;
}
