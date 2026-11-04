import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, StarIcon } from '@phosphor-icons/react';
import {
  KITCHEN_STATION_KINDS, KITCHEN_STATION_LIMITS, type KitchenReadyRule, type KitchenStation, type KitchenStationKind, type KitchenStationList,
} from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Dialog } from '../../../components/Dialog';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { Field } from '../../../components/Field';
import { Section } from '../../../components/Section';
import { Skeleton } from '../../../components/Skeleton';
import { useToast } from '../../../components/Toast';
import { kitchenStationsApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { STATION_ICONS } from '../../kitchen/kds/Ticket';
import { useWorkspace } from '../../branches/workspace';
import { queryKeys } from '../queries';
import { KitchenInsights } from './KitchenInsights';

const KIND_TEXT: Record<KitchenStationKind, [string, string]> = {
  MAIN: ['مطبخ رئيسي', 'Main kitchen'], GRILL: ['شوي', 'Grill'], DRINKS: ['مشروبات', 'Drinks'], DESSERTS: ['حلويات', 'Desserts'],
  COLD: ['بارد وسلطات', 'Cold & salads'], BAKERY: ['مخبوزات', 'Bakery'], OTHER: ['تانية', 'Other'],
};

function useStations() {
  return useQuery({ queryKey: queryKeys.kitchenStations, queryFn: kitchenStationsApi.list });
}

/**
 * The kitchen display's setup: the preparation stations (each kitchen screen shows one), how long
 * each usually takes (past it, orders show as late), when an order turns ready, and how the kitchen
 * is doing. Which dishes go to which station is chosen on the menu.
 */
export function KitchenDisplaySettings() {
  const { text } = useLanguage();
  usePageTitle('شاشة المطبخ', 'Kitchen display');
  const { can } = useWorkspace();
  const queryClient = useQueryClient();
  const toast = useToast();
  const stations = useStations();
  const [editing, setEditing] = useState<KitchenStation | 'new' | null>(null);
  const [removing, setRemoving] = useState<KitchenStation | null>(null);
  const store = (list: KitchenStationList) => queryClient.setQueryData(queryKeys.kitchenStations, list);
  const update = useMutation({
    mutationFn: ({ station, body }: { station: KitchenStation; body: Parameters<typeof kitchenStationsApi.update>[1] }) => kitchenStationsApi.update(station.id, body),
    onSuccess: store,
    onError: error => toast.error(errorMessage(error, text)),
  });
  const rule = useMutation({
    mutationFn: (readyRule: KitchenReadyRule) => kitchenStationsApi.setReadyRule(readyRule),
    onSuccess: list => { store(list); toast.success(text('اتحفظ', 'Saved')); },
    onError: error => toast.error(errorMessage(error, text)),
  });
  const remove = useMutation({
    mutationFn: (station: KitchenStation) => kitchenStationsApi.remove(station.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.kitchenStations });
      toast.success(text('مسحنا المحطة، وأصنافها راحت للمحطة الأساسية', 'Station deleted; its dishes now go to the default station'));
      setRemoving(null);
    },
    onError: error => toast.error(errorMessage(error, text)),
  });

  const list = stations.data?.stations ?? [];
  const full = list.length >= KITCHEN_STATION_LIMITS.stations;

  return <div className="settings-grid">
    <div className="settings-main">
      <Section id="stations-title" title={text('محطات التحضير', 'Preparation stations')}
        description={text('كل محطة ليها شاشة بتعرض أصنافها بس. حدّد لكل محطة الوقت المعتاد للتحضير، ولو الطلب عدّاه بيظهر متأخر بالأحمر.', 'Each station has a screen showing only its dishes. Set how long each usually takes; orders past it turn red.')}
        actions={<Button small disabled={full || !stations.data} onClick={() => setEditing('new')} icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />}>{text('محطة جديدة', 'New station')}</Button>}>
        {stations.isPending && <div className="skeleton-stack"><Skeleton height={60} /><Skeleton height={60} /></div>}
        {stations.isError && <ErrorPanel error={stations.error} onRetry={() => void stations.refetch()} />}
        {list.length > 0 && <ul className="session-list" data-testid="station-list">
          {list.map(station => {
            const StationIcon = STATION_ICONS[station.kind];
            return <li key={station.id} className="session-row" data-testid="station-row">
              <span className="session-icon" aria-hidden="true"><StationIcon size={22} /></span>
              <div className="session-info">
                <strong>
                  <bdi>{text(station.nameAr, station.nameEn ?? station.nameAr)}</bdi>{' '}
                  {station.isDefault && <span className="badge badge-guava"><StarIcon size={12} weight="fill" aria-hidden="true" /> {text('الأساسية', 'Default')}</span>}
                  {!station.isActive && <span className="badge badge-muted">{text('موقوفة', 'Off')}</span>}
                </strong>
                <small>{text(...KIND_TEXT[station.kind])} · {text(`حوالي ${station.targetMinutes} دقيقة`, `About ${station.targetMinutes} min`)}</small>
              </div>
              <div className="page-actions">
                <Button small variant="ghost" onClick={() => setEditing(station)}>{text('تعديل', 'Edit')}</Button>
                {!station.isDefault && <>
                  <Button small variant="ghost" loading={update.isPending && update.variables?.station.id === station.id && update.variables.body.isDefault === true}
                    onClick={() => update.mutate({ station, body: { isDefault: true } })}>{text('خليها الأساسية', 'Make default')}</Button>
                  <Button small variant="secondary" onClick={() => update.mutate({ station, body: { isActive: !station.isActive } })}>
                    {station.isActive ? text('وقّفها', 'Turn off') : text('شغّلها', 'Turn on')}
                  </Button>
                  <Button small variant="danger-outline" onClick={() => setRemoving(station)}>{text('امسح', 'Delete')}</Button>
                </>}
              </div>
            </li>;
          })}
        </ul>}
        <p className="field-hint">
          {text('الأصناف اللي ملهاش محطة بتروح للمحطة الأساسية. ', 'Dishes with no station go to the default one. ')}
          {can('menu.manage') && <Link className="link-action" to="/menu">{text('وزّع الأصناف على المحطات من المنيو', 'Assign dishes to stations from the menu')}</Link>}
        </p>
      </Section>

      <Section id="ready-rule-title" title={text('إمتى الطلب يبقى جاهز؟', 'When is an order ready?')}
        description={text('الزبون بيوصله إشعار «جاهز» لما الطلب يبقى جاهز.', 'The diner is notified when the order turns ready.')}>
        {stations.data && <fieldset className="field">
          <legend className="visually-hidden">{text('إمتى الطلب يبقى جاهز؟', 'When is an order ready?')}</legend>
          <div className="order-types role-options">
            {([
              ['ALL_ITEMS', text('لما كل الأصناف تجهز', 'When every dish is ready'), text('آخر محطة تخلّص صنفها، الطلب بيبقى جاهز لوحده.', 'Once the last station finishes its dishes, the order turns ready by itself.')],
              ['MANUAL', text('لما حد يعلّمه جاهز', 'When someone marks it ready'), text('مناسب لو في حد على الباص بيراجع الطلب قبل ما يطلع.', 'For a pass where someone checks the order before it goes out.')],
            ] as const).map(([value, label, hint]) => <label key={value} className={`order-type ${stations.data.readyRule === value ? 'is-checked' : ''}`}>
              <input type="radio" name="ready-rule" value={value} checked={stations.data.readyRule === value} disabled={rule.isPending} onChange={() => rule.mutate(value)} />
              <span><strong>{label}</strong><small>{hint}</small></span>
            </label>)}
          </div>
        </fieldset>}
      </Section>

      {can('analytics.view') && <KitchenInsights />}
    </div>
    <aside className="settings-aside" aria-labelledby="kds-how-title">
      <h2 id="kds-how-title">{text('إزاي الشاشة بتشتغل', 'How the display works')}</h2>
      <p className="field-hint">{text(
        'حساب المطبخ بيفتح شاشة المطبخ على طول. كل تابلت يختار محطته من فوق، ويقدر يشوف «الكل» لو هو الباص. الطباخ بيلمس الصنف يبدأه، ويلمسه تاني يبقى جاهز، أو يضغط الزرار الكبير يحرّك كل أصناف الطلب. كل خطوة بتتسجل باسم اللي عملها ووقتها.',
        'Kitchen accounts open straight to the display. Each tablet picks its station at the top, or “All” for the pass. Cooks tap a dish to start it and again when it is ready, or bump the whole ticket with the big button. Every step is recorded with who did it and when.')}</p>
    </aside>
    <StationDialog station={editing} onClose={() => setEditing(null)} />
    <ConfirmDialog open={removing !== null} busy={remove.isPending} onCancel={() => setRemoving(null)} onConfirm={() => removing && remove.mutate(removing)}
      title={text('تمسح المحطة دي؟', 'Delete this station?')} confirmLabel={text('امسح', 'Delete')}
      description={text('أصنافها هتروح للمحطة الأساسية. الطلبات القديمة بتفضل زي ما هي.', 'Its dishes will go to the default station. Past orders stay as they were.')} />
  </div>;
}

function StationDialog({ station, onClose }: { station: KitchenStation | 'new' | null; onClose: () => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [kind, setKind] = useState<KitchenStationKind>('OTHER');
  const [minutes, setMinutes] = useState('15');
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!station) return;
    setError(null);
    setNameAr(station === 'new' ? '' : station.nameAr);
    setNameEn(station === 'new' ? '' : station.nameEn ?? '');
    setKind(station === 'new' ? 'OTHER' : station.kind);
    setMinutes(String(station === 'new' ? 15 : station.targetMinutes));
  }, [station]);
  const save = useMutation({
    mutationFn: async () => {
      const body = { nameAr: nameAr.trim(), nameEn: nameEn.trim() || null, kind, targetMinutes: Number(minutes) };
      if (station === 'new') await kitchenStationsApi.create(body);
      else if (station) await kitchenStationsApi.update(station.id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.kitchenStations });
      toast.success(text('اتحفظت المحطة', 'Station saved'));
      onClose();
    },
    onError: setError,
  });
  const valid = nameAr.trim().length > 0 && Number(minutes) >= KITCHEN_STATION_LIMITS.targetMinutes.min && Number(minutes) <= KITCHEN_STATION_LIMITS.targetMinutes.max;
  return <Dialog open={station !== null} onClose={onClose} busy={save.isPending} size="small" onSubmit={() => { if (valid) save.mutate(); }}
    title={station === 'new' ? text('محطة جديدة', 'New station') : text('تعديل المحطة', 'Edit station')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={save.isPending} disabled={!valid}>{text('احفظ', 'Save')}</Button>
    </>}>
    <div className="form">
      {error !== null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
      <Field label={text('الاسم بالعربي', 'Arabic name')} required>
        <input className="input" data-autofocus maxLength={40} value={nameAr} onChange={event => setNameAr(event.target.value)} />
      </Field>
      <Field label={text('الاسم بالإنجليزي', 'English name')}>
        <input className="input ltr-input" dir="ltr" maxLength={40} value={nameEn} onChange={event => setNameEn(event.target.value)} />
      </Field>
      <Field label={text('النوع', 'Kind')} hint={text('بيحدد الأيقونة على الشاشة.', 'Sets the icon on the display.')}>
        <select className="select" value={kind} onChange={event => setKind(event.target.value as KitchenStationKind)}>
          {KITCHEN_STATION_KINDS.map(value => <option key={value} value={value}>{text(...KIND_TEXT[value])}</option>)}
        </select>
      </Field>
      <Field label={text('الوقت المعتاد (بالدقايق)', 'Usual time (minutes)')} hint={text('بعده الطلب بيظهر متأخر.', 'After it, orders show as late.')}>
        <input className="input" type="number" inputMode="numeric" min={KITCHEN_STATION_LIMITS.targetMinutes.min} max={KITCHEN_STATION_LIMITS.targetMinutes.max}
          value={minutes} onChange={event => setMinutes(event.target.value)} />
      </Field>
    </div>
  </Dialog>;
}
