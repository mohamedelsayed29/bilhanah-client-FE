import { Link, Outlet } from 'react-router';
import { ArrowLeftIcon, LockKeyIcon } from '@phosphor-icons/react';
import { SERVICE_LABELS, SERVICE_RULES, type RestaurantServiceKey } from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';
import { SERVICE_INFO } from './catalog';
import { servicesToEnable } from './choices';
import { useServiceSwitch } from './useServices';

/** A section that belongs to a service: while the service is off, it explains and offers to turn it on. */
export function RequireService({ service }: { service: RestaurantServiceKey }) {
  const { service: on } = useWorkspace();
  return on(service) ? <Outlet /> : <ServiceOff service={service} />;
}

export function ServiceOff({ service }: { service: RestaurantServiceKey }) {
  const { text } = useLanguage();
  const { role, can, service: isOn } = useWorkspace();
  const toggle = useServiceSwitch();
  const info = SERVICE_INFO[service];
  const name = text(...SERVICE_LABELS[service]);
  usePageTitle(SERVICE_LABELS[service][0], SERVICE_LABELS[service][1]);
  const owner = role === 'OWNER' && can('settings.manage');
  const chain = servicesToEnable(service, isOn);
  const needs = SERVICE_RULES[service].requires.filter(key => !isOn(key));
  return <section className="card svc-off" aria-labelledby="svc-off-title" data-testid="service-off">
    <span className="svc-off-icon" aria-hidden="true"><info.icon size={30} weight="duotone" /><LockKeyIcon size={16} weight="fill" className="svc-off-lock" /></span>
    <h1 id="svc-off-title" tabIndex={-1} data-page-title>{text(`${name} مقفولة`, `${name} is off`)}</h1>
    <p>{text(...info.summary)}</p>
    <ul className="svc-off-includes">{info.includes.map(entry => <li key={entry[1]}>{text(...entry)}</li>)}</ul>
    {needs.length > 0 && <p className="svc-off-needs">{text('محتاجة تشغّل كمان:', 'This also needs:')} <strong>{needs.map(key => text(...SERVICE_LABELS[key])).join(text('، ', ', '))}</strong></p>}
    {owner
      ? <div className="svc-off-actions">
        <Button loading={toggle.isPending} onClick={() => toggle.mutate({ keys: chain, enabled: true })} data-testid="service-off-enable">
          {chain.length > 1 ? text(`شغّل ${chain.map(key => SERVICE_LABELS[key][0]).join(' و')}`, `Turn on ${chain.map(key => SERVICE_LABELS[key][1]).join(' and ')}`) : text('شغّلها', 'Turn it on')}
        </Button>
        <Link className="link-action" to="/settings/services">{text('كل الخدمات', 'All services')}<ArrowLeftIcon size={14} className="directional" aria-hidden="true" /></Link>
      </div>
      : <p className="muted">{text('صاحب المطعم هو اللي يقدر يشغّلها من الإعدادات.', 'The restaurant owner can turn it on from the settings.')}</p>}
    <p className="svc-off-note">{text('لو كانت شغالة قبل كده، كل بياناتها محفوظة وهترجع زي ما هي.', 'If it was on before, all its data is kept and comes back as it was.')}</p>
  </section>;
}
