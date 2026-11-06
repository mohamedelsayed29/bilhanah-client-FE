import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, CheckCircleIcon, LinkIcon, SquaresFourIcon } from '@phosphor-icons/react';
import {
  CORE_SERVICES, type MenuSource, type RestaurantServiceView, type RestaurantSetup, restaurantSetupSchema, SERVICE_LABELS,
} from '@bilhanah/contracts';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { SectionHead } from '../../components/SettingsSections';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { restaurantApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { formatDate } from '../../lib/format';
import { useLanguage, usePageTitle } from '../../lib/language';
import { queryKeys } from '../restaurant/queries';
import { CORE_INFO, MENU_SOURCE_INFO, SERVICE_INFO } from './catalog';
import { servicesToEnable } from './choices';
import { useServiceSwitch, useSetupQuery } from './useServices';

/**
 * Settings → Services: every Bilhanah service with what it brings, whether it is on, and what it
 * needs; and where the restaurant's menu lives. Switching off hides a service and keeps its data.
 */
export function ServicesSettings() {
  const { text } = useLanguage();
  usePageTitle('الخدمات', 'Services');
  const setup = useSetupQuery();
  if (setup.isError) return <ErrorPanel error={setup.error} onRetry={() => void setup.refetch()} />;
  if (!setup.data) return <Skeleton height={420} />;
  const on = setup.data.services.filter(entry => entry.enabled).length;
  return <div className="svc-settings" data-testid="services-settings">
    <section className="card inv-set-card" aria-labelledby="svc-title">
      <SectionHead id="svc-title" icon={SquaresFourIcon} title={text('خدمات بالهنا', 'Bilhanah services')}
        text={text(`شغّال ${on} من ${setup.data.services.length}. اختار اللي محتاجه بس؛ قفل خدمة بيخفيها ومش بيمسح بياناتها.`, `${on} of ${setup.data.services.length} on. Use only what you need; turning one off hides it and keeps its data.`)} />
      <ul className="svc-list">{setup.data.services.map(entry => <ServiceRow key={entry.key} entry={entry} all={setup.data.services} />)}</ul>
      <div className="setup-core svc-core">
        <strong>{text('موجودين دايمًا:', 'Always included:')}</strong>
        <ul>{CORE_SERVICES.map(key => { const Icon = CORE_INFO[key].icon; return <li key={key}><Icon size={15} aria-hidden="true" />{text(...SERVICE_LABELS[key])}</li>; })}</ul>
      </div>
    </section>
    <MenuSourceCard setup={setup.data} />
  </div>;
}

function ServiceRow({ entry, all }: { entry: RestaurantServiceView; all: RestaurantServiceView[] }) {
  const { text, language } = useLanguage();
  const toggle = useServiceSwitch();
  const info = SERVICE_INFO[entry.key];
  const isOn = (key: RestaurantServiceView['key']) => all.find(other => other.key === key)?.enabled ?? false;
  const chain = servicesToEnable(entry.key, isOn);
  const names = (keys: RestaurantServiceView['key'][]) => keys.map(key => text(...SERVICE_LABELS[key])).join(text(' و', ' and '));
  const status = !entry.inPlan && !entry.enabled ? 'plan' : entry.enabled ? 'on' : 'off';
  return <li className={`svc-row is-${status}`} data-testid={`service-${entry.key}`}>
    <span className="svc-row-icon" aria-hidden="true"><info.icon size={22} weight="duotone" /></span>
    <div className="svc-row-text">
      <div className="svc-row-title">
        <strong id={`svc-${entry.key}`}>{text(...SERVICE_LABELS[entry.key])}</strong>
        <span className={`svc-pill is-${status}`}>{status === 'on' ? text('شغالة', 'On') : status === 'plan' ? text('مش في باقتك', 'Not in your plan') : text('مقفولة', 'Off')}</span>
      </div>
      <p>{text(...info.summary)}</p>
      {entry.requires.length > 0 && <small className="svc-row-needs">{text('محتاجة:', 'Needs:')} {names(entry.requires)}</small>}
      {entry.enabled && entry.dependents.length > 0 && <small className="svc-row-needs is-warn">{text(`اقفل ${names(entry.dependents)} الأول عشان تقفلها.`, `Turn off ${names(entry.dependents)} first to turn this off.`)}</small>}
      {entry.changedAt && <small className="muted">{entry.enabled ? text('اتشغّلت', 'Turned on') : text('اتقفلت', 'Turned off')} {formatDate(entry.changedAt, language, { day: 'numeric', month: 'short', year: 'numeric' })}</small>}
    </div>
    <div className="svc-row-action">
      {status === 'plan'
        ? <Link className="button button-secondary button-small" to="/subscription">{text('شوف الباقات', 'See plans')}</Link>
        : entry.enabled
          ? <>
            <Link className="link-action svc-open" to={info.path}>{text('افتح', 'Open')}<ArrowLeftIcon size={13} className="directional" aria-hidden="true" /></Link>
            <button type="button" role="switch" className="switch" aria-checked="true" aria-labelledby={`svc-${entry.key}`} disabled={toggle.isPending || entry.dependents.length > 0}
              onClick={() => toggle.mutate({ keys: [entry.key], enabled: false })} data-testid={`service-switch-${entry.key}`} />
          </>
          : <button type="button" role="switch" className="switch" aria-checked="false" aria-labelledby={`svc-${entry.key}`} disabled={toggle.isPending}
            title={chain.length > 1 ? text(`هتشغّل كمان: ${names(chain.slice(0, -1))}`, `Also turns on: ${names(chain.slice(0, -1))}`) : undefined}
            onClick={() => toggle.mutate({ keys: chain, enabled: true })} data-testid={`service-switch-${entry.key}`} />}
    </div>
  </li>;
}

/** Where the menu lives (Bilhanah's, the restaurant's own, or none) and the POS it uses: kept for integrations. */
function MenuSourceCard({ setup }: { setup: RestaurantSetup }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [source, setSource] = useState<MenuSource>(setup.menuSource);
  const [url, setUrl] = useState(setup.externalMenuUrl ?? '');
  const [pos, setPos] = useState(setup.externalPosName ?? '');
  useEffect(() => { setSource(setup.menuSource); setUrl(setup.externalMenuUrl ?? ''); setPos(setup.externalPosName ?? ''); }, [setup.menuSource, setup.externalMenuUrl, setup.externalPosName]);
  const dirty = source !== setup.menuSource || (source === 'EXTERNAL' && url !== (setup.externalMenuUrl ?? '')) || pos !== (setup.externalPosName ?? '');
  const urlProblem = source === 'EXTERNAL' && url.trim() !== '' && !restaurantSetupSchema.shape.externalMenuUrl.safeParse(url).success;
  const save = useMutation({
    mutationFn: () => restaurantApi.saveSetup({ menuSource: source, externalMenuUrl: source === 'EXTERNAL' ? url : null, externalPosName: pos }),
    onSuccess: saved => {
      queryClient.setQueryData(queryKeys.setup, saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurant });
      toast.success(text('اتحفظ', 'Saved'));
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  return <form className="card inv-set-card" aria-labelledby="svc-source-title" noValidate onSubmit={event => { event.preventDefault(); if (dirty && !urlProblem) save.mutate(); }} data-testid="services-menu-source">
    <SectionHead id="svc-source-title" icon={LinkIcon} title={text('المنيو والكاشير بتوعك', 'Your menu and POS')}
      text={text('لو بتستخدم منيو أو سيستم كاشير تاني، سجّله هنا عشان نربطه لما الربط يبقى متاح. التقارير بتحسب طلبات بالهنا بس.', 'If you use another menu or POS, note it here so we can connect it when that becomes available. Reports count Bilhanah orders only.')} />
    <div className="inv-options" role="radiogroup" aria-label={text('المنيو بتاعك فين', 'Where your menu is')}>
      {(['BILHANAH', 'EXTERNAL', 'NONE'] as const).map(value => <label key={value} className={`inv-option ${source === value ? 'is-checked' : ''}`}>
        <input type="radio" name="svc-source" checked={source === value} onChange={() => setSource(value)} />
        <span><strong>{text(...MENU_SOURCE_INFO[value].title)}</strong><small>{text(...MENU_SOURCE_INFO[value].help)}</small></span>
      </label>)}
    </div>
    {source === 'EXTERNAL' && <Field label={text('لينك المنيو بتاعك', 'Your menu’s link')} optional error={urlProblem ? { message: text('اكتب لينك كامل بيبدأ بـ https://', 'Enter a full link starting with https://') } : undefined}>
      <input className="input ltr" type="url" dir="ltr" placeholder="https://" value={url} onChange={event => setUrl(event.target.value)} />
    </Field>}
    <Field label={text('سيستم الكاشير (POS)', 'POS / cashier system')} optional hint={text('سيبه فاضي لو مش بتستخدم سيستم.', 'Leave empty if you don’t use one.')}>
      <input className="input" maxLength={60} placeholder={text('مثلاً Foodics', 'e.g. Foodics')} value={pos} onChange={event => setPos(event.target.value)} />
    </Field>
    {source !== 'BILHANAH' && setup.services.find(entry => entry.key === 'DIGITAL_MENU')?.enabled && <p className="svc-tip">
      <CheckCircleIcon size={16} aria-hidden="true" />{text('المنيو الرقمي لسه شغال. لو مش محتاجه، اقفله من الخدمات فوق.', 'The digital menu is still on. If you don’t need it, turn it off above.')}</p>}
    <div className="svc-source-save">
      <button type="submit" className="button button-primary button-small" disabled={!dirty || urlProblem || save.isPending} aria-busy={save.isPending || undefined}>{text('احفظ', 'Save')}</button>
    </div>
  </form>;
}
