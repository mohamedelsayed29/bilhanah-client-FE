import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DesktopIcon, KeyIcon, LinkSimpleIcon } from '@phosphor-icons/react';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { posApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { useLanguage } from '../../../lib/language';
import { useBranchList, useWorkspace } from '../../branches/workspace';
import { saveDevice, type StoredDevice } from '../device';

/**
 * Shown instead of the terminal until this browser is a registered POS device. Whoever manages the POS
 * registers it here; a cashier types the one-time pairing code a manager gave them.
 */
export function DeviceGate({ onReady, revoked }: { onReady: (device: StoredDevice) => void; revoked: boolean }) {
  const { text } = useLanguage();
  const { can } = useWorkspace();
  const queryClient = useQueryClient();
  const manage = can('pos.settings');
  const branches = useBranchList().branches.filter(branch => branch.isActive);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const keep = (result: { device: { id: string; name: string; branchId: string }; deviceKey: string | null }) => {
    if (!result.deviceKey) return;
    const stored = { id: result.device.id, name: result.device.name, key: result.deviceKey, branchId: result.device.branchId };
    saveDevice(stored);
    void queryClient.invalidateQueries({ queryKey: ['pos'] });
    onReady(stored);
  };
  const pair = useMutation({ mutationFn: () => posApi.pair(code.replace(/[^A-Za-z0-9]/g, '')), onSuccess: keep });
  const register = useMutation({ mutationFn: () => posApi.registerDevice({ name: name.trim(), branchId, onThisDevice: true }), onSuccess: keep });
  const cleaned = code.replace(/[^A-Za-z0-9]/g, '');
  return <div className="pt-gate">
    <section className="card pt-gate-card" aria-labelledby="pt-gate-title">
      <span className="pt-gate-icon" aria-hidden="true"><DesktopIcon size={30} weight="duotone" /></span>
      <h2 id="pt-gate-title">{revoked ? text('الجهاز ده اتوقف أو اتلغى', 'This device was paused or revoked') : text('الجهاز ده مش متسجل للكاشير', 'This device is not registered for the POS')}</h2>
      <p className="pt-muted">{text('الكاشير بيشتغل على الأجهزة المسجّلة للمطعم بس، عشان كل طلب ودفعة يتسجلوا على جهاز معروف.', 'The POS runs only on the restaurant’s registered devices, so every order and payment is recorded against a known device.')}</p>

      <form className="pt-gate-block" onSubmit={event => { event.preventDefault(); if (cleaned.length === 8) pair.mutate(); }}>
        <h3><KeyIcon size={18} aria-hidden="true" />{text('عندك كود ربط؟', 'Have a pairing code?')}</h3>
        <p className="pt-muted">{text('المدير بيطلّعه من صفحة الكاشير ← الأجهزة ← «جهاز تاني».', 'A manager gets it from POS → Devices → “Another device”.')}</p>
        <div className="pt-gate-row">
          <input className="input ltr-input pt-code" dir="ltr" autoComplete="off" autoCapitalize="characters" maxLength={9} placeholder="ABCD-1234" value={code} onChange={event => setCode(event.target.value.toUpperCase())} aria-label={text('كود الربط', 'Pairing code')} />
          <Button type="submit" loading={pair.isPending} disabled={cleaned.length !== 8}>{text('اربط الجهاز', 'Pair device')}</Button>
        </div>
        {pair.isError && <Alert kind="error">{errorMessage(pair.error, text)}</Alert>}
      </form>

      {manage && <form className="pt-gate-block" onSubmit={event => { event.preventDefault(); if (name.trim().length >= 2 && branchId) register.mutate(); }}>
        <h3><LinkSimpleIcon size={18} aria-hidden="true" />{text('أو سجّله دلوقتي', 'Or register it now')}</h3>
        <div className="pt-gate-row">
          <input className="input" maxLength={60} placeholder={text('اسم الجهاز، مثلًا: كاشير الصالة', 'Device name, e.g. Front counter')} value={name} onChange={event => setName(event.target.value)} aria-label={text('اسم الجهاز', 'Device name')} />
          {branches.length > 1 && <select className="select" value={branchId} onChange={event => setBranchId(event.target.value)} aria-label={text('الفرع', 'Branch')}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}
          <Button type="submit" variant="secondary" loading={register.isPending} disabled={name.trim().length < 2 || !branchId}>{text('سجّل', 'Register')}</Button>
        </div>
        {register.isError && <Alert kind="error">{errorMessage(register.error, text)}</Alert>}
      </form>}
    </section>
  </div>;
}
