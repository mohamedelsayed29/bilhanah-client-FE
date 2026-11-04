import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowSquareOutIcon, DeviceTabletIcon, FingerprintIcon, PlusIcon } from '@phosphor-icons/react';
import type { KioskActivationCode } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { attendanceApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { formatRelative } from '../../lib/format';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchList } from '../branches/workspace';
import { useBranchScope } from '../branches/BranchScope';
import { attendanceKeys } from './shared';

/** Where kiosk screens open: this dashboard's /attendance-kiosk page. */
const kioskUrl = () => `${window.location.origin}/attendance-kiosk`;

/** Branch screens for PIN attendance (and the live QR), and the fingerprint devices to come. */
export function AttendanceKiosksPage() {
  const { text, language } = useLanguage();
  usePageTitle('أجهزة الحضور', 'Attendance devices');
  const toast = useToast();
  const queryClient = useQueryClient();
  const kiosks = useQuery({ queryKey: attendanceKeys.kiosks, queryFn: attendanceApi.kiosks });
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState<{ name: string; activation: KioskActivationCode } | null>(null);
  const [disabling, setDisabling] = useState<string | null>(null);
  const newCode = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => attendanceApi.kioskCode(id),
    onSuccess: (activation, { name }) => { setCode({ name, activation }); void queryClient.invalidateQueries({ queryKey: attendanceKeys.kiosks }); },
    onError: error => toast.error(errorMessage(error, text)),
  });
  const toggle = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) => attendanceApi.setKioskDisabled(id, disabled),
    onSuccess: saved => { void queryClient.invalidateQueries({ queryKey: attendanceKeys.kiosks }); toast.success(saved.disabled ? text('اتقفل الجهاز وخرج', 'Device disabled and signed out') : text('اتفتح الجهاز', 'Device enabled')); setDisabling(null); },
    onError: error => toast.error(errorMessage(error, text)),
  });
  return <div className="settings-grid">
    <div className="settings-main">
      <section className="section" aria-labelledby="kiosks-title">
        <div className="section-head"><div><h2 id="kiosks-title">{text('أكشاك الحضور', 'Attendance kiosks')}</h2>
          <p>{text('تابلت أو كمبيوتر في الفرع: الموظف يكتب رقمه والـ PIN. لو الـ QR المتغيّر شغال، الشاشة نفسها بتعرضه.', 'A tablet or computer at the branch: employees type their number and PIN. With the dynamic QR on, the same screen shows it.')}</p></div>
          <Button small onClick={() => setCreating(true)} icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />}>{text('كشك جديد', 'New kiosk')}</Button>
        </div>
        {kiosks.isError && <ErrorPanel error={kiosks.error} onRetry={() => void kiosks.refetch()} />}
        {kiosks.isPending && <Skeleton height={60} />}
        {kiosks.data?.length === 0 && <p className="board-empty">{text('لسه مفيش أكشاك.', 'No kiosks yet.')}</p>}
        {kiosks.data && kiosks.data.length > 0 && <ul className="session-list">{kiosks.data.map(kiosk => <li key={kiosk.id} className="session-row" data-testid="kiosk-row">
          <span className="session-icon" aria-hidden="true"><DeviceTabletIcon size={22} /></span>
          <div className="session-info">
            <strong><bdi>{kiosk.name}</bdi>{' '}
              {kiosk.disabled ? <span className="badge badge-muted">{text('مقفول', 'Disabled')}</span>
                : kiosk.activated ? <span className="badge badge-success">{text('متوصل', 'Connected')}</span> : <span className="badge badge-warning">{text('محتاج تفعيل', 'Requires setup')}</span>}</strong>
            <small><bdi>{kiosk.branchName}</bdi> · {kiosk.lastSeenAt ? text(`آخر ظهور ${formatRelative(kiosk.lastSeenAt, language)}`, `Last seen ${formatRelative(kiosk.lastSeenAt, language)}`) : text('لسه ما اشتغلش', 'Never used')}</small>
          </div>
          <div className="page-actions">
            {!kiosk.disabled && <Button small variant="ghost" loading={newCode.isPending && newCode.variables?.id === kiosk.id} onClick={() => newCode.mutate({ id: kiosk.id, name: kiosk.name })}>
              {kiosk.activated ? text('انقله لجهاز تاني', 'Move to another screen') : text('كود تفعيل', 'Activation code')}</Button>}
            {kiosk.disabled
              ? <Button small variant="secondary" onClick={() => toggle.mutate({ id: kiosk.id, disabled: false })}>{text('افتحه', 'Enable')}</Button>
              : <Button small variant="danger-outline" onClick={() => setDisabling(kiosk.id)}>{text('اقفله', 'Disable')}</Button>}
          </div>
        </li>)}</ul>}
      </section>
      <section className="section" aria-labelledby="fingerprint-title">
        <div className="section-head"><div><h2 id="fingerprint-title">{text('أجهزة البصمة USB', 'USB fingerprint devices')}</h2>
          <p>{text('هتتضاف لما نحدد موديل الجهاز. التسجيل بيمر ببرنامج صغير على كمبيوتر الفرع بيكلّم الجهاز، والبصمة نفسها مش بتتخزن عندنا.', 'Coming once the device model is confirmed. Check-ins go through a small program on the branch computer that talks to the reader; fingerprints themselves are never stored by Bilhanah.')}</p></div>
          <span className="badge badge-muted">{text('قريبًا', 'Coming soon')}</span>
        </div>
        <p className="att-soon"><FingerprintIcon size={28} aria-hidden="true" />{text('لحد ما ده يجهز، استخدم الكشك بالـ PIN أو الـ QR.', 'Until then, use the PIN kiosk or the QR code.')}</p>
      </section>
    </div>
    <aside className="settings-aside" aria-labelledby="kiosk-how-title">
      <h2 id="kiosk-how-title">{text('تشغيل الكشك', 'Setting up a kiosk')}</h2>
      <ol className="att-steps">
        <li>{text('اعمل كشك واختار الفرع.', 'Create a kiosk for a branch.')}</li>
        <li>{text('على تابلت الفرع افتح:', 'On the branch tablet, open:')} <a className="link ltr" href={kioskUrl()} target="_blank" rel="noreferrer">{kioskUrl().replace(/^https?:\/\//, '')} <ArrowSquareOutIcon size={12} aria-hidden="true" /></a></li>
        <li>{text('اكتب كود التفعيل (صالح ١٥ دقيقة).', 'Type the activation code (valid 15 minutes).')}</li>
        <li>{text('الشاشة بتفضل شغالة لحد ما تقفلها من هنا.', 'The screen stays on until you disable it here.')}</li>
      </ol>
    </aside>
    <CreateKioskDialog open={creating} onClose={() => setCreating(false)} onCreated={(name, activation) => { setCreating(false); setCode({ name, activation }); }} />
    <Dialog open={code !== null} onClose={() => setCode(null)} size="small" title={text(`تفعيل «${code?.name ?? ''}»`, `Activate “${code?.name ?? ''}”`)} footer={<Button onClick={() => setCode(null)}>{text('تمام', 'Done')}</Button>}>
      {code && <div className="pin-reveal" data-testid="kiosk-code">
        <span>{text('على شاشة الكشك اكتب الكود ده:', 'On the kiosk screen, type this code:')}</span>
        <strong className="ltr">{code.activation.code.replace(/(\d{3})(\d{3})/, '$1 $2')}</strong>
        <small>{text('صالح ١٥ دقيقة ولمرة واحدة.', 'Valid once, for 15 minutes.')}</small>
        <a className="link ltr" href={kioskUrl()} target="_blank" rel="noreferrer">{kioskUrl().replace(/^https?:\/\//, '')}</a>
      </div>}
    </Dialog>
    <ConfirmDialog open={disabling !== null} busy={toggle.isPending} onCancel={() => setDisabling(null)} onConfirm={() => disabling && toggle.mutate({ id: disabling, disabled: true })}
      title={text('تقفل الكشك ده؟', 'Disable this kiosk?')} confirmLabel={text('اقفله', 'Disable')}
      description={text('الشاشة هتخرج على طول ومحدش هيقدر يسجّل منها.', 'The screen is signed out at once and nobody can check in on it.')} />
  </div>;
}

function CreateKioskDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string, activation: KioskActivationCode) => void }) {
  const { text } = useLanguage();
  const queryClient = useQueryClient();
  const scope = useBranchScope();
  const branches = useBranchList().branches.filter(branch => branch.isActive);
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  useEffect(() => { if (open) { setName(''); setBranchId(scope.selected !== 'all' ? scope.selected : branches[0]?.id ?? ''); } }, [open]);
  const create = useMutation({
    mutationFn: () => attendanceApi.createKiosk({ name: name.trim(), branchId }),
    onSuccess: result => { void queryClient.invalidateQueries({ queryKey: attendanceKeys.kiosks }); onCreated(result.kiosk.name, result.activation); },
  });
  return <Dialog open={open} onClose={onClose} size="small" busy={create.isPending} onSubmit={() => { if (name.trim() && branchId) create.mutate(); }} title={text('كشك جديد', 'New kiosk')}
    footer={<><Button variant="secondary" onClick={onClose}>{text('إلغاء', 'Cancel')}</Button><Button type="submit" loading={create.isPending} disabled={!name.trim() || !branchId}>{text('اعمل الكشك', 'Create kiosk')}</Button></>}>
    <div className="form">
      {create.isError && <Alert kind="error">{errorMessage(create.error, text)}</Alert>}
      <Field label={text('الاسم', 'Name')} required><input className="input" data-autofocus maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder={text('مثلًا: باب الموظفين', 'e.g. Staff door')} /></Field>
      {branches.length > 1 && <Field label={text('الفرع', 'Branch')} required>
        <select className="select" value={branchId} onChange={event => setBranchId(event.target.value)}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
      </Field>}
    </div>
  </Dialog>;
}

/** A full-screen live QR for a branch (dynamic mode), refreshed before it expires. */
export function AttendanceQrScreen() {
  const { text } = useLanguage();
  usePageTitle('كود الحضور', 'Attendance code');
  const [params] = useSearchParams();
  const branchId = params.get('branch') ?? '';
  const qr = useQuery({ queryKey: ['attendance', 'live-qr', branchId], queryFn: () => attendanceApi.liveQr(branchId), enabled: Boolean(branchId), refetchInterval: 5_000 });
  return <div className="att-qr-screen">
    {qr.data ? <>
      <QRCodeSVG value={qr.data.url} size={360} level="M" marginSize={2} />
      <p>{text('امسح الكود بموبايلك وانت داخل حسابك عشان تسجّل حضورك أو انصرافك.', 'Scan with your phone, signed in, to check in or out.')}</p>
    </> : qr.isError ? <ErrorPanel error={qr.error} onRetry={() => void qr.refetch()} /> : qr.data === null
      ? <p>{text('الـ QR مش مفعّل في الفرع ده.', 'QR is not enabled at this branch.')}</p> : <Skeleton width={360} height={360} />}
  </div>;
}
