import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BackspaceIcon, CheckCircleIcon, CornersOutIcon, LockKeyIcon, SignInIcon, SignOutIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { ATTENDANCE_ERROR_CODES, type KioskActivation, type KioskState, type PunchResult } from '@bilhanah/contracts';
import { Brand } from '../../components/Brand';
import { LanguageToggle } from '../../components/LanguageToggle';
import { API_URL } from '../../lib/config';
import { useLanguage, usePageTitle } from '../../lib/language';

const TOKEN_KEY = 'bilhanah:attendance-kiosk:v1';
/** After a result, the screen clears itself; idle input clears too. */
const RESULT_MS = 6_000;
const IDLE_MS = 30_000;

type ApiFailure = { status: number; code: string; message: string; details?: Record<string, unknown> };

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/** The kiosk's calls: its own token (never a user's session). */
async function kioskCall<T>(path: string, token: string | null, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}/v1/attendance-kiosk/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Accept: 'application/json', ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { 'X-Kiosk-Token': token }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const json = await response.json().catch(() => null) as { error?: ApiFailure } | T | null;
  if (!response.ok) {
    const error = (json as { error?: ApiFailure } | null)?.error;
    throw { status: response.status, code: error?.code ?? 'ERROR', message: error?.message ?? 'Something went wrong.', details: error?.details } satisfies ApiFailure;
  }
  return json as T;
}

type Step = { kind: 'pin' } | { kind: 'result'; result: PunchResult } | { kind: 'new-pin'; result: PunchResult; number: string; pin: string } | { kind: 'error'; message: string; locked?: number };

/**
 * The shared attendance screen at a branch: activated once with a code from the dashboard, then
 * employees type their number and PIN to check in or out (the server decides which). When the
 * branch uses the dynamic QR, it shows beside the keypad. It never opens the restaurant dashboard.
 */
export function KioskScreen() {
  const { text } = useLanguage();
  usePageTitle('كشك الحضور', 'Attendance kiosk');
  const [token, setToken] = useState<string | null>(readToken);
  const [state, setState] = useState<KioskState | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try { setState(await kioskCall<KioskState>('state', token)); setFailed(null); }
    catch (error) {
      const failure = error as ApiFailure;
      if (failure.code === ATTENDANCE_ERROR_CODES.KIOSK_UNAUTHORIZED) {
        try { localStorage.removeItem(TOKEN_KEY); } catch { /* Storage is optional. */ }
        setToken(null);
        setState(null);
      } else setFailed(text('مش قادرين نوصل للسيرفر. بنحاول تاني…', 'Cannot reach the server. Retrying…'));
    }
  }, [token, text]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Keep the screen awake where the browser allows it.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    if ('wakeLock' in navigator) void navigator.wakeLock.request('screen').then(value => { lock = value; }).catch(() => undefined);
    return () => { void lock?.release().catch(() => undefined); };
  }, []);

  return <div className="kiosk" data-testid="kiosk">
    <header className="kiosk-bar">
      <Brand inverse to="/attendance-kiosk" />
      {state && <div className="kiosk-place"><strong><bdi>{state.kiosk.restaurantName}</bdi></strong><span><bdi>{state.kiosk.branchName}</bdi> · <bdi>{state.kiosk.name}</bdi></span></div>}
      <WallClock />
      <LanguageToggle plain />
      <button type="button" className="kiosk-icon" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)} aria-label={text('ملء الشاشة', 'Full screen')}><CornersOutIcon size={22} /></button>
    </header>
    {failed && <p className="kiosk-banner" role="status">{failed}</p>}
    <main className="kiosk-main">
      {!token ? <Activate onActivated={(activation) => {
        try { localStorage.setItem(TOKEN_KEY, activation.token); } catch { /* The kiosk then needs activating again after a reload. */ }
        setToken(activation.token);
        setState(activation.state);
      }} /> : !state ? <span className="spinner" aria-hidden="true" /> : <Punch token={token} state={state} />}
    </main>
  </div>;
}

function WallClock() {
  const { language } = useLanguage();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 15_000); return () => window.clearInterval(timer); }, []);
  return <time className="kiosk-clock">{now.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-GB', { hour: 'numeric', minute: '2-digit' })}</time>;
}

function Activate({ onActivated }: { onActivated: (activation: KioskActivation) => void }) {
  const { text } = useLanguage();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try { onActivated(await kioskCall<KioskActivation>('activate', null, { code })); }
    catch (failure) { setError((failure as ApiFailure).code === ATTENDANCE_ERROR_CODES.KIOSK_CODE_INVALID ? text('الكود غلط أو انتهى. اعمل كود جديد من لوحة التحكم.', 'The code is wrong or expired. Create a new one in the dashboard.') : (failure as ApiFailure).message); }
    finally { setBusy(false); }
  };
  return <form className="kiosk-card kiosk-activate" onSubmit={event => { event.preventDefault(); if (code.length === 6) void submit(); }}>
    <LockKeyIcon size={40} aria-hidden="true" />
    <h1>{text('فعّل الكشك', 'Activate this kiosk')}</h1>
    <p>{text('من لوحة التحكم: الحضور ← أجهزة الحضور، اعمل كشك أو كود تفعيل، واكتبه هنا.', 'In the dashboard: Attendance → Devices, create a kiosk or an activation code, and type it here.')}</p>
    <input className="kiosk-code-input ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} aria-label={text('كود التفعيل', 'Activation code')} autoFocus />
    {error && <p className="kiosk-error" role="alert">{error}</p>}
    <button type="submit" className="kiosk-primary" disabled={code.length !== 6 || busy}>{busy ? <span className="spinner" aria-hidden="true" /> : text('فعّل', 'Activate')}</button>
  </form>;
}

function Punch({ token, state }: { token: string; state: KioskState }) {
  const { text, language } = useLanguage();
  const [number, setNumber] = useState('');
  const [pin, setPin] = useState('');
  const [field, setField] = useState<'number' | 'pin'>('number');
  const [step, setStep] = useState<Step>({ kind: 'pin' });
  const [busy, setBusy] = useState(false);
  const idle = useRef<number>(0);
  const kioskOn = state.methods.includes('KIOSK');

  const reset = useCallback(() => { setNumber(''); setPin(''); setField('number'); setStep({ kind: 'pin' }); }, []);
  // Clear after a result, and after a while without input.
  useEffect(() => {
    window.clearTimeout(idle.current);
    if (step.kind === 'result' || step.kind === 'error') idle.current = window.setTimeout(reset, RESULT_MS);
    else if (number || pin) idle.current = window.setTimeout(reset, IDLE_MS);
    return () => window.clearTimeout(idle.current);
  }, [step, number, pin, reset]);

  const press = (key: string) => {
    if (step.kind === 'result' || step.kind === 'error') reset();
    const update = field === 'number' ? setNumber : setPin;
    const max = field === 'number' ? 12 : 6;
    if (key === 'back') update(value => value.slice(0, -1));
    else update(value => (value.length < max ? value + key : value));
  };
  const submit = async () => {
    if (field === 'number') { if (number) setField('pin'); return; }
    if (pin.length < 4) return;
    setBusy(true);
    try {
      const result = await kioskCall<PunchResult>('punch', token, { employeeNumber: number, pin, idempotencyKey: crypto.randomUUID() });
      setStep(result.mustChangePin ? { kind: 'new-pin', result, number, pin } : { kind: 'result', result });
      setNumber(''); setPin(''); setField('number');
    } catch (failure) {
      const error = failure as ApiFailure;
      const locked = error.code === ATTENDANCE_ERROR_CODES.KIOSK_LOCKED ? Number(error.details?.['retryAfterSeconds'] ?? 300) : undefined;
      setStep({ kind: 'error', message: error.code === ATTENDANCE_ERROR_CODES.PIN_INVALID ? text('رقم الموظف أو الـ PIN غلط.', 'Wrong employee number or PIN.') : error.message, ...(locked && { locked }) });
      setPin('');
    } finally { setBusy(false); }
  };
  const time = (iso: string) => new Date(iso).toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-GB', { hour: 'numeric', minute: '2-digit' });

  return <div className={`kiosk-layout ${state.qr ? 'has-qr' : ''}`}>
    {kioskOn && <section className="kiosk-card kiosk-pad" aria-label={text('سجّل بالـ PIN', 'Check in with your PIN')}>
      {step.kind === 'result' ? <div className={`kiosk-result ${step.result.action === 'CHECK_IN' ? 'is-in' : 'is-out'}`} role="status" data-testid="kiosk-result">
        <CheckCircleIcon size={72} weight="fill" aria-hidden="true" />
        <h1>{step.result.action === 'CHECK_IN' ? text(`أهلًا ${step.result.employeeName}`, `Welcome, ${step.result.employeeName}`) : text(`مع السلامة ${step.result.employeeName}`, `Goodbye, ${step.result.employeeName}`)}</h1>
        <p>{step.result.action === 'CHECK_IN' ? text(`اتسجّل حضورك ${time(step.result.at)}`, `Checked in at ${time(step.result.at)}`) : text(`اتسجّل انصرافك ${time(step.result.at)}`, `Checked out at ${time(step.result.at)}`)}</p>
        {step.result.record.lateMinutes > 0 && step.result.action === 'CHECK_IN' && <p className="kiosk-late">{text(`متأخر ${step.result.record.lateMinutes} دقيقة`, `${step.result.record.lateMinutes} minutes late`)}</p>}
      </div> : step.kind === 'new-pin' ? <NewPin token={token} number={step.number} pin={step.pin} onDone={() => setStep({ kind: 'result', result: step.result })} />
        : <>
          <h1>{text('سجّل حضورك أو انصرافك', 'Check in or out')}</h1>
          <div className="kiosk-fields">
            <button type="button" className={`kiosk-field ${field === 'number' ? 'is-active' : ''}`} onClick={() => setField('number')} data-testid="kiosk-number">
              <span>{text('رقم الموظف', 'Employee number')}</span><strong className="ltr">{number || '—'}</strong>
            </button>
            <button type="button" className={`kiosk-field ${field === 'pin' ? 'is-active' : ''}`} onClick={() => number && setField('pin')} disabled={!number} data-testid="kiosk-pin">
              <span>PIN</span><strong className="ltr" aria-label={text(`${pin.length} أرقام`, `${pin.length} digits`)}>{pin ? '●'.repeat(pin.length) : '—'}</strong>
            </button>
          </div>
          {step.kind === 'error' && <p className="kiosk-error" role="alert"><WarningCircleIcon size={20} weight="fill" aria-hidden="true" />{step.message}{step.locked ? text(` (حاول بعد ${Math.ceil(step.locked / 60)} دقيقة)`, ` (try again in ${Math.ceil(step.locked / 60)} min)`) : ''}</p>}
          <div className="kiosk-keys ltr">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key => <button key={key} type="button" onClick={() => press(key)}>{key}</button>)}
            <button type="button" onClick={() => press('back')} aria-label={text('امسح', 'Delete')}><BackspaceIcon size={26} /></button>
            <button type="button" onClick={() => press('0')}>0</button>
            <button type="button" className="kiosk-go" onClick={() => void submit()} disabled={busy || (field === 'number' ? !number : pin.length < 4)} data-testid="kiosk-submit">
              {busy ? <span className="spinner" aria-hidden="true" /> : field === 'number' ? text('التالي', 'Next') : <><SignInIcon size={20} aria-hidden="true" /><SignOutIcon size={20} aria-hidden="true" /></>}
            </button>
          </div>
        </>}
    </section>}
    {state.qr && <section className="kiosk-card kiosk-qr" aria-label={text('امسح الكود', 'Scan the code')}>
      <QRCodeSVG value={state.qr.url} size={280} level="M" marginSize={2} />
      <p>{text('أو امسح الكود بموبايلك وانت داخل حسابك.', 'Or scan with your phone, signed in.')}</p>
    </section>}
    {!kioskOn && !state.qr && <section className="kiosk-card"><h1>{text('الكشك مش مفعّل في الفرع ده', 'The kiosk is not enabled at this branch')}</h1></section>}
  </div>;
}

function NewPin({ token, number, pin, onDone }: { token: string; number: string; pin: string; onDone: () => void }) {
  const { text } = useLanguage();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try { await kioskCall('pin', token, { employeeNumber: number, pin, newPin: value }); onDone(); }
    catch (failure) { setError((failure as ApiFailure).message); }
  };
  return <form className="kiosk-new-pin" onSubmit={event => { event.preventDefault(); if (/^\d{4,6}$/.test(value)) void save(); }}>
    <h1>{text('اختار PIN جديد', 'Choose a new PIN')}</h1>
    <p>{text('الـ PIN بتاعك اتعمله reset، فاختار واحد تفتكره (٤ لـ ٦ أرقام).', 'Your PIN was reset; choose one you will remember (4 to 6 digits).')}</p>
    <input className="kiosk-code-input ltr" type="password" inputMode="numeric" maxLength={6} value={value} onChange={event => setValue(event.target.value.replace(/\D/g, ''))} autoFocus aria-label={text('PIN جديد', 'New PIN')} />
    {error && <p className="kiosk-error" role="alert">{error}</p>}
    <button type="submit" className="kiosk-primary" disabled={!/^\d{4,6}$/.test(value)}>{text('احفظ', 'Save')}</button>
    <button type="button" className="kiosk-link" onClick={onDone}>{text('بعدين', 'Later')}</button>
  </form>;
}
