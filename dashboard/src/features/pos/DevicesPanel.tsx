import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DesktopIcon, PlusIcon } from '@phosphor-icons/react';
import type { PosDevice } from '@bilhanah/contracts';
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
import { loadDevice, saveDevice } from './device';

/** The devices allowed to run the terminal: register (the key goes to this browser), rename, move, revoke. */
export function DevicesPanel() {
  const { text, language } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: ['pos', 'devices'], queryFn: posApi.devices });
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<PosDevice | null>(null);
  const [current, setCurrent] = useState(loadDevice);
  const revoke = useMutation({
    mutationFn: (device: PosDevice) => posApi.revokeDevice(device.id),
    onSuccess: device => {
      void queryClient.invalidateQueries({ queryKey: ['pos', 'devices'] });
      if (current?.id === device.id) { saveDevice(null); setCurrent(null); }
      toast.success(text('الجهاز اتلغى', 'Device revoked')); setRevoking(null);
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  return <section className="card pos-card" aria-labelledby="pos-devices">
    <header className="pos-card-head pos-row"><div><h2 id="pos-devices">{text('الأجهزة', 'Devices')}</h2>
      <p className="pos-muted">{text('سجّل الأجهزة اللي هتشغّل الكاشير (كمبيوتر، تابلت). كل طلب ودفعة بيتسجلوا باسم الجهاز، والجهاز الملغي مش هيقدر يبعت حاجة.', 'Register the devices that run the POS (a computer, a tablet). Orders and payments record the device, and a revoked one can send nothing.')}</p></div>
      <Button icon={<PlusIcon size={16} aria-hidden="true" />} onClick={() => setAdding(true)} data-testid="pos-device-add">{text('سجّل الجهاز ده', 'Register this device')}</Button></header>
    {current && <Alert kind="info">{text(`المتصفح ده متسجل كـ «${current.name}».`, `This browser is registered as “${current.name}”.`)}</Alert>}
    {devices.isError && <ErrorPanel error={devices.error} onRetry={() => void devices.refetch()} />}
    {devices.isPending && <Skeleton height={120} />}
    {devices.data && (devices.data.length === 0 ? <p className="pos-muted">{text('لسه مفيش أجهزة. الكاشير بيشتغل من غير جهاز متسجل كمان.', 'No devices yet. The POS also works without a registered device.')}</p>
      : <ul className="pos-list">{devices.data.map(device => <li key={device.id} className={device.status === 'REVOKED' ? 'is-off' : ''} data-testid="pos-device">
        <span className="pos-list-icon" aria-hidden="true"><DesktopIcon size={20} /></span>
        <span className="pos-list-main"><strong>{device.name}{current?.id === device.id && <small className="badge badge-info">{text('ده', 'This one')}</small>}</strong>
          <small>{device.branchName} · {device.status === 'REVOKED' ? text('ملغي', 'Revoked') : device.lastSeenAt ? text(`آخر استخدام ${formatRelative(device.lastSeenAt, language)}${device.lastUserName ? ` · ${device.lastUserName}` : ''}`, `Last used ${formatRelative(device.lastSeenAt, language)}${device.lastUserName ? ` · ${device.lastUserName}` : ''}`) : text('لسه متستخدمش', 'Not used yet')}</small></span>
        {device.status === 'ACTIVE' && <Button small variant="secondary" onClick={() => setRevoking(device)}>{text('إلغاء', 'Revoke')}</Button>}
      </li>)}</ul>)}
    {adding && <RegisterDialog onClose={() => setAdding(false)} onRegistered={setCurrent} />}
    <ConfirmDialog open={revoking !== null} title={text('تلغي الجهاز ده؟', 'Revoke this device?')} busy={revoke.isPending} confirmLabel={text('إلغاء الجهاز', 'Revoke')}
      description={text('الجهاز مش هيقدر يبعت طلبات أو يدفع تاني. طلباته القديمة بتفضل زي ما هي.', 'The device can no longer send orders or payments. Its past orders stay as they are.')}
      onConfirm={() => revoking && revoke.mutate(revoking)} onCancel={() => setRevoking(null)} />
  </section>;
}

function RegisterDialog({ onClose, onRegistered }: { onClose: () => void; onRegistered: (device: { id: string; name: string; key: string }) => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const branches = useBranchList().branches.filter(branch => branch.isActive);
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const register = useMutation({
    mutationFn: () => posApi.registerDevice({ name: name.trim(), branchId }),
    onSuccess: result => {
      const stored = { id: result.device.id, name: result.device.name, key: result.deviceKey };
      saveDevice(stored); onRegistered(stored);
      void queryClient.invalidateQueries({ queryKey: ['pos', 'devices'] });
      toast.success(text('الجهاز اتسجل، والمتصفح ده هيستخدمه.', 'Registered; this browser now uses it.')); onClose();
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  return <Dialog open onClose={onClose} size="small" title={text('سجّل الجهاز ده', 'Register this device')} busy={register.isPending} onSubmit={() => { if (name.trim().length >= 2 && branchId) register.mutate(); }}
    footer={<><Button variant="secondary" onClick={onClose}>{text('إلغاء', 'Cancel')}</Button><Button type="submit" loading={register.isPending} disabled={name.trim().length < 2 || !branchId}>{text('سجّل', 'Register')}</Button></>}>
    <label className="field"><span className="field-label">{text('اسم الجهاز', 'Device name')}</span><input className="input" maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder={text('مثلًا: كاشير الصالة', 'e.g. Front counter')} /></label>
    <label className="field"><span className="field-label">{text('الفرع', 'Branch')}</span><select className="select" value={branchId} onChange={event => setBranchId(event.target.value)}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
    <p className="field-hint">{text('افتح الصفحة دي من الجهاز نفسه. مفتاح الجهاز بيتحفظ في المتصفح ده بس.', 'Open this page on the device itself. Its key is saved in this browser only.')}</p>
  </Dialog>;
}
