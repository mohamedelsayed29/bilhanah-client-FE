import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowClockwiseIcon, PauseIcon, PlayIcon, PlugIcon, PlugsConnectedIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import type { PosIntegration, PosIntegrationSecrets, PosWebhookConfig } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CopyButton } from '../../components/CopyButton';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { Stepper } from '../../components/Stepper';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { posApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { formatRelative } from '../../lib/format';
import { useLanguage } from '../../lib/language';
import { useBranchList } from '../branches/workspace';
import { useMenuQuery } from '../restaurant/queries';

const keys = { list: ['pos', 'integrations'] as const };
const STATUS: Record<PosIntegration['status'], [string, string, string]> = { ACTIVE: ['شغال', 'Active', 'is-active'], PAUSED: ['متوقف مؤقتًا', 'Paused', 'is-pending'], DISCONNECTED: ['مفصول', 'Disconnected', 'is-off'] };

/** External POS systems: connect one (a wizard), watch its sync, retry failures, map menu items, pause or disconnect. */
export function IntegrationsPanel() {
  const { text } = useLanguage();
  const integrations = useQuery({ queryKey: keys.list, queryFn: posApi.integrations, refetchInterval: 30_000 });
  const [connecting, setConnecting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  return <section className="card pos-card" aria-labelledby="pos-integrations">
    <header className="pos-card-head pos-row"><div><h2 id="pos-integrations">{text('ربط سيستم الكاشير', 'POS integrations')}</h2>
      <p className="pos-muted">{text('بالهنا بتبعت الطلبات لسيستمك، وسيستمك يبعت حالة الطلب والدفع. أي سيستم بيدعم webhooks يقدر يتربط دلوقتي؛ السيستمات التانية بتتضاف لما نوصل للـ API بتاعها.', 'Bilhanah sends orders to your system; it sends order statuses and payments back. Any POS with webhooks can connect now; others are added once their API is available.')}</p></div>
      <Button icon={<PlusIcon size={16} aria-hidden="true" />} onClick={() => setConnecting(true)} data-testid="pos-integration-add">{text('اربط سيستم', 'Connect a POS')}</Button></header>
    {integrations.isError && <ErrorPanel error={integrations.error} onRetry={() => void integrations.refetch()} />}
    {integrations.isPending && <Skeleton height={120} />}
    {integrations.data && (integrations.data.length === 0 ? <p className="pos-muted">{text('لسه مفيش سيستم متربط.', 'No POS connected yet.')}</p>
      : <ul className="pos-list">{integrations.data.map(integration => <li key={integration.id} className={integration.status === 'DISCONNECTED' ? 'is-off' : ''} data-testid="pos-integration">
        <span className="pos-list-icon" aria-hidden="true"><PlugsConnectedIcon size={20} /></span>
        <span className="pos-list-main"><strong>{integration.name} <span className={`pos-pill ${STATUS[integration.status][2]}`}>{text(STATUS[integration.status][0], STATUS[integration.status][1])}</span></strong>
          <small>{text(`${integration.jobs.pending} مستني · ${integration.jobs.dead} فشل · ${integration.jobs.succeeded} اتبعت`, `${integration.jobs.pending} pending · ${integration.jobs.dead} failed · ${integration.jobs.succeeded} sent`)}{integration.lastError && ` · ${integration.lastError}`}</small></span>
        <Button small variant="secondary" onClick={() => setOpen(integration.id)}>{text('افتح', 'Open')}</Button>
      </li>)}</ul>)}
    {connecting && <ConnectWizard onClose={() => setConnecting(false)} />}
    {open && integrations.data?.find(entry => entry.id === open) && <IntegrationDialog integration={integrations.data.find(entry => entry.id === open)!} onClose={() => setOpen(null)} />}
  </section>;
}

const DEFAULT_CONFIG: PosWebhookConfig = { endpointUrl: '', pushChannels: ['MENU', 'POS'], pushCancellations: true, acceptStatusUpdates: true, acceptPayments: true };

function ConnectWizard({ onClose }: { onClose: () => void }) {
  const { text, language } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const providers = useQuery({ queryKey: ['pos', 'providers'], queryFn: posApi.providers });
  const branches = useBranchList().branches.filter(branch => branch.isActive);
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState('WEBHOOK');
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState<string>('');
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [result, setResult] = useState<{ integration: PosIntegration; secrets: PosIntegrationSecrets } | null>(null);
  const set = <K extends keyof PosWebhookConfig>(key: K) => (value: PosWebhookConfig[K]) => setConfig(current => ({ ...current, [key]: value }));
  const create = useMutation({
    mutationFn: () => posApi.createIntegration({ provider, name: name.trim(), branchId: branchId || null, config }),
    onSuccess: next => { setResult(next); setStep(3); void queryClient.invalidateQueries({ queryKey: keys.list }); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const test = useMutation({
    mutationFn: () => posApi.integrationAction(result!.integration.id, 'test'),
    onSuccess: next => { void queryClient.invalidateQueries({ queryKey: keys.list }); next.lastTestOk ? toast.success(text('سيستمك رد', 'Your POS answered')) : toast.error(next.lastError ?? text('مردش', 'No answer')); },
  });
  const info = providers.data?.find(entry => entry.key === provider);
  const validUrl = /^https?:\/\/\S+$/.test(config.endpointUrl);
  return <Dialog open onClose={onClose} size="wide" title={text('اربط سيستم الكاشير', 'Connect a POS')} busy={create.isPending}
    footer={step < 3 ? <>
      {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>{text('رجوع', 'Back')}</Button>}
      {step < 2 ? <Button disabled={step === 1 && (name.trim().length < 2 || !validUrl)} onClick={() => setStep(step + 1)}>{text('التالي', 'Next')}</Button>
        : <Button loading={create.isPending} onClick={() => create.mutate()} data-testid="pos-integration-create">{text('اربط', 'Connect')}</Button>}
    </> : <Button onClick={onClose}>{text('تمام', 'Done')}</Button>}>
    <Stepper steps={[text('السيستم', 'Provider'), text('البيانات', 'Details'), text('المزامنة', 'Sync'), text('جاهز', 'Done')]} current={step} />
    {step === 0 && <div className="pos-providers">{(providers.data ?? []).map(entry => <label key={entry.key} className={`pos-mode ${provider === entry.key ? 'is-checked' : ''}`}>
      <input type="radio" name="provider" checked={provider === entry.key} onChange={() => setProvider(entry.key)} />
      <span className="pos-mode-icon" aria-hidden="true"><PlugIcon size={24} /></span>
      <strong>{language === 'en' ? entry.name[1] : entry.name[0]}</strong><small>{language === 'en' ? entry.description[1] : entry.description[0]}</small>
    </label>)}
      <Alert kind="info">{text('Foodics وMICROS وOdoo وغيرهم بيتضافوا لما بيانات الـ API بتاعتهم تبقى متاحة لنا. لو سيستمك بيدعم webhooks، تقدر تربطه دلوقتي.', 'Foodics, MICROS, Odoo and others are added once their API access is available to us. If your POS supports webhooks, you can connect it now.')}</Alert>
    </div>}
    {step === 1 && <div className="pos-settings">
      <label className="field"><span className="field-label">{text('اسم الربط', 'Name')}</span><input className="input" maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder={text('مثلًا: كاشير الفرع الرئيسي', 'e.g. Main branch POS')} /></label>
      <label className="field"><span className="field-label">{text('الفرع', 'Branch')}</span><select className="select" value={branchId} onChange={event => setBranchId(event.target.value)}><option value="">{text('كل الفروع', 'Every branch')}</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label className="field"><span className="field-label">{text('رابط استقبال الطلبات عند سيستمك (HTTPS)', 'Your POS endpoint (HTTPS)')}</span><input className="input ltr" maxLength={500} value={config.endpointUrl} onChange={event => set('endpointUrl')(event.target.value)} placeholder="https://pos.example.com/bilhanah" /></label>
    </div>}
    {step === 2 && <div className="pos-settings">
      {info && <dl className="pos-truth"><div><dt>{text('المنيو', 'Menu')}</dt><dd>{info.sourceOfTruth.menu === 'BILHANAH' ? 'Bilhanah' : text('سيستمك', 'Your POS')}</dd></div><div><dt>{text('الطلبات', 'Orders')}</dt><dd>Bilhanah → {text('سيستمك', 'your POS')}</dd></div><div><dt>{text('حالة الطلب', 'Order status')}</dt><dd>{text('سيستمك', 'Your POS')} → Bilhanah</dd></div><div><dt>{text('الدفع', 'Payments')}</dt><dd>{text('سيستمك', 'Your POS')} → Bilhanah</dd></div></dl>}
      <fieldset className="pos-group"><legend>{text('الطلبات اللي تتبعت', 'Orders sent')}</legend>
        <div className="filter-chips">{(['MENU', 'POS'] as const).map(channel => <button key={channel} type="button" className={`filter-chip ${config.pushChannels.includes(channel) ? 'active' : ''}`} aria-pressed={config.pushChannels.includes(channel)}
          onClick={() => set('pushChannels')(config.pushChannels.includes(channel) ? config.pushChannels.filter(entry => entry !== channel) : [...config.pushChannels, channel])}>{channel === 'MENU' ? text('طلبات منيو QR', 'QR menu orders') : text('طلبات كاشير بالهنا', 'Bilhanah POS orders')}</button>)}</div>
      </fieldset>
      <Switch checked={config.pushCancellations} onChange={set('pushCancellations')} label={text('ابعت الإلغاء كمان', 'Send cancellations too')} />
      <Switch checked={config.acceptStatusUpdates} onChange={set('acceptStatusUpdates')} label={text('سيستمك يحدّث حالة الطلب', 'Your POS updates order status')} description={text('سيستمك هو المرجع لحالة الطلب، وبالهنا مش بتبعتله التحديث تاني (من غير لف).', 'Your POS is the source of truth for status; Bilhanah never echoes it back (no loops).')} />
      <Switch checked={config.acceptPayments} onChange={set('acceptPayments')} label={text('سيستمك يسجّل الدفع', 'Your POS records payments')} />
    </div>}
    {step === 3 && result && <div className="pos-settings" data-testid="pos-integration-secrets">
      <Alert kind="warning" title={text('انسخ المفاتيح دي دلوقتي', 'Copy these secrets now')}>{text('مش هتظهر تاني. لو ضاعت، اعمل مفاتيح جديدة من صفحة الربط.', 'They will not be shown again. If lost, rotate them from the integration.')}</Alert>
      <Secret label={text('رابط استقبال الأحداث عند بالهنا', 'Bilhanah webhook URL')} value={result.integration.webhookUrl} />
      <Secret label={text('مفتاح توقيع اللي بالهنا بتبعته (للتحقق عندك)', 'Signing secret for what Bilhanah sends')} value={result.secrets.outboundSecret} />
      <Secret label={text('مفتاح توقيع اللي سيستمك بيبعته', 'Signing secret for what your POS sends')} value={result.secrets.inboundSecret} />
      <p className="pos-muted">{text('التوقيع: X-Bilhanah-Signature = sha256=HMAC(المفتاح, "<timestamp>.<body>") مع X-Bilhanah-Timestamp.', 'Signature: X-Bilhanah-Signature = sha256=HMAC(secret, "<timestamp>.<body>") with X-Bilhanah-Timestamp.')}</p>
      <Button variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>{text('جرّب الاتصال', 'Test the connection')}</Button>
    </div>}
  </Dialog>;
}

function Secret({ label, value }: { label: string; value: string }) {
  const { text } = useLanguage();
  return <div className="pos-secret"><span>{label}</span><div><code className="ltr">{value}</code><CopyButton value={value} label={text('انسخ', 'Copy')} /></div></div>;
}

function IntegrationDialog({ integration, onClose }: { integration: PosIntegration; onClose: () => void }) {
  const { text, language } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'jobs' | 'logs' | 'mapping'>('jobs');
  const [confirm, setConfirm] = useState(false);
  const [secrets, setSecrets] = useState<PosIntegrationSecrets | null>(null);
  const jobs = useQuery({ queryKey: ['pos', 'jobs', integration.id], queryFn: () => posApi.jobs(integration.id), enabled: tab === 'jobs', refetchInterval: 15_000 });
  const logs = useQuery({ queryKey: ['pos', 'logs', integration.id], queryFn: () => posApi.logs(integration.id), enabled: tab === 'logs' });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: keys.list }); void queryClient.invalidateQueries({ queryKey: ['pos', 'jobs', integration.id] }); };
  const action = useMutation({
    mutationFn: (name: 'test' | 'pause' | 'resume' | 'disconnect') => posApi.integrationAction(integration.id, name),
    onSuccess: (next, name) => { refresh(); if (name === 'test') next.lastTestOk ? toast.success(text('سيستمك رد', 'Your POS answered')) : toast.error(next.lastError ?? ''); if (name === 'disconnect') { setConfirm(false); onClose(); } },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const retry = useMutation({ mutationFn: (jobId: string) => posApi.retryJob(integration.id, jobId), onSuccess: refresh, onError: failure => toast.error(errorMessage(failure, text)) });
  const rotate = useMutation({ mutationFn: () => posApi.rotateSecrets(integration.id), onSuccess: setSecrets, onError: failure => toast.error(errorMessage(failure, text)) });
  const off = integration.status === 'DISCONNECTED';
  return <Dialog open onClose={onClose} size="wide" title={integration.name}
    footer={!off ? <>
      <Button variant="secondary" icon={<TrashIcon size={16} aria-hidden="true" />} onClick={() => setConfirm(true)}>{text('افصل', 'Disconnect')}</Button>
      {integration.status === 'ACTIVE' ? <Button variant="secondary" icon={<PauseIcon size={16} aria-hidden="true" />} onClick={() => action.mutate('pause')}>{text('وقّف مؤقتًا', 'Pause')}</Button>
        : <Button variant="secondary" icon={<PlayIcon size={16} aria-hidden="true" />} onClick={() => action.mutate('resume')}>{text('كمّل', 'Resume')}</Button>}
      <Button loading={action.isPending && action.variables === 'test'} onClick={() => action.mutate('test')}>{text('جرّب الاتصال', 'Test connection')}</Button>
    </> : undefined}>
    <dl className="pos-truth">
      <div><dt>{text('آخر مزامنة', 'Last sync')}</dt><dd>{integration.lastSyncAt ? formatRelative(integration.lastSyncAt, language) : '—'}</dd></div>
      <div><dt>{text('آخر تجربة', 'Last test')}</dt><dd>{integration.lastTestAt ? `${integration.lastTestOk ? '✓' : '✕'} ${formatRelative(integration.lastTestAt, language)}` : '—'}</dd></div>
      <div><dt>{text('مستني / فشل', 'Pending / failed')}</dt><dd>{integration.jobs.pending} / {integration.jobs.dead}</dd></div>
      <div><dt>{text('ربط الأصناف', 'Mappings')}</dt><dd>{integration.mappings}</dd></div>
    </dl>
    {integration.lastError && <Alert kind="error">{integration.lastError}</Alert>}
    <div className="pos-tabs" role="tablist">{([['jobs', 'المزامنة', 'Sync jobs'], ['logs', 'الأحداث الواردة', 'Incoming events'], ['mapping', 'ربط الأصناف', 'Mapping']] as const).map(([key, ar, en]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{text(ar, en)}</button>)}</div>
    {tab === 'jobs' && (jobs.data ? jobs.data.length === 0 ? <p className="pos-muted">{text('لسه مفيش حاجة اتبعتت.', 'Nothing sent yet.')}</p> : <ul className="pos-list">{jobs.data.map(job => <li key={job.id}>
      <span className="pos-list-main"><strong>{job.kind === 'order.create' ? text('طلب جديد', 'New order') : text('إلغاء طلب', 'Order cancelled')} <span className={`pos-pill is-${job.status === 'SUCCEEDED' ? 'active' : job.status === 'DEAD' ? 'off' : 'pending'}`}>{job.status}</span></strong>
        <small>{text(`محاولة ${job.attempts}/${job.maxAttempts}`, `Attempt ${job.attempts}/${job.maxAttempts}`)} · {formatRelative(job.createdAt, language)}{job.lastError && ` · ${job.lastError}`}</small></span>
      {job.status === 'DEAD' && <Button small variant="secondary" icon={<ArrowClockwiseIcon size={14} aria-hidden="true" />} loading={retry.isPending && retry.variables === job.id} onClick={() => retry.mutate(job.id)}>{text('أعد المحاولة', 'Retry')}</Button>}
    </li>)}</ul> : <Skeleton height={120} />)}
    {tab === 'logs' && (logs.data ? logs.data.length === 0 ? <p className="pos-muted">{text('لسه مفيش أحداث.', 'No events yet.')}</p> : <ul className="pos-list">{logs.data.map(log => <li key={log.id}>
      <span className="pos-list-main"><strong>{log.type} <span className={`pos-pill is-${log.outcome === 'PROCESSED' ? 'active' : log.outcome === 'FAILED' ? 'off' : 'pending'}`}>{log.outcome}</span></strong><small className="ltr">{log.eventId} · {formatRelative(log.receivedAt, language)}{log.error && ` · ${log.error}`}</small></span>
    </li>)}</ul> : <Skeleton height={120} />)}
    {tab === 'mapping' && <MappingTab integrationId={integration.id} />}
    {!off && <p><button type="button" className="pt-link" onClick={() => rotate.mutate()}>{text('اعمل مفاتيح توقيع جديدة', 'Rotate signing secrets')}</button></p>}
    {secrets && <div className="pos-settings"><Alert kind="warning">{text('المفاتيح القديمة بطلت. حدّثها في سيستمك.', 'The old secrets stopped working. Update them in your POS.')}</Alert>
      <Secret label={text('مفتاح اللي بالهنا بتبعته', 'Bilhanah → POS secret')} value={secrets.outboundSecret} /><Secret label={text('مفتاح اللي سيستمك بيبعته', 'POS → Bilhanah secret')} value={secrets.inboundSecret} /></div>}
    <ConfirmDialog open={confirm} title={text('تفصل الربط؟', 'Disconnect?')} confirmLabel={text('افصل', 'Disconnect')} busy={action.isPending}
      description={text('المزامنة هتقف نهائيًا. الطلبات والمدفوعات والسجلات القديمة بتفضل.', 'Syncing stops for good. Past orders, payments and logs are kept.')} onConfirm={() => action.mutate('disconnect')} onCancel={() => setConfirm(false)} />
  </Dialog>;
}

/** Links menu dishes to their ids in the external POS (sent with every order). */
function MappingTab({ integrationId }: { integrationId: string }) {
  const { text, language } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const menu = useMenuQuery();
  const mappings = useQuery({ queryKey: ['pos', 'mappings', integrationId], queryFn: () => posApi.mappings(integrationId) });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: ({ localId, externalId }: { localId: string; externalId: string }) => posApi.map(integrationId, { entity: 'MENU_ITEM', localId, externalId }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['pos', 'mappings', integrationId] }); toast.success(text('اتحفظ', 'Saved')); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  if (!menu.data || !mappings.data) return <Skeleton height={160} />;
  const items = menu.data.categories.flatMap(category => category.items);
  const current = (itemId: string) => mappings.data.find(row => row.entity === 'MENU_ITEM' && row.localId === itemId)?.externalId ?? '';
  return <div className="pos-mapping">
    <p className="pos-muted">{text('اكتب رقم كل صنف في سيستمك. اللي من غير رقم بيتبعت باسمه بس.', 'Enter each dish’s id in your POS. Dishes without one are sent by name only.')}</p>
    <ul className="pos-list">{items.map(item => {
      const value = drafts[item.id] ?? current(item.id);
      return <li key={item.id}>
        <span className="pos-list-main"><strong>{language === 'en' ? item.nameEn || item.nameAr : item.nameAr}</strong></span>
        <input className="input ltr pos-map-input" value={value} maxLength={120} onChange={event => setDrafts(prev => ({ ...prev, [item.id]: event.target.value }))} placeholder={text('رقمه عندك', 'External id')} aria-label={text('رقم الصنف في سيستمك', 'External id')} />
        <Button small variant="secondary" disabled={!value.trim() || value === current(item.id)} onClick={() => save.mutate({ localId: item.id, externalId: value.trim() })}>{text('احفظ', 'Save')}</Button>
      </li>;
    })}</ul>
  </div>;
}
