import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ArrowUUpLeftIcon, CoinsIcon, CrownIcon, GiftIcon, HourglassMediumIcon, PlusIcon, PowerIcon, TrashIcon } from '@phosphor-icons/react';
import {
  LOYALTY_LIMITS, ORDER_TYPES, loyaltySettingsSchema, pointsFor,
  type LoyaltySettings, type LoyaltySettingsInput, type LoyaltyTier, type OrderType,
} from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Option, SaveBar, SectionHead, SettingsLayout, type SettingsSection } from '../../components/SettingsSections';
import { Skeleton } from '../../components/Skeleton';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { loyaltyApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { egpToPiastres, normalizeDigits, piastresToInput } from '../../lib/format';
import { contractIssues } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { MoneyInput } from '../inventory/controls';
import { loyaltyKeys, useLoyaltyFormat, useLoyaltySettings, useLoyaltyTiers } from './shared';

type SectionKey = 'program' | 'earning' | 'redeeming' | 'expiry' | 'reversals' | 'tiers';
const SECTIONS: SettingsSection<SectionKey>[] = [
  { key: 'program', icon: PowerIcon, label: ['البرنامج', 'Program'], hint: ['تشغيل البرنامج واسمه', 'On or off, and its name'] },
  { key: 'earning', icon: CoinsIcon, label: ['كسب النقاط', 'Earning points'], hint: ['النقاط لكل جنيه وإمتى تتحسب', 'Points per pound and when'] },
  { key: 'redeeming', icon: GiftIcon, label: ['الاستبدال', 'Redeeming'], hint: ['الحد الأدنى وأقصى خصم', 'Minimum and maximum discount'] },
  { key: 'expiry', icon: HourglassMediumIcon, label: ['انتهاء النقاط', 'Expiry'], hint: ['النقاط بتنتهي إمتى', 'When points expire'] },
  { key: 'reversals', icon: ArrowUUpLeftIcon, label: ['الإلغاء والاسترداد', 'Cancellations & refunds'], hint: ['النقاط بترجع إزاي', 'What happens to points'] },
  { key: 'tiers', icon: CrownIcon, label: ['المستويات', 'Tiers'], hint: ['مستويات اختيارية ونقاط أكتر', 'Optional tiers that earn faster'] },
];

const EARN_ON: Record<LoyaltySettings['earnOn'], { label: [string, string]; help: [string, string] }> = {
  COMPLETED: { label: ['لما الطلب يكمل', 'When the order is completed'], help: ['النقاط بتنزل أول ما الطلب يتسلّم أو يتقدّم للزبون.', 'Points are credited as soon as the order is handed over or served.'] },
  PAID: { label: ['لما الطلب يكمل ويتدفع', 'When completed and paid'], help: ['لازم الطلب يكمل والحساب يتعلّم مدفوع. أضمن لو بتقفل الحسابات على السيستم.', 'The order must be completed and its bill marked paid. Safest if you close bills in Bilhanah.'] },
};

const ORDER_TYPE_LABELS: Record<OrderType, [string, string]> = { DINE_IN: ['في المطعم', 'Dine-in'], PICKUP: ['تيك أواي', 'Pickup'] };

type Draft = {
  enabled: boolean; nameAr: string; nameEn: string; pointsPerUnit: string; spendUnit: string; earnOn: LoyaltySettings['earnOn']; orderTypes: OrderType[];
  minOrder: string; minRedeem: string; maxDiscount: string; expires: boolean; expiryDays: string;
  cancelReturnsRedeemed: boolean; refundReversesEarned: boolean; refundReturnsRedeemed: boolean; tiersEnabled: boolean;
};

const toDraft = (settings: LoyaltySettings): Draft => ({
  enabled: settings.enabled, nameAr: settings.nameAr ?? '', nameEn: settings.nameEn ?? '',
  pointsPerUnit: String(settings.pointsPerUnit), spendUnit: piastresToInput(settings.spendUnitPiastres), earnOn: settings.earnOn, orderTypes: settings.orderTypes,
  minOrder: settings.minOrderPiastres ? piastresToInput(settings.minOrderPiastres) : '', minRedeem: String(settings.minRedeemPoints), maxDiscount: String(settings.maxDiscountPercent),
  expires: settings.expiryDays !== null, expiryDays: String(settings.expiryDays ?? 180),
  cancelReturnsRedeemed: settings.cancelReturnsRedeemed, refundReversesEarned: settings.refundReversesEarned, refundReturnsRedeemed: settings.refundReturnsRedeemed, tiersEnabled: settings.tiersEnabled,
});

const whole = (value: string) => {
  const digits = normalizeDigits(value.trim());
  return /^\d+$/.test(digits) ? Number(digits) : -1;
};

const bodyOf = (draft: Draft): LoyaltySettingsInput => ({
  enabled: draft.enabled,
  nameAr: draft.nameAr.trim() || null,
  nameEn: draft.nameEn.trim() || null,
  pointsPerUnit: whole(draft.pointsPerUnit),
  spendUnitPiastres: egpToPiastres(draft.spendUnit) ?? -1,
  earnOn: draft.earnOn,
  orderTypes: ORDER_TYPES.filter(type => draft.orderTypes.includes(type)),
  minOrderPiastres: draft.minOrder.trim() ? (egpToPiastres(draft.minOrder) ?? -1) : 0,
  minRedeemPoints: draft.minRedeem.trim() ? whole(draft.minRedeem) : 0,
  maxDiscountPercent: whole(draft.maxDiscount),
  expiryDays: draft.expires ? whole(draft.expiryDays) : null,
  cancelReturnsRedeemed: draft.cancelReturnsRedeemed,
  refundReversesEarned: draft.refundReversesEarned,
  refundReturnsRedeemed: draft.refundReturnsRedeemed,
  tiersEnabled: draft.tiersEnabled,
});

/** The program's rules, a section at a time: running it, earning, redeeming, expiry, reversals and tiers. */
export function LoyaltySettingsPage() {
  const { text } = useLanguage();
  usePageTitle('إعدادات برنامج الولاء', 'Loyalty settings');
  const settings = useLoyaltySettings();
  const [params, setParams] = useSearchParams();
  const [dirty, setDirty] = useState(false);
  const wanted = params.get('section') as SectionKey | null;
  const section: SectionKey = SECTIONS.some(entry => entry.key === wanted) ? wanted! : 'program';
  const open = (key: SectionKey) => setParams(current => { const next = new URLSearchParams(current); if (key === 'program') next.delete('section'); else next.set('section', key); return next; }, { replace: true });
  return <SettingsLayout sections={SECTIONS} current={section} onOpen={open} unsaved={dirty} label={text('أقسام إعدادات برنامج الولاء', 'Loyalty settings sections')}>
    {settings.isError && <ErrorPanel error={settings.error} onRetry={() => void settings.refetch()} />}
    {settings.isPending && <Skeleton height={320} />}
    {settings.data && <SettingsForm settings={settings.data} section={section} onDirty={setDirty} />}
    {section === 'tiers' && settings.data?.tiersEnabled && <TiersEditor />}
  </SettingsLayout>;
}

function SettingsForm({ settings, section, onDirty }: { settings: LoyaltySettings; section: SectionKey; onDirty: (dirty: boolean) => void }) {
  const { text, number } = useLanguage();
  const format = useLoyaltyFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  useEffect(() => setDraft(toDraft(settings)), [settings]);
  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const body = bodyOf(draft);
  const issues = contractIssues(loyaltySettingsSchema, body);
  const issueAt = (path: string) => (issues.some(issue => issue.path === path) ? { message: text('راجع القيمة دي', 'Check this value') } : undefined);
  const baseline = useMemo(() => JSON.stringify(bodyOf(toDraft(settings))), [settings]);
  const dirty = JSON.stringify(body) !== baseline;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const save = useMutation({
    mutationFn: () => loyaltyApi.saveSettings(body),
    onSuccess: next => {
      queryClient.setQueryData(loyaltyKeys.settings, next);
      void queryClient.invalidateQueries({ queryKey: loyaltyKeys.all });
      toast.success(text('اتحفظت إعدادات برنامج الولاء', 'Loyalty settings saved'));
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const toggleType = (type: OrderType) => set('orderTypes')(draft.orderTypes.includes(type) ? draft.orderTypes.filter(entry => entry !== type) : [...draft.orderTypes, type]);
  // A worked example of the rate: what a typical 250 EGP order earns.
  const example = body.pointsPerUnit > 0 && body.spendUnitPiastres >= 100 ? pointsFor(25_000, { pointsPerUnit: body.pointsPerUnit, spendUnitPiastres: body.spendUnitPiastres, minOrderPiastres: Math.max(0, body.minOrderPiastres) }) : null;
  return <form className="inv-settings ly-settings" noValidate onSubmit={event => { event.preventDefault(); if (!issues.length && dirty) save.mutate(); }} data-testid="ly-settings">
    {section === 'program' && <section className="card inv-set-card" aria-labelledby="ls-program">
      <SectionHead id="ls-program" icon={PowerIcon} title={text('البرنامج', 'Program')} text={text('لما البرنامج يشتغل، الزبون يشوف نقاطه في صفحة الطلب ويقدر يستبدل مكافأة.', 'With the program on, diners see their points at checkout and can redeem a reward.')} />
      <Switch checked={draft.enabled} onChange={set('enabled')} label={text('شغّل برنامج الولاء', 'Run the loyalty program')}
        description={text('مقفول: محدش بيكسب ولا بيستبدل، والنقاط اللي اتجمعت محفوظة. الطلبات اللي اتعملت قبل القفل بتاخد نقاطها عادي.', 'Off: nobody earns or redeems, and points already earned are kept. Orders placed before switching off still get their points.')} />
      <div className="ly-form-grid">
        <Field label={text('اسم البرنامج بالعربي', 'Program name in Arabic')} optional hint={text('بيظهر للزبون، زي «نقاط كشري أبو طارق».', 'Shown to diners, like “Abou Tarek Points”.')}>
          <input className="input" maxLength={40} value={draft.nameAr} onChange={event => set('nameAr')(event.target.value)} data-testid="ls-name" />
        </Field>
        <Field label={text('اسم البرنامج بالإنجليزي', 'Program name in English')} optional>
          <input className="input" dir="ltr" maxLength={40} value={draft.nameEn} onChange={event => set('nameEn')(event.target.value)} />
        </Field>
      </div>
    </section>}

    {section === 'earning' && <section className="card inv-set-card" aria-labelledby="ls-earning">
      <SectionHead id="ls-earning" icon={CoinsIcon} title={text('كسب النقاط', 'Earning points')} text={text('النقاط بتتحسب على الحساب بعد الخصم، ومن أي فرع.', 'Points are worked out on the bill after any discount, at any branch.')} />
      <div className="ly-rate">
        <Field label={text('نقاط', 'Points')} error={issueAt('pointsPerUnit')}>
          <input className="input ltr" inputMode="numeric" value={draft.pointsPerUnit} onChange={event => set('pointsPerUnit')(event.target.value)} data-testid="ls-points-per-unit" />
        </Field>
        <span className="ly-rate-word">{text('لكل', 'for every')}</span>
        <Field label={text('مبلغ', 'Amount')} error={issueAt('spendUnitPiastres')}>
          {props => <MoneyInput value={draft.spendUnit} onChange={set('spendUnit')} label={text('مبلغ', 'Amount')} invalid={props['aria-invalid']} describedBy={props['aria-describedby']} testId="ls-spend-unit" />}
        </Field>
      </div>
      {example !== null && <p className="ly-example">{text(`مثال: طلب بـ ٢٥٠ جنيه = ${number(example)} نقطة`, `Example: a 250 EGP order earns ${example} points`)}</p>}
      <fieldset className="field">
        <legend className="field-label">{text('النقاط بتتحسب إمتى', 'When points are credited')}</legend>
        <div className="inv-options">{(['COMPLETED', 'PAID'] as const).map(value => <Option key={value} name="ls-earn-on" checked={draft.earnOn === value} onChange={() => set('earnOn')(value)}
          title={text(...EARN_ON[value].label)} help={text(...EARN_ON[value].help)} testId={`ls-earn-${value}`} />)}</div>
      </fieldset>
      <fieldset className="field">
        <legend className="field-label">{text('أنواع الطلبات اللي بتكسب وتستبدل', 'Order types that earn and redeem')}</legend>
        <div className="filter-chips">{ORDER_TYPES.map(type => <button key={type} type="button" className={`filter-chip ${draft.orderTypes.includes(type) ? 'active' : ''}`} aria-pressed={draft.orderTypes.includes(type)} onClick={() => toggleType(type)}>{text(...ORDER_TYPE_LABELS[type])}</button>)}</div>
        {issueAt('orderTypes') && <p className="field-error">{text('اختار نوع واحد على الأقل.', 'Choose at least one.')}</p>}
      </fieldset>
      <Field label={text('أقل حساب يكسب نقاط', 'Smallest bill that earns')} optional error={issueAt('minOrderPiastres')} hint={text('فاضي = أي طلب.', 'Empty: any order.')}>
        {props => <MoneyInput value={draft.minOrder} onChange={set('minOrder')} label={text('أقل حساب يكسب نقاط', 'Smallest bill that earns')} invalid={props['aria-invalid']} describedBy={props['aria-describedby']} />}
      </Field>
    </section>}

    {section === 'redeeming' && <section className="card inv-set-card" aria-labelledby="ls-redeeming">
      <SectionHead id="ls-redeeming" icon={GiftIcon} title={text('الاستبدال', 'Redeeming')} text={text('الزبون بيختار مكافأة واحدة وقت الطلب، والسيرفر بيتأكد إن رصيده يكفي.', 'Diners pick one reward at checkout; the server checks their balance covers it.')} />
      <div className="ly-form-grid">
        <Field label={text('أقل رصيد للاستبدال', 'Minimum balance to redeem')} error={issueAt('minRedeemPoints')} hint={text('العضو لازم يجمع الرصيد ده قبل أي استبدال. ٠ = من غير حد.', 'Members need this balance before redeeming anything. 0: no minimum.')}>
          <input className="input ltr" inputMode="numeric" value={draft.minRedeem} onChange={event => set('minRedeem')(event.target.value)} data-testid="ls-min-redeem" />
        </Field>
        <Field label={text('أقصى خصم من الحساب ٪', 'Maximum share of the bill %')} error={issueAt('maxDiscountPercent')} hint={text('مفيش مكافأة تخصم أكتر من النسبة دي من الطلب.', 'No reward takes more than this share of an order.')}>
          <input className="input ltr" inputMode="numeric" value={draft.maxDiscount} onChange={event => set('maxDiscount')(event.target.value)} data-testid="ls-max-discount" />
        </Field>
      </div>
    </section>}

    {section === 'expiry' && <section className="card inv-set-card" aria-labelledby="ls-expiry">
      <SectionHead id="ls-expiry" icon={HourglassMediumIcon} title={text('انتهاء النقاط', 'Expiry')} text={text('النقاط بتنتهي لو العضو مطلبش ولا استبدل حاجة المدة دي كلها. أي طلب جديد بيجدد المدة.', 'Points expire when a member neither earns nor redeems for this long. Any new order restarts the clock.')} />
      <Switch checked={draft.expires} onChange={set('expires')} label={text('النقاط بتنتهي', 'Points expire')} description={text('مقفول: النقاط مبتنتهيش أبدًا.', 'Off: points never expire.')} />
      {draft.expires && <Field label={text('بعد كام يوم من غير نشاط', 'Days without activity')} error={issueAt('expiryDays')} hint={text('من ٧ أيام لـ ١٠ سنين.', 'From 7 days to 10 years.')}>
        <input className="input ltr" inputMode="numeric" value={draft.expiryDays} onChange={event => set('expiryDays')(event.target.value)} data-testid="ls-expiry-days" />
      </Field>}
    </section>}

    {section === 'reversals' && <section className="card inv-set-card" aria-labelledby="ls-reversals">
      <SectionHead id="ls-reversals" icon={ArrowUUpLeftIcon} title={text('الإلغاء والاسترداد', 'Cancellations & refunds')} text={text('كل تغيير بيتسجل في سجل العضو بالسبب ورقم الطلب.', 'Every change is recorded on the member’s history with the reason and order.')} />
      <Switch checked={draft.cancelReturnsRedeemed} onChange={set('cancelReturnsRedeemed')} label={text('رجّع نقاط المكافأة لو الطلب اتلغى أو اترفض', 'Return reward points when an order is cancelled or rejected')}
        description={text('الطلب الملغي مبيكسبش نقاط أصلًا؛ ده عن النقاط اللي اتصرفت على مكافأة فيه.', 'A cancelled order never earns; this is about points spent on a reward in it.')} />
      <Switch checked={draft.refundReversesEarned} onChange={set('refundReversesEarned')} label={text('اسحب النقاط اللي اتكسبت لو الحساب اترجع', 'Take back earned points when a bill is refunded')}
        description={text('لما حد يرجّع الحساب «مش مدفوع». لو الحساب اتدفع تاني، النقاط بترجع.', 'When a paid bill is marked unpaid. If it is paid again, the points come back.')} />
      <Switch checked={draft.refundReturnsRedeemed} onChange={set('refundReturnsRedeemed')} label={text('رجّع نقاط المكافأة لو الحساب اترجع', 'Return reward points when a bill is refunded')} />
    </section>}

    {section === 'tiers' && <section className="card inv-set-card" aria-labelledby="ls-tiers">
      <SectionHead id="ls-tiers" icon={CrownIcon} title={text('المستويات', 'Tiers')} text={text('اختياري: العضو بيطلع مستوى كل ما يجمع نقاط أكتر، وكل مستوى بيكسب أسرع.', 'Optional: members move up as they earn, and each tier earns faster.')} />
      <Switch checked={draft.tiersEnabled} onChange={set('tiersEnabled')} label={text('شغّل المستويات', 'Use tiers')} description={text('احفظ بعد التشغيل عشان تظبط المستويات تحت.', 'Save after switching on to set the tiers below.')} />
      {settings.tiersEnabled && !draft.tiersEnabled && <Alert kind="info">{text('المستويات هتتقفل بعد الحفظ، وكل الأعضاء هيكسبوا بالمعدل العادي.', 'Tiers stop after saving, and everyone earns at the normal rate.')}</Alert>}
    </section>}

    <SaveBar visible={dirty} saving={save.isPending} canSave={issues.length === 0} onUndo={() => setDraft(toDraft(settings))}
      problem={issues.length > 0 ? text('في قيمة محتاجة تتراجع.', 'A value needs your attention.') : null}
      lastSaved={settings.updatedAt ? format.dateTime(settings.updatedAt) : null} undoTestId="ls-undo" saveTestId="ls-save" />
  </form>;
}

type TierDraft = { key: string; id?: string; nameAr: string; nameEn: string; minLifetimePoints: string; earnMultiplier: string };
const tierDraft = (tier: LoyaltyTier): TierDraft => ({ key: tier.id, id: tier.id, nameAr: tier.nameAr, nameEn: tier.nameEn ?? '', minLifetimePoints: String(tier.minLifetimePoints), earnMultiplier: String(tier.earnMultiplier / 100) });

/** The tier list, saved as a whole: name, the lifetime points that reach it, and how much faster it earns. */
function TiersEditor() {
  const { text, number } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const tiers = useLoyaltyTiers();
  const [rows, setRows] = useState<TierDraft[]>([]);
  useEffect(() => { if (tiers.data) setRows(tiers.data.map(tierDraft)); }, [tiers.data]);
  const parsed = rows.map(row => ({
    ...(row.id && { id: row.id }), nameAr: row.nameAr.trim(), nameEn: row.nameEn.trim() || null,
    minLifetimePoints: whole(row.minLifetimePoints), earnMultiplier: Math.round(Number(normalizeDigits(row.earnMultiplier.trim()) || 'x') * 100),
  }));
  const invalid = parsed.some(row => !row.nameAr || row.minLifetimePoints < 0 || !(row.earnMultiplier >= 100 && row.earnMultiplier <= 500))
    || new Set(parsed.map(row => row.minLifetimePoints)).size !== parsed.length;
  const dirty = JSON.stringify(rows) !== JSON.stringify((tiers.data ?? []).map(tierDraft));
  const save = useMutation({
    mutationFn: () => loyaltyApi.saveTiers({ tiers: parsed }),
    onSuccess: next => { queryClient.setQueryData(loyaltyKeys.tiers, next); toast.success(text('اتحفظت المستويات', 'Tiers saved')); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const update = (key: string, change: Partial<TierDraft>) => setRows(current => current.map(row => (row.key === key ? { ...row, ...change } : row)));
  return <section className="card inv-set-card ly-tiers" aria-labelledby="ls-tier-list" data-testid="ls-tiers">
    <SectionHead id="ls-tier-list" icon={CrownIcon} title={text('قائمة المستويات', 'Tier list')} text={text('ابدأ بمستوى من ٠ نقطة للكل، وزوّد مستويات أعلى. «١٫٥×» يعني نقاط ونص لكل جنيه.', 'Start with a tier at 0 points for everyone, then add higher ones. “1.5×” means half as many points again.')} />
    {tiers.isPending && <Skeleton height={120} />}
    {tiers.isError && <ErrorPanel error={tiers.error} onRetry={() => void tiers.refetch()} />}
    {rows.length > 0 && <ol className="ly-tier-rows">{rows.map((row, index) => <li key={row.key} className="ly-tier-row">
      <span className="ly-tier-index" aria-hidden="true">{number(index + 1)}</span>
      <Field label={text('الاسم', 'Name')}><input className="input" maxLength={30} value={row.nameAr} onChange={event => update(row.key, { nameAr: event.target.value })} data-testid="ls-tier-name" /></Field>
      <Field label={text('من نقاط', 'From points')}><input className="input ltr" inputMode="numeric" value={row.minLifetimePoints} onChange={event => update(row.key, { minLifetimePoints: event.target.value })} data-testid="ls-tier-min" /></Field>
      <Field label={text('مضاعف النقاط ×', 'Multiplier ×')}><input className="input ltr" inputMode="decimal" value={row.earnMultiplier} onChange={event => update(row.key, { earnMultiplier: event.target.value })} data-testid="ls-tier-multiplier" /></Field>
      <button type="button" className="icon-button" onClick={() => setRows(current => current.filter(entry => entry.key !== row.key))} aria-label={text('امسح المستوى', 'Remove tier')}><TrashIcon size={18} aria-hidden="true" /></button>
    </li>)}</ol>}
    {invalid && rows.length > 0 && <p className="field-error">{text('كل مستوى محتاج اسم، ونقاط مختلفة، ومضاعف من ١ لـ ٥.', 'Each tier needs a name, its own points, and a multiplier from 1 to 5.')}</p>}
    <div className="ly-tier-actions">
      <Button variant="secondary" small icon={<PlusIcon size={16} aria-hidden="true" />} disabled={rows.length >= LOYALTY_LIMITS.tiers}
        onClick={() => setRows(current => [...current, { key: `new-${Date.now()}`, nameAr: '', nameEn: '', minLifetimePoints: current.length ? String(Math.max(...current.map(row => whole(row.minLifetimePoints))) + 500) : '0', earnMultiplier: current.length ? '1.5' : '1' }])}
        data-testid="ls-tier-add">{text('أضف مستوى', 'Add tier')}</Button>
      <Button small loading={save.isPending} disabled={!dirty || invalid} onClick={() => save.mutate()} data-testid="ls-tiers-save">{text('احفظ المستويات', 'Save tiers')}</Button>
    </div>
  </section>;
}
