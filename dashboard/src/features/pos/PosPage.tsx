import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChartBarIcon, ClockIcon, WalletIcon, CashRegisterIcon, CheckCircleIcon, CircleNotchIcon, DesktopTowerIcon, LockKeyIcon, PauseCircleIcon, PlugsConnectedIcon, ReceiptIcon, SlidersHorizontalIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import {
  ORDER_PAYMENT_METHODS, POS_MODE_LABELS, POS_STATUS_LABELS, posSettingsSchema,
  type OrderPaymentMethod, type PosMode, type PosOverview, type PosSettings,
} from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { SaveBar } from '../../components/SettingsSections';
import { Skeleton } from '../../components/Skeleton';
import { Stepper } from '../../components/Stepper';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { posApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { formatDate, formatPrice, normalizeDigits } from '../../lib/format';
import { contractIssues } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';
import { CashierLink } from './CashierLink';
import { DevicesPanel } from './DevicesPanel';
import { IntegrationsPanel } from './IntegrationsPanel';
import { ReportsPanel } from './ReportsPanel';
import { Link } from 'react-router';
import './pos.css';

export const posKeys = { overview: ['pos'] as const };

const PAYMENT_LABELS: Record<OrderPaymentMethod, [string, string]> = { CASH: ['كاش', 'Cash'], CARD: ['كارت (ماكينة المطعم)', 'Card (your terminal)'], WALLET: ['محفظة إلكترونية', 'Mobile wallet'], OTHER: ['طريقة تانية', 'Other'] };
const MODE_INFO: Record<PosMode, { icon: Icon; help: [string, string] }> = {
  BILHANAH: { icon: CashRegisterIcon, help: ['كاشير بالهنا: الطلبات والدفع والورديات من نفس المنيو والطاولات، على أي جهاز عندك.', 'Bilhanah POS: orders, payments and shifts from the same menu and tables, on any device you have.'] },
  EXTERNAL: { icon: PlugsConnectedIcon, help: ['عندك سيستم كاشير؟ اربطه ببالهنا عشان المنيو والطلبات تتزامن.', 'Already have a POS? Connect it so the menu and orders stay in sync.'] },
  BOTH: { icon: DesktopTowerIcon, help: ['كاشير بالهنا في فروع أو أجهزة، وسيستمك التاني متربط.', 'Bilhanah POS on some devices, with your other system connected.'] },
};

/**
 * The POS (docs/POS.md): why it is not available, the activation wizard (mode, then settings), and
 * once active, its summary and settings. Only pos.settings can change anything.
 */
export function PosPage() {
  const { text } = useLanguage();
  usePageTitle('الكاشير', 'Point of sale');
  const pos = useQuery({ queryKey: posKeys.overview, queryFn: posApi.get });
  return <div className="page pos-page">
    <PageHeader title={text('الكاشير (POS)', 'Point of sale')}
      description={text('اشتغل بكاشير بالهنا على أجهزة مطعمك، أو اربط سيستم الكاشير اللي عندك. كل الطلبات بتوصل لنفس لوحة الطلبات والمطبخ.', 'Run Bilhanah’s POS on your restaurant’s devices, or connect the POS you already use. Every order reaches the same order board and kitchen.')} />
    {pos.isError && <ErrorPanel error={pos.error} onRetry={() => void pos.refetch()} />}
    {pos.isPending && <Skeleton height={320} radius={20} />}
    {pos.data && <PosContent pos={pos.data} />}
  </div>;
}

function PosContent({ pos }: { pos: PosOverview }) {
  const { text } = useLanguage();
  const { can } = useWorkspace();
  const manage = can('pos.settings');
  if (pos.status === 'DISABLED' || pos.status === 'SUSPENDED') {
    const reason = pos.status === 'SUSPENDED' ? text('الكاشير موقوف مؤقتًا لمطعمك.', 'The POS is suspended for your restaurant.')
      : pos.disabledReason === 'PLAN' ? text('الكاشير مش ضمن باقتك الحالية.', 'The POS is not part of your current plan.')
        : pos.disabledReason === 'ADMIN' ? text('الكاشير مقفول لمطعمك.', 'The POS is turned off for your restaurant.')
          : text('الكاشير لسه مش متاح على بالهنا.', 'The POS is not available on Bilhanah yet.');
    return <section className="card pos-state" data-testid="pos-unavailable">
      <span className="pos-state-icon" aria-hidden="true">{pos.status === 'SUSPENDED' ? <PauseCircleIcon size={30} /> : <LockKeyIcon size={30} />}</span>
      <h2>{reason}</h2>
      {pos.accessReason && <p className="pos-muted">{pos.accessReason}</p>}
      <p className="pos-muted">{text('لو محتاجه، كلم دعم بالهنا وهنفعّله لك.', 'If you need it, contact Bilhanah support and we will turn it on.')}</p>
    </section>;
  }
  if (!manage && pos.status !== 'ACTIVE') {
    return <section className="card pos-state"><span className="pos-state-icon" aria-hidden="true"><CircleNotchIcon size={30} /></span>
      <h2>{text('الكاشير لسه مش متجهز', 'The POS is not set up yet')}</h2><p className="pos-muted">{text('صاحب المطعم هيفعّله من هنا.', 'The owner sets it up here.')}</p></section>;
  }
  if (pos.status === 'NOT_ACTIVATED' || pos.status === 'PENDING_SETUP') return <Wizard pos={pos} />;
  return <Active pos={pos} manage={manage} />;
}

function Wizard({ pos }: { pos: PosOverview }) {
  const { text } = useLanguage();
  const step = pos.status === 'NOT_ACTIVATED' ? 0 : 1;
  return <div className="pos-wizard">
    <Stepper steps={[text('نوع الكاشير', 'POS mode'), text('الإعدادات', 'Settings'), text('جاهز', 'Ready')]} current={step} />
    {step === 0 ? <ModeStep pos={pos} /> : <section className="card pos-card">
      <header className="pos-card-head"><h2>{text('إعدادات الكاشير', 'POS settings')}</h2>
        <p className="pos-muted">{text('الضرايب والخدمة وطرق الدفع والإيصال. تقدر تغيّرها بعدين في أي وقت.', 'Tax, service, payment methods and the receipt. You can change them any time.')}</p></header>
      <SettingsForm pos={pos} wizard />
    </section>}
  </div>;
}

function ModeStep({ pos, onDone }: { pos: PosOverview; onDone?: () => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<PosMode>(pos.mode ?? (pos.allowedModes.includes('BILHANAH') ? 'BILHANAH' : pos.allowedModes[0]!));
  const allowed = (value: PosMode) => value === 'BOTH' ? pos.allowedModes.includes('BOTH') || (pos.allowedModes.includes('BILHANAH') && pos.allowedModes.includes('EXTERNAL')) : pos.allowedModes.includes(value) || pos.allowedModes.includes('BOTH');
  const activate = useMutation({
    mutationFn: () => posApi.activate(mode),
    onSuccess: next => { queryClient.setQueryData(posKeys.overview, next); onDone?.(); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  return <section className="card pos-card" aria-labelledby="pos-mode-title">
    <header className="pos-card-head"><h2 id="pos-mode-title">{text('هتشتغل إزاي؟', 'How will you work?')}</h2></header>
    <div className="pos-modes" role="radiogroup" aria-labelledby="pos-mode-title">
      {(['BILHANAH', 'EXTERNAL', 'BOTH'] as const).map(value => {
        const info = MODE_INFO[value];
        const disabled = !allowed(value);
        return <label key={value} className={`pos-mode ${mode === value ? 'is-checked' : ''} ${disabled ? 'is-disabled' : ''}`} data-testid={`pos-mode-${value}`}>
          <input type="radio" name="pos-mode" checked={mode === value} disabled={disabled} onChange={() => setMode(value)} />
          <span className="pos-mode-icon" aria-hidden="true"><info.icon size={26} weight="duotone" /></span>
          <strong>{text(...POS_MODE_LABELS[value])}</strong>
          <small>{disabled ? text('مش متاح لمطعمك.', 'Not available for your restaurant.') : text(...info.help)}</small>
        </label>;
      })}
    </div>
    {mode !== 'BILHANAH' && <p className="pos-note">{text('ربط السيستمات الخارجية بيتجهز لكل سيستم لوحده بعد ما نوصل لبياناته. هنبلغك أول ما سيستمك يبقى متاح.', 'External connections are added one system at a time once its API access is available. We will let you know when yours is.')}</p>}
    <div className="pos-actions"><Button loading={activate.isPending} onClick={() => activate.mutate()} data-testid="pos-activate">{pos.activatedAt ? text('احفظ', 'Save') : text('كمّل', 'Continue')}</Button></div>
  </section>;
}

type Draft = { tax: string; taxInclusive: boolean; service: string; serviceDineInOnly: boolean; methods: OrderPaymentMethod[]; maxDiscount: string; requireOpenShift: boolean; header: string; footer: string; showLogo: boolean };
const toDraft = (settings: PosSettings): Draft => ({
  tax: String(settings.taxRateBps / 100), taxInclusive: settings.taxInclusive, service: String(settings.serviceChargeBps / 100), serviceDineInOnly: settings.serviceChargeDineInOnly,
  methods: settings.paymentMethods, maxDiscount: String(settings.cashierMaxDiscountPercent), requireOpenShift: settings.requireOpenShift,
  header: settings.receiptHeader ?? '', footer: settings.receiptFooter ?? '', showLogo: settings.receiptShowLogo,
});
const percentToBps = (value: string) => { const number = Number(normalizeDigits(value.trim()) || '0'); return Number.isFinite(number) ? Math.round(number * 100) : -1; };
const bodyOf = (draft: Draft): PosSettings => ({
  taxRateBps: percentToBps(draft.tax), taxInclusive: draft.taxInclusive, serviceChargeBps: percentToBps(draft.service), serviceChargeDineInOnly: draft.serviceDineInOnly,
  paymentMethods: ORDER_PAYMENT_METHODS.filter(method => draft.methods.includes(method)), cashierMaxDiscountPercent: Math.round(Number(normalizeDigits(draft.maxDiscount.trim()) || '0')),
  requireOpenShift: draft.requireOpenShift, receiptHeader: draft.header.trim() || null, receiptFooter: draft.footer.trim() || null, receiptShowLogo: draft.showLogo,
});

function SettingsForm({ pos, wizard = false }: { pos: PosOverview; wizard?: boolean }) {
  const { text, language } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => toDraft(pos.settings));
  useEffect(() => setDraft(toDraft(pos.settings)), [pos.settings]);
  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const body = bodyOf(draft);
  const issues = contractIssues(posSettingsSchema, body);
  const issue = (path: string) => (issues.some(entry => entry.path === path) ? { message: text('راجع القيمة دي', 'Check this value') } : undefined);
  const baseline = useMemo(() => JSON.stringify(bodyOf(toDraft(pos.settings))), [pos.settings]);
  const dirty = JSON.stringify(body) !== baseline;
  const save = useMutation({
    mutationFn: () => posApi.saveSettings(body),
    onSuccess: next => { queryClient.setQueryData(posKeys.overview, next); toast.success(wizard ? text('الكاشير جاهز!', 'Your POS is ready!') : text('اتحفظت الإعدادات', 'Settings saved')); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const toggleMethod = (method: OrderPaymentMethod) => set('methods')(draft.methods.includes(method) ? draft.methods.filter(entry => entry !== method) : [...draft.methods, method]);
  return <form className="pos-settings" noValidate onSubmit={event => { event.preventDefault(); if (!issues.length && (dirty || wizard)) save.mutate(); }} data-testid="pos-settings">
    <fieldset className="pos-group"><legend>{text('الضرايب والخدمة', 'Tax and service')}</legend>
      <div className="pos-grid">
        <Field label={text('الضريبة ٪', 'Tax %')} error={issue('taxRateBps')}><input className="input ltr" inputMode="decimal" value={draft.tax} onChange={event => set('tax')(event.target.value)} data-testid="pos-tax" /></Field>
        <Field label={text('الخدمة ٪', 'Service charge %')} error={issue('serviceChargeBps')}><input className="input ltr" inputMode="decimal" value={draft.service} onChange={event => set('service')(event.target.value)} /></Field>
      </div>
      <Switch checked={draft.taxInclusive} onChange={set('taxInclusive')} label={text('أسعار المنيو شاملة الضريبة', 'Menu prices include tax')} description={text('مفتوح: الضريبة بتظهر في الإيصال من غير ما تزوّد السعر. مقفول: بتتضاف على الحساب.', 'On: tax is shown on the receipt without raising prices. Off: it is added to the bill.')} />
      <Switch checked={draft.serviceDineInOnly} onChange={set('serviceDineInOnly')} label={text('الخدمة على طلبات الصالة بس', 'Service charge on dine-in only')} />
    </fieldset>
    <fieldset className="pos-group"><legend>{text('طرق الدفع', 'Payment methods')}</legend>
      <div className="filter-chips">{ORDER_PAYMENT_METHODS.map(method => <button key={method} type="button" className={`filter-chip ${draft.methods.includes(method) ? 'active' : ''}`} aria-pressed={draft.methods.includes(method)} onClick={() => toggleMethod(method)}>{text(...PAYMENT_LABELS[method])}</button>)}</div>
      {issue('paymentMethods') && <p className="field-error">{text('اختار طريقة واحدة على الأقل.', 'Choose at least one.')}</p>}
      <p className="field-hint">{text('الكارت بيتسجل على ماكينة المطعم نفسها؛ بالهنا مش بتشيل بيانات الكروت.', 'Cards are taken on your own terminal; Bilhanah never handles card details.')}</p>
    </fieldset>
    <fieldset className="pos-group"><legend>{text('الكاشير', 'Cashiers')}</legend>
      <Field label={text('أقصى خصم للكاشير ٪', 'Largest cashier discount %')} error={issue('cashierMaxDiscountPercent')} hint={text('أكبر من كده محتاج صلاحية «خصومات أكبر» (المدير).', 'More than this needs the “larger discounts” permission (managers).')}>
        <input className="input ltr" inputMode="numeric" value={draft.maxDiscount} onChange={event => set('maxDiscount')(event.target.value)} />
      </Field>
      <Switch checked={draft.requireOpenShift} onChange={set('requireOpenShift')} label={text('الكاش محتاج وردية مفتوحة', 'Cash needs an open shift')} description={text('الكاشير يفتح وردية الخزنة الأول قبل ما ياخد كاش، عشان الحساب آخر اليوم يطلع مظبوط.', 'Cashiers open a cash shift before taking cash, so the drawer balances at closing.')} />
    </fieldset>
    <fieldset className="pos-group"><legend>{text('الإيصال', 'Receipt')}</legend>
      <Switch checked={draft.showLogo} onChange={set('showLogo')} label={text('اطبع اللوجو', 'Print the logo')} />
      <Field label={text('سطر فوق', 'Header line')} optional><input className="input" maxLength={200} value={draft.header} onChange={event => set('header')(event.target.value)} /></Field>
      <Field label={text('سطر تحت', 'Footer line')} optional hint={text('مثلًا: شكرًا لزيارتك! الرقم الضريبي ...', 'e.g. Thank you for visiting! Tax ID ...')}><input className="input" maxLength={300} value={draft.footer} onChange={event => set('footer')(event.target.value)} /></Field>
    </fieldset>
    {wizard
      ? <div className="pos-actions"><Button type="submit" loading={save.isPending} disabled={issues.length > 0} data-testid="pos-finish">{text('فعّل الكاشير', 'Activate POS')}</Button></div>
      : <SaveBar visible={dirty} saving={save.isPending} canSave={issues.length === 0} onUndo={() => setDraft(toDraft(pos.settings))}
        problem={issues.length ? text('في قيمة محتاجة تتراجع.', 'A value needs your attention.') : null}
        lastSaved={pos.updatedAt ? formatDate(pos.updatedAt, language, { dateStyle: 'medium', timeStyle: 'short' }) : null} saveTestId="pos-save" />}
  </form>;
}

function Active({ pos, manage }: { pos: PosOverview; manage: boolean }) {
  const { text, number, language } = useLanguage();
  const { can, to } = useWorkspace();
  const external = pos.mode === 'EXTERNAL' || pos.mode === 'BOTH';
  const terminal = pos.mode !== 'EXTERNAL';
  const reports = can('pos.settings') || can('analytics.financial');
  type Tab = 'reports' | 'devices' | 'integrations' | 'settings' | 'mode';
  const tabs = ([
    ['reports', 'التقارير', 'Reports', ChartBarIcon, reports],
    ['devices', 'الأجهزة', 'Devices', DesktopTowerIcon, manage && terminal],
    ['integrations', 'الربط', 'Integrations', PlugsConnectedIcon, manage && external],
    ['settings', 'الإعدادات', 'Settings', SlidersHorizontalIcon, manage],
    ['mode', 'نوع الكاشير', 'Mode', CashRegisterIcon, manage],
  ] as [Tab, string, string, Icon, boolean][]).filter(entry => entry[4]);
  const [tab, setTab] = useState<Tab>(tabs[0]?.[0] ?? 'reports');
  const percent = (bps: number) => number(bps / 10_000, { style: 'percent', maximumFractionDigits: 2 });
  const list = (items: string[]) => new Intl.ListFormat(language === 'ar' ? 'ar' : 'en', { style: 'short', type: 'conjunction' }).format(items);
  const setup: { icon: Icon; label: string; value: string }[] = [
    { icon: CashRegisterIcon, label: text('النوع', 'Mode'), value: pos.mode ? text(...POS_MODE_LABELS[pos.mode]) : '—' },
    { icon: ReceiptIcon, label: text('الضريبة', 'Tax'), value: pos.settings.taxRateBps ? `${percent(pos.settings.taxRateBps)} · ${pos.settings.taxInclusive ? text('شاملة في السعر', 'included in prices') : text('مضافة على الحساب', 'added to the bill')}` : text('من غير ضريبة', 'No tax') },
    { icon: SlidersHorizontalIcon, label: text('الخدمة', 'Service'), value: pos.settings.serviceChargeBps ? `${percent(pos.settings.serviceChargeBps)}${pos.settings.serviceChargeDineInOnly ? text(' · صالة بس', ' · dine-in only') : ''}` : text('من غير خدمة', 'No service charge') },
    { icon: CheckCircleIcon, label: text('طرق الدفع', 'Payments'), value: list(pos.settings.paymentMethods.map(method => text(...SHORT_PAYMENT[method]))) },
  ];
  return <>
    <section className="card pos-head" data-testid="pos-active">
      <div className="pos-head-main">
        <span className="pos-head-icon" aria-hidden="true"><CashRegisterIcon size={26} weight="duotone" /></span>
        <div className="pos-head-text">
          <h2>{text('الكاشير شغال', 'Your POS is active')} <span className="pos-pill is-active"><span className="pos-dot" aria-hidden="true" />{text(...POS_STATUS_LABELS[pos.status])}</span></h2>
          <p className="pos-muted">{pos.activatedAt && text(`اتفعّل ${formatDate(pos.activatedAt, language, { dateStyle: 'medium' })}`, `Activated ${formatDate(pos.activatedAt, language, { dateStyle: 'medium' })}`)} · {text('الطلبات بتوصل لنفس لوحة الطلبات والمطبخ.', 'Orders reach the same board and kitchen.')}</p>
        </div>
        <div className="pos-head-actions">
          {can('cash.operate') && <Link className="button button-secondary" to={to('/cash')}><WalletIcon size={18} aria-hidden="true" />{text('الوردية والخزنة', 'Shift & cash')}</Link>}
          {terminal && can('pos.use') && <Link className="button button-primary pos-cta" to={to('/pos/terminal')} data-testid="pos-open-terminal"><CashRegisterIcon size={18} aria-hidden="true" />{text('افتح شاشة الكاشير', 'Open POS terminal')}</Link>}
        </div>
      </div>
      <dl className="pos-setup">
        {setup.map(entry => <div key={entry.label}><dt><entry.icon size={15} aria-hidden="true" />{entry.label}</dt><dd>{entry.value}</dd></div>)}
        {manage && <button type="button" className="pos-setup-edit" onClick={() => setTab('settings')}>{text('عدّل', 'Edit')}</button>}
      </dl>
    </section>
    {manage && terminal && <CashierLink />}
    {reports && <Today />}
    {tabs.length > 0 && <>
      <div className="pos-segment" role="tablist" aria-label={text('أقسام الكاشير', 'POS sections')}>
        {tabs.map(([key, ar, en, TabIcon]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)} data-testid={`pos-tab-${key}`}>
          <TabIcon size={17} aria-hidden="true" />{text(ar, en)}
        </button>)}
      </div>
      {tab === 'reports' && <ReportsPanel />}
      {tab === 'devices' && <DevicesPanel maxDevices={pos.maxDevices} />}
      {tab === 'integrations' && <IntegrationsPanel />}
      {tab === 'settings' && <section className="card pos-card"><SettingsForm pos={pos} /></section>}
      {tab === 'mode' && <ModeStep pos={pos} onDone={() => setTab(tabs[0]![0])} />}
    </>}
  </>;
}

const SHORT_PAYMENT: Record<OrderPaymentMethod, [string, string]> = { CASH: ['كاش', 'Cash'], CARD: ['كارت', 'Card'], WALLET: ['محفظة', 'Wallet'], OTHER: ['أخرى', 'Other'] };

/** Today at a glance: what the POS took, what was collected, what is still owed. */
function Today() {
  const { text, number, language } = useLanguage();
  const day = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const report = useQuery({ queryKey: ['pos', 'report', 'today', day], queryFn: () => posApi.report({ from: day, to: day }), refetchInterval: 60_000 });
  const money = (piastres: number) => formatPrice(piastres, language);
  const tiles: { icon: Icon; tone: string; label: string; value: string; note: string }[] = report.data ? [
    { icon: ReceiptIcon, tone: 'coral', label: text('طلبات النهارده', 'Orders today'), value: number(report.data.orders), note: text(`متوسط ${money(report.data.averageOrderPiastres)}`, `Average ${money(report.data.averageOrderPiastres)}`) },
    { icon: ChartBarIcon, tone: 'plum', label: text('صافي المبيعات', 'Net sales'), value: money(report.data.netPiastres), note: text(`بعد خصم ${money(report.data.discountPiastres)}`, `After ${money(report.data.discountPiastres)} discounts`) },
    { icon: WalletIcon, tone: 'green', label: text('اتحصّل', 'Collected'), value: money(report.data.collectedPiastres), note: report.data.refundedPiastres ? text(`مسترد ${money(report.data.refundedPiastres)}`, `${money(report.data.refundedPiastres)} refunded`) : text('من غير مرتجعات', 'No refunds') },
    { icon: ClockIcon, tone: 'yellow', label: text('لسه متدفعش', 'Still owed'), value: money(report.data.outstandingPiastres), note: text('على طلبات مفتوحة', 'On open bills') },
  ] : [];
  return <section aria-label={text('النهارده', 'Today')}>
    <div className="pos-today">{report.isPending ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height={110} radius={18} />)
      : tiles.map(tile => <div key={tile.label} className="card pos-tile">
        <span className={`pos-tile-icon tone-${tile.tone}`} aria-hidden="true"><tile.icon size={18} weight="bold" /></span>
        <span className="pos-tile-label">{tile.label}</span>
        <strong className="pos-tile-value">{tile.value}</strong>
        <small>{tile.note}</small>
      </div>)}</div>
  </section>;
}
