import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PlusIcon } from '@phosphor-icons/react';
import {
  CORE_SERVICES, MENU_SOURCES, type MenuSource, missingRequirements, planIncludesService, RESTAURANT_SERVICES, type RestaurantServiceKey, restaurantSetupSchema,
  SERVICE_LABELS, type ServiceStates,
} from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { restaurantApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../lib/language';
import { queryKeys, useRestaurantQuery } from '../restaurant/queries';
import { CORE_INFO, MENU_SOURCE_INFO, SERVICE_INFO } from './catalog';
import { defaultServices, toggleService } from './choices';

/**
 * Onboarding's last step: whether the restaurant already has a QR menu (keep it, skip it, or use
 * Bilhanah's), its POS, and the services to start with. Nothing here is final: every service can be
 * switched on or off later from Settings → Services, and skipping keeps everything on.
 */
export function SetupPage() {
  const { text, number } = useLanguage();
  usePageTitle('اختار خدماتك', 'Choose your services');
  const restaurant = useRestaurantQuery();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const setup = restaurant.data?.setup;
  const plan = restaurant.data?.access.planFeatures;
  const [source, setSource] = useState<MenuSource | null>(null);
  const [menuUrl, setMenuUrl] = useState('');
  const [hasPos, setHasPos] = useState(false);
  const [posName, setPosName] = useState('');
  const [chosen, setChosen] = useState<Set<RestaurantServiceKey>>(() => defaultServices('BILHANAH'));
  const [saving, setSaving] = useState<'finish' | 'skip' | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Owners coming back here see what they chose before.
  useEffect(() => {
    if (!setup?.completedAt) return;
    setSource(setup.menuSource);
    setMenuUrl(setup.externalMenuUrl ?? '');
    setHasPos(Boolean(setup.externalPosName));
    setPosName(setup.externalPosName ?? '');
    setChosen(new Set(RESTAURANT_SERVICES.filter(key => setup.services[key])));
  }, [setup]);

  const pickSource = (next: MenuSource) => { setSource(next); setChosen(defaultServices(next)); };
  const available = (key: RestaurantServiceKey) => !plan || planIncludesService(key, plan);
  const body = {
    menuSource: source ?? 'BILHANAH',
    externalMenuUrl: source === 'EXTERNAL' ? menuUrl : null,
    externalPosName: hasPos ? posName : null,
  };
  const urlProblem = source === 'EXTERNAL' && menuUrl.trim() !== '' && !restaurantSetupSchema.shape.externalMenuUrl.safeParse(menuUrl).success;

  const save = async (mode: 'finish' | 'skip') => {
    setError(null);
    setSaving(mode);
    try {
      await restaurantApi.saveSetup(mode === 'skip' ? { menuSource: 'BILHANAH' } : { ...body, services: [...chosen].filter(available) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.restaurant });
      toast.success(mode === 'skip'
        ? text('تمام! كل الخدمات شغالة، وتقدر تقفل أي واحدة من الإعدادات.', 'All set! Every service is on; turn any off from Settings.')
        : text('مطعمك جاهز بالخدمات اللي اخترتها.', 'Your restaurant is ready with the services you chose.'));
      navigate('/', { replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(null);
    }
  };

  return <section className="onboarding setup" aria-labelledby="setup-title">
    <ol className="steps" aria-label={text('خطوات البداية', 'Getting started')}>
      <li className="done"><span><CheckIcon size={14} weight="bold" aria-hidden="true" /></span>{text('الحساب', 'Account')}</li>
      <li className="done"><span><CheckIcon size={14} weight="bold" aria-hidden="true" /></span>{text('بيانات المطعم', 'Restaurant details')}</li>
      <li className="current" aria-current="step"><span>{number(3)}</span>{text('الخدمات', 'Services')}</li>
    </ol>
    <header className="auth-card-header">
      <h1 id="setup-title" tabIndex={-1} data-page-title>{text('اختار اللي محتاجه من بالهنا', 'Pick what you need from Bilhanah')}</h1>
      <p>{text('مش لازم تستخدم كل حاجة. ابدأ باللي يناسبك، وشغّل أي خدمة تانية بعدين من غير ما تعيد أي حاجة.', 'You don’t have to use everything. Start with what fits, and turn on more later without redoing anything.')}</p>
    </header>
    {error !== null && <Alert kind="error">{errorMessage(error, text)}</Alert>}

    <fieldset className="setup-block" data-testid="setup-menu-source">
      <legend><span className="setup-num" aria-hidden="true">{number(1)}</span>{text('عندك منيو QR بالفعل؟', 'Do you already have a QR menu?')}</legend>
      <div className="setup-sources">
        {(['BILHANAH', 'EXTERNAL', 'NONE'] as const satisfies readonly (typeof MENU_SOURCES)[number][]).map(value => {
          const info = MENU_SOURCE_INFO[value];
          return <label key={value} className={`setup-source ${source === value ? 'is-checked' : ''}`} data-testid={`setup-source-${value}`}>
            <input type="radio" name="menu-source" checked={source === value} onChange={() => pickSource(value)} />
            <span className="setup-source-icon" aria-hidden="true"><info.icon size={22} weight="duotone" /></span>
            <strong>{text(...info.title)}</strong>
            <small>{text(...info.help)}</small>
            {value === 'BILHANAH' && <em className="setup-badge">{text('الأكتر استخدامًا', 'Most popular')}</em>}
          </label>;
        })}
      </div>
      {source === 'EXTERNAL' && <Field label={text('لينك المنيو بتاعك', 'Your menu’s link')} optional
        error={urlProblem ? { message: text('اكتب لينك كامل بيبدأ بـ https://', 'Enter a full link starting with https://') } : undefined}
        hint={text('بنحفظه عندنا عشان نربطه ببالهنا لما الربط يبقى متاح.', 'We keep it so we can connect it to Bilhanah when that becomes available.')}>
        <input className="input ltr" type="url" inputMode="url" dir="ltr" placeholder="https://" value={menuUrl} onChange={event => setMenuUrl(event.target.value)} data-testid="setup-menu-url" />
      </Field>}
    </fieldset>

    <fieldset className="setup-block" disabled={source === null}>
      <legend><span className="setup-num" aria-hidden="true">{number(2)}</span>{text('بتستخدم سيستم كاشير (POS)؟', 'Do you use a POS / cashier system?')}</legend>
      <div className="segmented setup-pos">
        <label><input type="radio" name="has-pos" checked={!hasPos} onChange={() => setHasPos(false)} />{text('لأ', 'No')}</label>
        <label><input type="radio" name="has-pos" checked={hasPos} onChange={() => setHasPos(true)} data-testid="setup-has-pos" />{text('أيوه', 'Yes')}</label>
      </div>
      {hasPos && <Field label={text('اسم السيستم', 'Which system?')} optional hint={text('عشان نجهز الربط معاه في المستقبل. التقارير هنا بتحسب طلبات بالهنا بس.', 'So we can prepare an integration later. Reports here count Bilhanah orders only.')}>
        <input className="input" maxLength={60} placeholder={text('مثلاً Foodics', 'e.g. Foodics')} value={posName} onChange={event => setPosName(event.target.value)} data-testid="setup-pos-name" />
      </Field>}
    </fieldset>

    <fieldset className="setup-block" disabled={source === null} data-testid="setup-services">
      <legend><span className="setup-num" aria-hidden="true">{number(3)}</span>{text('الخدمات اللي هتبدأ بيها', 'Services to start with')}</legend>
      <ul className="setup-services">
        {RESTAURANT_SERVICES.map(key => {
          const info = SERVICE_INFO[key];
          const on = chosen.has(key) && available(key);
          const needsMenu = key !== 'DIGITAL_MENU' && missingRequirements(key, { ...Object.fromEntries(RESTAURANT_SERVICES.map(entry => [entry, chosen.has(entry)])) } as ServiceStates).length > 0;
          return <li key={key}>
            <button type="button" className={`setup-service ${on ? 'is-on' : ''}`} aria-pressed={on} disabled={!available(key)} onClick={() => setChosen(current => toggleService(current, key))} data-testid={`setup-service-${key}`}>
              <span className="setup-service-icon" aria-hidden="true"><info.icon size={20} weight="duotone" /></span>
              <span className="setup-service-text">
                <strong>{text(...SERVICE_LABELS[key])}</strong>
                <small>{!available(key) ? text('مش في باقتك الحالية', 'Not in your current plan') : needsMenu ? text('بتشغّل المنيو الرقمي معاها', 'Turns on the digital menu too') : text(...info.summary)}</small>
              </span>
              <span className="setup-service-check" aria-hidden="true">{on ? <CheckIcon size={14} weight="bold" /> : <PlusIcon size={14} weight="bold" />}</span>
            </button>
          </li>;
        })}
      </ul>
      <div className="setup-core">
        <strong>{text('موجودين دايمًا:', 'Always included:')}</strong>
        <ul>{CORE_SERVICES.map(key => { const Icon = CORE_INFO[key].icon; return <li key={key}><Icon size={15} aria-hidden="true" />{text(...SERVICE_LABELS[key])}</li>; })}</ul>
      </div>
    </fieldset>

    <div className="setup-actions">
      <Button block loading={saving === 'finish'} disabled={source === null || urlProblem || saving !== null} onClick={() => void save('finish')} data-testid="setup-finish">
        {text('خلّصت، افتح لوحة التحكم', 'Done, open my dashboard')}
      </Button>
      <button type="button" className="text-button" disabled={saving !== null} onClick={() => void save('skip')} data-testid="setup-skip">
        {text('اتخطى دلوقتي (كل الخدمات هتبقى شغالة)', 'Skip for now (every service stays on)')}
      </button>
      <p className="muted setup-later">{text('تقدر تغيّر أي حاجة بعدين من الإعدادات ← الخدمات. قفل خدمة مش بيمسح بياناتها.', 'Change anything later in Settings → Services. Turning a service off never deletes its data.')}</p>
    </div>
  </section>;
}
