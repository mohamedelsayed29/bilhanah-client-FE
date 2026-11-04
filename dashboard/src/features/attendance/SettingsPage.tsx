import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowsClockwiseIcon, CrosshairIcon, DeviceMobileIcon, DeviceTabletIcon, FingerprintIcon, MonitorPlayIcon, PrinterIcon, QrCodeIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { ATTENDANCE_METHOD_LABELS, AVAILABLE_ATTENDANCE_METHODS, type AttendanceMethod, type AttendancePolicies, type AttendancePolicyInput } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Section } from '../../components/Section';
import { PageSkeleton } from '../../components/Skeleton';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { attendanceApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';
import { attendanceKeys } from './shared';

const METHOD_INFO: Record<AttendanceMethod, { icon: Icon; ar: string; en: string }> = {
  PORTAL: { icon: DeviceMobileIcon, ar: 'الموظف بيسجّل من موبايله أو الكمبيوتر بعد ما يدخل حسابه.', en: 'Employees check in from their phone or computer, signed in.' },
  QR: { icon: QrCodeIcon, ar: 'كود في الفرع، الموظف بيمسحه بموبايله. المتغيّر بيتجدد كل شوية فمينفعش يتبعت لحد برّه.', en: 'A code at the branch, scanned with the phone. The dynamic one keeps changing, so it cannot be shared.' },
  KIOSK: { icon: DeviceTabletIcon, ar: 'تابلت أو كمبيوتر في الفرع، الموظف بيكتب رقمه والـ PIN بتاعه.', en: 'A shared tablet or computer at the branch: employee number and PIN.' },
  FINGERPRINT: { icon: FingerprintIcon, ar: 'جهاز بصمة USB. هيتفعّل لما نحدد موديل الجهاز وبرنامجه.', en: 'A USB fingerprint reader. Available once the device model and its software are confirmed.' },
};

/** Attendance methods and rules: the restaurant's, and any branch that sets its own; the branch QR codes. */
export function AttendanceSettingsPage() {
  const { text } = useLanguage();
  usePageTitle('إعدادات الحضور', 'Attendance settings');
  const policies = useQuery({ queryKey: attendanceKeys.policies, queryFn: attendanceApi.policies });
  const [target, setTarget] = useState<string>('restaurant');
  if (policies.isPending) return <PageSkeleton blocks={3} />;
  if (policies.isError) return <ErrorPanel error={policies.error} onRetry={() => void policies.refetch()} />;
  const data = policies.data;
  const branch = data.branches.find(entry => entry.branchId === target) ?? null;
  return <div className="settings-grid">
    <div className="settings-main">
      {data.branches.length > 1 && <div className="segmented att-target" role="radiogroup" aria-label={text('الإعدادات لـ', 'Settings for')}>
        <label><input type="radio" name="att-target" checked={target === 'restaurant'} onChange={() => setTarget('restaurant')} />{text('كل الفروع', 'All branches')}</label>
        {data.branches.map(entry => <label key={entry.branchId}><input type="radio" name="att-target" checked={target === entry.branchId} onChange={() => setTarget(entry.branchId)} />
          <bdi>{entry.branchName}</bdi>{entry.override && <span className="att-dot" aria-label={text('إعدادات خاصة', 'Own settings')} />}</label>)}
      </div>}
      {branch
        ? <BranchPolicy key={branch.branchId} branch={branch} />
        : <PolicyForm key="restaurant" initial={data.restaurant} save={body => attendanceApi.setRestaurantPolicy(body)}
          intro={text('القواعد دي لكل الفروع، إلا الفرع اللي ليه إعدادات خاصة.', 'These rules apply to every branch, except branches with their own.')} />}
      {data.branches.length === 1 && <QrSection branch={data.branches[0]!} />}
      {branch && <QrSection branch={branch} />}
    </div>
    <aside className="settings-aside" aria-labelledby="att-how-title">
      <h2 id="att-how-title">{text('إزاي الموظف بيسجّل', 'How employees check in')}</h2>
      <p className="field-hint">{text('شغّل طريقة أو أكتر، واختار الأساسية. الموظف بيسجّل بالطرق المفعّلة في فرعه بس، وكل تسجيل بيتأكد منه السيرفر: الموظف، الفرع، الشيفت، والقواعد.', 'Turn on one or more methods and choose the main one. Employees use only their branch’s methods, and the server checks every check-in: employee, branch, shift and rules.')}</p>
      <p className="field-hint">{text('تغيير الإعدادات مش بيغيّر السجلات القديمة، وبيتسجّل في سجل المراجعة.', 'Changing settings never changes past records, and is recorded in the audit log.')}</p>
    </aside>
  </div>;
}

function BranchPolicy({ branch }: { branch: AttendancePolicies['branches'][number] }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const inherit = useMutation({
    mutationFn: () => attendanceApi.inheritPolicy(branch.branchId),
    onSuccess: data => { queryClient.setQueryData(attendanceKeys.policies, data); toast.success(text('الفرع رجع لإعدادات المطعم', 'The branch follows the restaurant again')); },
    onError: error => toast.error(errorMessage(error, text)),
  });
  const [own, setOwn] = useState(branch.override);
  return <>
    <Section id="branch-mode-title" title={<bdi>{branch.branchName}</bdi>} description={text('الفرع ده ممكن ياخد إعدادات المطعم أو يبقى ليه إعداداته.', 'This branch can follow the restaurant or have its own rules.')}>
      <Switch checked={own} onChange={value => { setOwn(value); if (!value && branch.override) inherit.mutate(); }}
        label={text('إعدادات خاصة بالفرع ده', 'Own settings for this branch')}
        description={own ? text('القواعد تحت للفرع ده بس.', 'The rules below apply to this branch only.') : text('بيستخدم إعدادات المطعم.', 'Uses the restaurant’s settings.')} />
    </Section>
    {own && <PolicyForm initial={branch.policy} save={body => attendanceApi.setBranchPolicy(branch.branchId, body)} />}
  </>;
}

function PolicyForm({ initial, save, intro }: { initial: AttendancePolicyInput; save: (body: AttendancePolicyInput) => Promise<AttendancePolicies>; intro?: string }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const pick = (policy: AttendancePolicyInput): AttendancePolicyInput => ({
    methods: policy.methods, primaryMethod: policy.primaryMethod, graceMinutes: policy.graceMinutes, earlyCheckInMinutes: policy.earlyCheckInMinutes,
    lateCheckOutMinutes: policy.lateCheckOutMinutes, recordOvertime: policy.recordOvertime, allowWithoutShift: policy.allowWithoutShift, allowOutsideShift: policy.allowOutsideShift,
    allowMultipleShifts: policy.allowMultipleShifts, requireCheckOut: policy.requireCheckOut, correctionsEnabled: policy.correctionsEnabled, manualNeedsApproval: policy.manualNeedsApproval,
    qrMode: policy.qrMode, qrTtlSeconds: policy.qrTtlSeconds, locationMode: policy.locationMode, latitude: policy.latitude, longitude: policy.longitude, radiusMeters: policy.radiusMeters,
  });
  const [form, setForm] = useState(() => pick(initial));
  const [locating, setLocating] = useState(false);
  useEffect(() => setForm(pick(initial)), [initial]);
  const set = (changes: Partial<AttendancePolicyInput>) => setForm(current => ({ ...current, ...changes }));
  const dirty = JSON.stringify(form) !== JSON.stringify(pick(initial));
  const mutation = useMutation({
    mutationFn: () => save(form),
    onSuccess: data => { queryClient.setQueryData(attendanceKeys.policies, data); void queryClient.invalidateQueries({ queryKey: attendanceKeys.all }); toast.success(text('اتحفظت إعدادات الحضور', 'Attendance settings saved')); },
  });
  const toggleMethod = (method: AttendanceMethod) => {
    const methods = form.methods.includes(method) ? form.methods.filter(entry => entry !== method) : [...form.methods, method];
    set({ methods, primaryMethod: methods.includes(form.primaryMethod) ? form.primaryMethod : methods[0] ?? form.primaryMethod });
  };
  const here = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      set({ latitude: Math.round(position.coords.latitude * 1e6) / 1e6, longitude: Math.round(position.coords.longitude * 1e6) / 1e6, radiusMeters: form.radiusMeters ?? 100 });
      setLocating(false);
    }, () => { setLocating(false); toast.error(text('المتصفح ما ادّاناش الموقع.', 'The browser did not share the location.')); }, { enableHighAccuracy: true, timeout: 15_000 });
  };
  const number = (key: keyof AttendancePolicyInput, min: number, max: number) => ({
    type: 'number' as const, inputMode: 'numeric' as const, min, max, className: 'input',
    value: String(form[key] ?? ''), onChange: (event: React.ChangeEvent<HTMLInputElement>) => set({ [key]: Math.min(max, Math.max(min, Number(event.target.value) || 0)) } as Partial<AttendancePolicyInput>),
  });
  const valid = form.methods.length > 0 && (form.locationMode === 'OFF' || (form.latitude !== null && form.longitude !== null && form.radiusMeters !== null));
  return <form className="settings-main form" noValidate onSubmit={event => { event.preventDefault(); if (valid) mutation.mutate(); }}>
    <Section id="att-methods-title" title={text('طرق تسجيل الحضور', 'Check-in methods')} description={intro ?? text('اختار طريقة أو أكتر، وحدد الأساسية.', 'Choose one or more, and the main one.')}>
      {mutation.isError && <Alert kind="error">{errorMessage(mutation.error, text)}</Alert>}
      <div className="method-cards">
        {(['PORTAL', 'QR', 'KIOSK', 'FINGERPRINT'] as const).map(method => {
          const info = METHOD_INFO[method];
          const available = (AVAILABLE_ATTENDANCE_METHODS as readonly string[]).includes(method);
          const on = form.methods.includes(method);
          return <div key={method} className={`method-card ${on ? 'is-on' : ''} ${available ? '' : 'is-soon'}`} data-testid={`method-${method}`}>
            <label className="method-card-main">
              <input type="checkbox" checked={on} disabled={!available} onChange={() => toggleMethod(method)} />
              <span className="method-card-icon" aria-hidden="true"><info.icon size={22} /></span>
              <span><strong>{text(...ATTENDANCE_METHOD_LABELS[method])}</strong>{!available && <span className="badge badge-muted">{text('قريبًا', 'Coming soon')}</span>}<small>{text(info.ar, info.en)}</small></span>
            </label>
            {on && <label className="method-card-primary"><input type="radio" name="primary" checked={form.primaryMethod === method} onChange={() => set({ primaryMethod: method })} />{text('الأساسية', 'Main method')}</label>}
          </div>;
        })}
      </div>
      {!form.methods.length && <p className="field-error">{text('لازم طريقة واحدة على الأقل.', 'Turn on at least one method.')}</p>}
    </Section>

    <Section id="att-rules-title" title={text('قواعد الحضور', 'Attendance rules')} description={text('بتتحسب على الشيفت المتحدد لكل موظف.', 'Applied to each employee’s assigned shift.')}>
      <div className="form-grid form-grid-3">
        <Field label={text('سماحية التأخير (دقيقة)', 'Grace period (min)')} hint={text('بعدها يتحسب متأخر.', 'Late after this.')}><input {...number('graceMinutes', 0, 120)} /></Field>
        <Field label={text('حضور بدري (دقيقة)', 'Early check-in (min)')} hint={text('قبل بداية الشيفت.', 'Before the shift starts.')}><input {...number('earlyCheckInMinutes', 0, 240)} /></Field>
        <Field label={text('سماح الانصراف (دقيقة)', 'Late check-out (min)')} hint={text('بعدها يبقى «ناقص».', 'After this: incomplete.')}><input {...number('lateCheckOutMinutes', 0, 480)} /></Field>
      </div>
      <div className="switch-list">
        <Switch checked={form.recordOvertime} onChange={value => set({ recordOvertime: value })} label={text('احسب الوقت الإضافي', 'Record overtime')} />
        <Switch checked={form.allowOutsideShift} onChange={value => set({ allowOutsideShift: value })} label={text('يسجّل برّه وقت شيفته', 'Check in outside the shift')} description={text('قبل ما شيفته يفتح، أو في يوم شيفته بعد ما يخلص.', 'Before the shift opens, or on a shift day after it ends.')} />
        <Switch checked={form.allowWithoutShift} onChange={value => set({ allowWithoutShift: value })} label={text('يسجّل من غير شيفت', 'Check in without a shift')} description={text('في يوم ملوش فيه شيفت.', 'On a day with no shift.')} />
        <Switch checked={form.allowMultipleShifts} onChange={value => set({ allowMultipleShifts: value })} label={text('أكتر من حضور في اليوم', 'Several sessions a day')} />
        <Switch checked={form.requireCheckOut} onChange={value => set({ requireCheckOut: value })} label={text('الانصراف لازم', 'Check-out required')} description={text('من غيره السجل يبقى «ناقص».', 'Without it the record is incomplete.')} />
        <Switch checked={form.correctionsEnabled} onChange={value => set({ correctionsEnabled: value })} label={text('الموظف يطلب تصحيح', 'Employees can request corrections')} />
        <Switch checked={form.manualNeedsApproval} onChange={value => set({ manualNeedsApproval: value })} label={text('تعديلات المديرين محتاجة موافقة', 'Managers’ edits need approval')} description={text('المدير اللي معندوش صلاحية الموافقة، تعديله بيبقى طلب.', 'A manager without approval rights files a request instead.')} />
      </div>
    </Section>

    {form.methods.includes('QR') && <Section id="att-qr-title" title={text('كود QR', 'QR code')}>
      <div className="segmented" role="radiogroup" aria-label={text('نوع الكود', 'Code type')}>
        <label><input type="radio" name="qr-mode" checked={form.qrMode === 'DYNAMIC'} onChange={() => set({ qrMode: 'DYNAMIC' })} />{text('متغيّر (أأمن)', 'Dynamic (safer)')}</label>
        <label><input type="radio" name="qr-mode" checked={form.qrMode === 'STATIC'} onChange={() => set({ qrMode: 'STATIC' })} />{text('ثابت (مطبوع)', 'Static (printed)')}</label>
      </div>
      {form.qrMode === 'DYNAMIC'
        ? <Field label={text('بيتجدد كل (ثانية)', 'Refreshes every (seconds)')} hint={text('بيظهر على شاشة الكشك أو شاشة الكود في الفرع.', 'Shown on the kiosk or the QR screen at the branch.')}><input {...number('qrTtlSeconds', 15, 300)} /></Field>
        : <p className="field-hint">{text('كود ثابت تطبعه وتعلّقه. أي حد معاه صورته يقدر يستخدمه، فشغّل التحقق من الموقع لو محتاج.', 'A fixed code to print and hang. Anyone with a photo of it can use it, so turn on location checks if needed.')}</p>}
    </Section>}

    {(form.methods.includes('PORTAL') || form.methods.includes('QR')) && <Section id="att-location-title" title={text('التحقق من الموقع', 'Location check')}
      description={text('للبوابة والـ QR بس. مساعد مش ضمان: الموقع ممكن يتزوّر.', 'For the portal and QR only. A help, not a guarantee: locations can be faked.')}>
      <div className="segmented" role="radiogroup" aria-label={text('التحقق من الموقع', 'Location check')}>
        {([['OFF', text('مقفول', 'Off')], ['FLAG', text('سجّل وعلّم', 'Record and flag')], ['REJECT', text('ارفض', 'Reject')]] as const).map(([value, label]) =>
          <label key={value}><input type="radio" name="loc-mode" checked={form.locationMode === value} onChange={() => set({ locationMode: value })} />{label}</label>)}
      </div>
      {form.locationMode !== 'OFF' && <div className="form-grid form-grid-3">
        <Field label={text('خط العرض', 'Latitude')}><input className="input ltr-input" dir="ltr" inputMode="decimal" value={form.latitude ?? ''} onChange={event => set({ latitude: event.target.value === '' ? null : Number(event.target.value) })} /></Field>
        <Field label={text('خط الطول', 'Longitude')}><input className="input ltr-input" dir="ltr" inputMode="decimal" value={form.longitude ?? ''} onChange={event => set({ longitude: event.target.value === '' ? null : Number(event.target.value) })} /></Field>
        <Field label={text('النطاق (متر)', 'Radius (m)')}><input {...number('radiusMeters', 20, 5000)} /></Field>
        <Button small variant="secondary" loading={locating} onClick={here} icon={<CrosshairIcon size={16} aria-hidden="true" />}>{text('استخدم موقعي دلوقتي', 'Use my location now')}</Button>
      </div>}
    </Section>}

    <div className={`settings-savebar ${dirty ? 'is-dirty' : ''}`} role="group" aria-label={text('الحفظ', 'Save')}>
      <span className="settings-savebar-note" aria-live="polite">{dirty ? text('في تغييرات لسه ما اتحفظتش', 'You have unsaved changes') : text('كل التغييرات محفوظة', 'All changes saved')}</span>
      <Button variant="secondary" disabled={!dirty || mutation.isPending} onClick={() => setForm(pick(initial))}>{text('تراجع', 'Discard')}</Button>
      <Button type="submit" loading={mutation.isPending} disabled={!dirty || !valid}>{text('احفظ إعدادات الحضور', 'Save attendance settings')}</Button>
    </div>
  </form>;
}

/** The branch's printed QR (static) and a link to the live screen (dynamic); regenerating retires printed copies. */
function QrSection({ branch }: { branch: AttendancePolicies['branches'][number] }) {
  const { text } = useLanguage();
  const { to } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const regenerate = useMutation({
    mutationFn: () => attendanceApi.regenerateQr(branch.branchId),
    onSuccess: data => { queryClient.setQueryData(attendanceKeys.policies, data); toast.success(text('اتعمل كود جديد، والقديم بطل', 'New code created; the old one no longer works')); setConfirm(false); },
    onError: error => toast.error(errorMessage(error, text)),
  });
  if (!branch.policy.methods.includes('QR')) return null;
  return <Section id={`qr-${branch.branchId}`} title={text(`كود الحضور — ${branch.branchName}`, `Attendance code — ${branch.branchName}`)}>
    {branch.policy.qrMode === 'STATIC' && branch.qrUrl
      ? <div className="att-qr-print">
        <QRCodeSVG value={branch.qrUrl} size={180} level="M" marginSize={2} />
        <div>
          <p className="field-hint">{text('اطبعه وعلّقه في الفرع. الموظف بيمسحه بكاميرا موبايله وهو داخل حسابه.', 'Print it and hang it at the branch. Employees scan it with their phone camera while signed in.')}</p>
          <div className="page-actions">
            <Button small variant="secondary" onClick={() => window.print()} icon={<PrinterIcon size={16} aria-hidden="true" />}>{text('اطبع', 'Print')}</Button>
            <Button small variant="danger-outline" onClick={() => setConfirm(true)} icon={<ArrowsClockwiseIcon size={16} aria-hidden="true" />}>{text('كود جديد', 'New code')}</Button>
          </div>
        </div>
      </div>
      : <div className="att-qr-print">
        <p className="field-hint">{text('الكود المتغيّر بيظهر على شاشة في الفرع (الكشك، أو شاشة الكود). بيتجدد لوحده.', 'The dynamic code shows on a screen at the branch (the kiosk, or the code screen). It refreshes by itself.')}</p>
        <Link className="button button-secondary button-small" to={`${to('/attendance/qr-screen')}?branch=${branch.branchId}`} target="_blank"><MonitorPlayIcon size={16} aria-hidden="true" />{text('افتح شاشة الكود', 'Open the code screen')}</Link>
      </div>}
    <ConfirmDialog open={confirm} busy={regenerate.isPending} onCancel={() => setConfirm(false)} onConfirm={() => regenerate.mutate()}
      title={text('تعمل كود جديد؟', 'Create a new code?')} confirmLabel={text('اعمل كود جديد', 'Create new code')}
      description={text('الكود المطبوع دلوقتي هيبطل يشتغل، ولازم تطبع الجديد.', 'The printed code stops working; you will need to print the new one.')} />
  </Section>;
}
