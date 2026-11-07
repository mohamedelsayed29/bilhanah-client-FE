import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, BackspaceIcon, LockSimpleIcon, UserCircleIcon } from '@phosphor-icons/react';
import { POS_PIN_ERROR_CODES, POS_PIN_POLICY, type PosPinStaff } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { Skeleton } from '../../../components/Skeleton';
import { apiClient, isApiError } from '../../../lib/api';
import { posApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { formatDate } from '../../../lib/format';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { loadDevice } from '../device';
import './pin.css';

/**
 * Quick sign-in on a registered POS device: pick your name, type your PIN. The device key authorises the
 * screen; the server checks the PIN, the account and the branch, and locks after repeated wrong PINs.
 */
export function PinLoginPage() {
  const { text, language } = useLanguage();
  usePageTitle('دخول الكاشير', 'Cashier sign-in');
  const navigate = useNavigate();
  const device = loadDevice();
  const info = useQuery({ queryKey: ['pos', 'device', device?.key], queryFn: () => posApi.deviceInfo(device!.key), enabled: Boolean(device), retry: false });
  const [person, setPerson] = useState<PosPinStaff | null>(null);
  const [pin, setPin] = useState('');
  const login = useMutation({
    mutationFn: () => apiClient.pinLogin(device!.key, { userId: person!.id, pin }),
    onSuccess: () => navigate('/manager/terminal', { replace: true }),
    onError: () => setPin(''),
  });
  useEffect(() => { if (pin.length === POS_PIN_POLICY.length.max && !login.isPending) login.mutate(); }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps
  const press = (digit: string) => { if (pin.length < POS_PIN_POLICY.length.max) setPin(current => current + digit); };
  const lockedUntil = isApiError(login.error, POS_PIN_ERROR_CODES.POS_PIN_LOCKED) ? (login.error as { details?: { until?: string } }).details?.until : null;

  if (!device) {
    return <main className="pin-page"><section className="pin-card">
      <h1>{text('الجهاز ده مش متسجل للكاشير', 'This device is not registered for the POS')}</h1>
      <p className="pin-muted">{text('ادخل بحسابك العادي، والمدير يسجّل الجهاز أو يديك كود ربط.', 'Sign in with your account; a manager registers the device or gives you a pairing code.')}</p>
      <Link className="button button-primary" to="/login?next=%2Fmanager%2Fterminal">{text('دخول بالإيميل', 'Sign in with email')}</Link>
    </section></main>;
  }
  return <main className="pin-page">
    <section className="pin-card" aria-labelledby="pin-title">
      <header className="pin-head">
        <img src="/brand/bilhanah-mark.svg" alt="" width="40" height="40" />
        <div>
          <h1 id="pin-title">{info.data ? info.data.device.restaurantName : text('دخول الكاشير', 'Cashier sign-in')}</h1>
          {info.data && <p className="pin-muted">{info.data.device.name} · {info.data.device.branchName}</p>}
        </div>
      </header>
      {info.isPending && <Skeleton height={180} />}
      {info.isError && <ErrorPanel error={info.error} onRetry={() => void info.refetch()} />}
      {info.data && !person && <>
        <h2 className="pin-step">{text('مين بيشتغل؟', 'Who is working?')}</h2>
        {info.data.staff.length === 0
          ? <p className="pin-muted">{text('مفيش حد ليه PIN على الجهاز ده. صاحب المطعم بيحدد الـ PIN من الفريق.', 'Nobody has a PIN on this device yet. The owner sets PINs from Team.')}</p>
          : <ul className="pin-people">{info.data.staff.map(member => <li key={member.id}>
            <button type="button" onClick={() => { setPerson(member); setPin(''); login.reset(); }} disabled={member.locked}>
              <UserCircleIcon size={34} weight="duotone" aria-hidden="true" />
              <span><bdi>{member.fullName}</bdi>{member.locked && <small><LockSimpleIcon size={12} aria-hidden="true" />{text('مقفول مؤقتًا', 'Locked for now')}</small>}</span>
            </button>
          </li>)}</ul>}
      </>}
      {info.data && person && <form className="pin-entry" onSubmit={event => { event.preventDefault(); if (pin.length >= POS_PIN_POLICY.length.min) login.mutate(); }}>
        <button type="button" className="pin-back" onClick={() => { setPerson(null); setPin(''); login.reset(); }}><ArrowLeftIcon size={16} className="directional" aria-hidden="true" />{text('مش أنا', 'Not me')}</button>
        <h2 className="pin-step"><bdi>{person.fullName}</bdi></h2>
        <div className="pin-dots" aria-label={text(`${pin.length} أرقام`, `${pin.length} digits`)}>{Array.from({ length: POS_PIN_POLICY.length.max }, (_, index) => <i key={index} className={index < pin.length ? 'is-on' : ''} />)}</div>
        {login.isError && <Alert kind="error">{lockedUntil
          ? text(`محاولات غلط كتير. جرّب تاني الساعة ${formatDate(lockedUntil, language, { timeStyle: 'short' })}، أو اطلب PIN جديد من المدير.`, `Too many wrong PINs. Try again at ${formatDate(lockedUntil, language, { timeStyle: 'short' })}, or ask a manager for a new PIN.`)
          : errorMessage(login.error, text)}</Alert>}
        <div className="pin-pad" dir="ltr">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => <button key={digit} type="button" onClick={() => press(digit)} disabled={login.isPending}>{digit}</button>)}
          <button type="button" onClick={() => setPin(current => current.slice(0, -1))} aria-label={text('امسح رقم', 'Delete a digit')}><BackspaceIcon size={22} aria-hidden="true" /></button>
          <button type="button" onClick={() => press('0')} disabled={login.isPending}>0</button>
          <button type="submit" className="is-go" disabled={pin.length < POS_PIN_POLICY.length.min || login.isPending}>{text('دخول', 'Go')}</button>
        </div>
      </form>}
      <p className="pin-foot"><Link to="/login?next=%2Fmanager%2Fterminal">{text('دخول بالإيميل وكلمة السر', 'Sign in with email and password')}</Link></p>
    </section>
  </main>;
}
