import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DesktopIcon, KeyIcon, PauseIcon, PlayIcon, PlusIcon, QrCodeIcon } from '@phosphor-icons/react';
import { POS_PAIRING_MINUTES, type PosDevice, type PosPairing } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { posApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { formatRelative } from '../../lib/format';
import { useLanguage } from '../../lib/language';
import { useBranchList } from '../branches/workspace';
import { CASHIER_PATH } from './CashierLink';
import { loadDevice, saveDevice } from './device';

/**
 * The devices allowed to run the terminal, within the limit the platform sets. A device is registered here
 * (this browser gets its key) or for another device (a one-time code is typed on it); devices can be paused,
 * given a new code, or revoked for good.
 */
export function DevicesPanel({ maxDevices }: { maxDevices: number }) {
  const { text, language, number } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: ['pos', 'devices'], queryFn: posApi.devices });
  const [adding, setAdding] = useState<'here' | 'other' | null>(null);
  const [revoking, setRevoking] = useState<PosDevice | null>(null);
  const [pairing, setPairing] = useState<PosPairing | null>(null);
  const [current, setCurrent] = useState(loadDevice);
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['pos', 'devices'] }); void queryClient.invalidateQueries({ queryKey: ['pos'] }); };
  const revoke = useMutation({
    mutationFn: (device: PosDevice) => posApi.revokeDevice(device.id),
    onSuccess: device => {
      refresh();
      if (current?.id === device.id) { saveDevice(null); setCurrent(null); }
      toast.success(text('الجهاز اتلغى', 'Device revoked')); setRevoking(null);
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const toggle = useMutation({
    mutationFn: (device: PosDevice) => posApi.updateDevice(device.id, { status: device.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }),
    onSuccess: device => { refresh(); toast.success(device.status === 'DISABLED' ? text('الجهاز اتوقف مؤقتًا', 'Device paused') : text('الجهاز رجع يشتغل', 'Device resumed')); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const newCode = useMutation({ mutationFn: (device: PosDevice) => posApi.pairingCode(device.id), onSuccess: result => { refresh(); setPairing(result); }, onError: failure => toast.error(errorMessage(failure, text)) });
  const inUse = devices.data?.filter(device => device.status !== 'REVOKED').length ?? 0;
  const full = inUse >= maxDevices;

  return <section className="card pos-card" aria-labelledby="pos-devices">
    <header className="pos-card-head pos-row"><div>
      <h2 id="pos-devices">{text('الأجهزة', 'Devices')} <span className="pos-pill">{text(`${number(inUse)} من ${number(maxDevices)}`, `${number(inUse)} of ${number(maxDevices)}`)}</span></h2>
      <p className="pos-muted">{text('الكاشير بيشتغل على الأجهزة المسجّلة بس. كل طلب ودفعة بيتسجلوا باسم الجهاز، والجهاز الموقوف أو الملغي مبيقدرش يبعت حاجة.', 'The POS runs only on registered devices. Orders and payments record the device; a paused or revoked device cannot send anything.')}</p>
    </div>
      <div className="pos-row">
        <Button variant="secondary" icon={<QrCodeIcon size={16} aria-hidden="true" />} onClick={() => setAdding('other')} disabled={full} data-testid="pos-device-add-other">{text('جهاز تاني', 'Another device')}</Button>
        <Button icon={<PlusIcon size={16} aria-hidden="true" />} onClick={() => setAdding('here')} disabled={full || current !== null} data-testid="pos-device-add">{text('سجّل الجهاز ده', 'Register this device')}</Button>
      </div>
    </header>
    {full && <Alert kind="warning">{text(`وصلت لحد الأجهزة (${number(maxDevices)}). ألغي جهاز مش مستخدم، أو كلّم دعم بالهنا تزوّد الحد.`, `You have reached the device limit (${number(maxDevices)}). Revoke an unused device, or ask Bilhanah support to raise it.`)}</Alert>}
    {current && <Alert kind="info">{text(`المتصفح ده متسجل كـ «${current.name}».`, `This browser is registered as “${current.name}”.`)}</Alert>}
    {devices.isError && <ErrorPanel error={devices.error} onRetry={() => void devices.refetch()} />}
    {devices.isPending && <Skeleton height={120} />}
    {devices.data && (devices.data.length === 0 ? <p className="pos-muted">{text('لسه مفيش أجهزة. سجّل الجهاز اللي هيشتغل عليه الكاشير عشان يقدر ياخد طلبات.', 'No devices yet. Register the device the cashier will use so it can take orders.')}</p>
      : <ul className="pos-list">{devices.data.map(device => <li key={device.id} className={device.status !== 'ACTIVE' ? 'is-off' : ''} data-testid="pos-device">
        <span className="pos-list-icon" aria-hidden="true"><DesktopIcon size={20} /></span>
        <span className="pos-list-main"><strong>{device.name}{current?.id === device.id && <small className="badge badge-info">{text('ده', 'This one')}</small>}
          {device.status === 'DISABLED' && <small className="badge badge-warning">{text('موقوف', 'Paused')}</small>}
          {device.pairingPending && <small className="badge badge-muted">{text('مستني الكود', 'Awaiting code')}</small>}</strong>
          <small>{device.branchName} · {device.status === 'REVOKED' ? text('ملغي', 'Revoked') : device.lastSeenAt ? text(`آخر استخدام ${formatRelative(device.lastSeenAt, language)}${device.lastUserName ? ` · ${device.lastUserName}` : ''}`, `Last used ${formatRelative(device.lastSeenAt, language)}${device.lastUserName ? ` · ${device.lastUserName}` : ''}`) : text('لسه متستخدمش', 'Not used yet')}</small></span>
        {device.status !== 'REVOKED' && <span className="pos-row">
          {device.status === 'ACTIVE' && <Button small variant="secondary" icon={<KeyIcon size={15} aria-hidden="true" />} onClick={() => newCode.mutate(device)} loading={newCode.isPending && newCode.variables?.id === device.id}>{text('كود ربط', 'Pairing code')}</Button>}
          <Button small variant="secondary" icon={device.status === 'ACTIVE' ? <PauseIcon size={15} aria-hidden="true" /> : <PlayIcon size={15} aria-hidden="true" />} onClick={() => toggle.mutate(device)} loading={toggle.isPending && toggle.variables?.id === device.id}>{device.status === 'ACTIVE' ? text('وقّف', 'Pause') : text('شغّل', 'Resume')}</Button>
          <Button small variant="secondary" onClick={() => setRevoking(device)}>{text('إلغاء', 'Revoke')}</Button>
        </span>}
      </li>)}</ul>)}
    {adding && <RegisterDialog mode={adding} onClose={() => setAdding(null)} onRegistered={setCurrent} onPairing={setPairing} />}
    <PairingDialog pairing={pairing} onClose={() => setPairing(null)} />
    <ConfirmDialog open={revoking !== null} title={text('تلغي الجهاز ده؟', 'Revoke this device?')} busy={revoke.isPending} confirmLabel={text('إلغاء الجهاز', 'Revoke')}
      description={text('الإلغاء نهائي: الجهاز مش هيقدر يبعت طلبات أو يدفع تاني، ولو عاوزه ترجّعه هتسجله من جديد. لو محتاج توقفه شوية استخدم «وقّف».', 'Revoking is final: the device can no longer send orders or payments; to use it again, register it anew. To stop it for a while, use Pause.')}
      onConfirm={() => revoking && revoke.mutate(revoking)} onCancel={() => setRevoking(null)} />
  </section>;
}

function RegisterDialog({ mode, onClose, onRegistered, onPairing }: { mode: 'here' | 'other'; onClose: () => void; onRegistered: (device: { id: string; name: string; key: string }) => void; onPairing: (pairing: PosPairing) => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const branches = useBranchList().branches.filter(branch => branch.isActive);
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const register = useMutation({
    mutationFn: () => posApi.registerDevice({ name: name.trim(), branchId, onThisDevice: mode === 'here' }),
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: ['pos'] });
      if (result.deviceKey) {
        const stored = { id: result.device.id, name: result.device.name, key: result.deviceKey };
        saveDevice(stored); onRegistered(stored);
        toast.success(text('الجهاز اتسجل، والمتصفح ده هيستخدمه.', 'Registered; this browser now uses it.'));
      } else if (result.pairing) {
        onPairing({ device: result.device, code: result.pairing.code, expiresAt: result.pairing.expiresAt });
      }
      onClose();
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  return <Dialog open onClose={onClose} size="small" title={mode === 'here' ? text('سجّل الجهاز ده', 'Register this device') : text('سجّل جهاز تاني', 'Register another device')} busy={register.isPending} onSubmit={() => { if (name.trim().length >= 2 && branchId) register.mutate(); }}
    footer={<><Button variant="secondary" onClick={onClose}>{text('إلغاء', 'Cancel')}</Button><Button type="submit" loading={register.isPending} disabled={name.trim().length < 2 || !branchId}>{mode === 'here' ? text('سجّل', 'Register') : text('اعمل كود ربط', 'Get a pairing code')}</Button></>}>
    <label className="field"><span className="field-label">{text('اسم الجهاز', 'Device name')}</span><input className="input" maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder={text('مثلًا: كاشير الصالة', 'e.g. Front counter')} data-autofocus /></label>
    <label className="field"><span className="field-label">{text('الفرع', 'Branch')}</span><select className="select" value={branchId} onChange={event => setBranchId(event.target.value)}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
    <p className="field-hint">{mode === 'here'
      ? text('المتصفح ده هيبقى جهاز كاشير. مفتاحه بيتحفظ فيه بس، ومحدش بيشوفه.', 'This browser becomes a POS device. Its key is kept in it only; nobody sees it.')
      : text(`هنديك كود من ٨ حروف، صالح ${POS_PAIRING_MINUTES} دقيقة. افتح رابط الكاشير على الجهاز التاني واكتبه.`, `You get an 8-character code, valid for ${POS_PAIRING_MINUTES} minutes. Open the cashier link on the other device and type it.`)}</p>
  </Dialog>;
}

/** The pairing code, shown once in large type, with where to type it. */
function PairingDialog({ pairing, onClose }: { pairing: PosPairing | null; onClose: () => void }) {
  const { text, language } = useLanguage();
  const link = `${window.location.origin}${CASHIER_PATH}`;
  return <Dialog open={pairing !== null} onClose={onClose} size="small" title={text('كود ربط الجهاز', 'Device pairing code')} footer={<Button onClick={onClose}>{text('تمام', 'Done')}</Button>}>
    {pairing && <div className="pos-pairing">
      <p className="pos-muted">{text(`للجهاز «${pairing.device.name}» · ${pairing.device.branchName}`, `For “${pairing.device.name}” · ${pairing.device.branchName}`)}</p>
      <p className="pos-pairing-code" dir="ltr" aria-label={pairing.code.split('').join(' ')}>{pairing.code.slice(0, 4)}<span>-</span>{pairing.code.slice(4)}</p>
      <ol className="pos-pairing-steps">
        <li>{text('على الجهاز الجديد افتح:', 'On the new device open:')} <bdi dir="ltr">{link}</bdi></li>
        <li>{text('ادخل بحساب الكاشير، واكتب الكود.', 'Sign in with the cashier account and type the code.')}</li>
      </ol>
      <p className="field-hint">{text(`الكود بيشتغل مرة واحدة، وبيخلص ${formatRelative(pairing.expiresAt, language)}.`, `The code works once and expires ${formatRelative(pairing.expiresAt, language)}.`)}</p>
    </div>}
  </Dialog>;
}
