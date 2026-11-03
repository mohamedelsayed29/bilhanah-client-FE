import { useEffect, useRef, useState } from 'react';
import { ArrowClockwiseIcon, BellRingingIcon, CheckCircleIcon, ExportIcon, PlusSquareIcon, SpeakerHighIcon, SpinnerGapIcon, WarningCircleIcon } from '@phosphor-icons/react';
import type { OrderAlerts, OrderPushUpdates } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';
import { ApiError, fetchOrderAlerts, subscribeToOrder, unsubscribeFromOrder } from './order-api';
import { currentPushSubscription, pushSupport, subscribeToPush, unlockAudio } from './order-alerts';
import { loadPushEndpoint, loadPushUpdates, pushEndpointInUse, savePushEndpoint } from './ordering-storage';

const NO_ALERTS: OrderAlerts = { readyAlerts: false, push: null };

/** What the restaurant's plan offers on this order's page; null while loading. A failed request offers nothing. */
export function useOrderAlerts(token: string): OrderAlerts | null {
  const [alerts, setAlerts] = useState<OrderAlerts | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchOrderAlerts(token, controller.signal).then(setAlerts, () => { if (!controller.signal.aborted) setAlerts(NO_ALERTS); });
    return () => controller.abort();
  }, [token]);
  return alerts;
}

type Step = 'checking' | 'idle' | 'subscribing' | 'on' | 'unsubscribing' | 'denied' | 'failed-on' | 'failed-off';

/**
 * "Notify me when it's ready" on the tracking page, for plans with ready alerts and orders still
 * on their way. Web Push where the browser has it, the Home Screen steps on iPhone, and otherwise
 * a tap that lets the open page ring.
 */
export function ReadyAlerts({ token, publicKey }: { token: string; publicKey: string | null }) {
  const { language, text, number } = useLanguage();
  const [support] = useState(pushSupport);
  // The server can still say no (e.g. it lost its push keys): then the page rings instead.
  const [pushRefused, setPushRefused] = useState(false);
  const mode = support === 'push' && publicKey && !pushRefused ? 'push' : support === 'home-screen' && publicKey ? 'home-screen' : 'sound';
  const [step, setStep] = useState<Step>('checking');
  const [soundOn, setSoundOn] = useState(false);
  // Ready only, or every step; remembered with the subscription.
  const [updates, setUpdates] = useState<OrderPushUpdates>(() => loadPushUpdates(token));
  const [savingUpdates, setSavingUpdates] = useState(false);
  const message = useRef<HTMLParagraphElement>(null);
  const mainButton = useRef<HTMLButtonElement>(null);
  const acted = useRef(false);

  // Alerts turned on earlier stay on after a reload while the browser still has the subscription.
  useEffect(() => {
    if (mode !== 'push') return;
    let active = true;
    const endpoint = loadPushEndpoint(token);
    if (Notification.permission === 'denied') { setStep('denied'); return; }
    if (!endpoint || Notification.permission !== 'granted') { if (endpoint) savePushEndpoint(token, null); setStep('idle'); return; }
    currentPushSubscription().then(subscription => {
      if (!active) return;
      if (subscription?.endpoint === endpoint) { setStep('on'); return; }
      savePushEndpoint(token, null);
      setStep('idle');
    }, () => { if (active) setStep('idle'); });
    return () => { active = false; };
  }, [mode, token]);

  // A tap took the focused button away: move focus to what replaced it.
  useEffect(() => {
    if (!acted.current || step === 'subscribing' || step === 'unsubscribing') return;
    (step === 'idle' ? mainButton.current : message.current)?.focus();
  }, [step, soundOn]);

  const turnOn = async () => {
    acted.current = true;
    // Both need the tap itself, before anything async.
    unlockAudio();
    const permission = Notification.requestPermission().catch(() => 'default' as const);
    setStep('subscribing');
    const answer = await permission;
    if (answer === 'denied') { setStep('denied'); return; }
    if (answer !== 'granted') { setStep('idle'); return; }
    let endpoint: string | null = null;
    try {
      const subscription = await subscribeToPush(publicKey!);
      endpoint = subscription.endpoint;
      await subscribeToOrder(token, subscription.toJSON(), language, updates);
      savePushEndpoint(token, endpoint, updates);
      setStep('on');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PUSH_UNAVAILABLE') {
        if (endpoint && !pushEndpointInUse(endpoint)) void currentPushSubscription().then(subscription => subscription?.unsubscribe()).catch(() => undefined);
        setPushRefused(true);
        return;
      }
      setStep('failed-on');
    }
  };

  const turnOff = async () => {
    acted.current = true;
    const endpoint = loadPushEndpoint(token);
    setStep('unsubscribing');
    try {
      // An order the server already forgot has nothing left to turn off.
      if (endpoint) await unsubscribeFromOrder(token, endpoint).catch((error: unknown) => { if (!(error instanceof ApiError && error.status === 404)) throw error; });
      savePushEndpoint(token, null);
      // The browser keeps one subscription per site; drop it unless another order still uses it.
      if (endpoint && !pushEndpointInUse(endpoint)) {
        const subscription = await currentPushSubscription().catch(() => null);
        if (subscription?.endpoint === endpoint) await subscription.unsubscribe().catch(() => false);
      }
      setStep('idle');
    } catch {
      setStep('failed-off');
    }
  };

  // While alerts are on, the choice is saved on the same subscription right away.
  const changeUpdates = async (next: OrderPushUpdates) => {
    const previous = updates;
    setUpdates(next);
    if (step !== 'on') return;
    setSavingUpdates(true);
    try {
      const subscription = await currentPushSubscription();
      if (!subscription) throw new Error('No subscription');
      await subscribeToOrder(token, subscription.toJSON(), language, next);
      savePushEndpoint(token, subscription.endpoint, next);
    } catch {
      setUpdates(previous);
    } finally {
      setSavingUpdates(false);
    }
  };

  const updatesChoice = <label className="track-alerts-choice">
    <input type="checkbox" checked={updates === 'ALL'} disabled={savingUpdates || step === 'subscribing' || step === 'unsubscribing'}
      onChange={event => void changeUpdates(event.target.checked ? 'ALL' : 'READY')} />
    <span>{text('ابعتلي كمان لما المطعم يأكّده ويبدأ يحضّره', 'Also tell me when it is confirmed and being prepared')}</span>
  </label>;

  const turnOnSound = () => { acted.current = true; unlockAudio(); setSoundOn(true); };

  const soundButton = (label: string, className: string) => soundOn
    ? <p className="track-alerts-on" ref={message} tabIndex={-1}><CheckCircleIcon size={20} weight="fill" aria-hidden="true" /><span>{text('تمام، الصفحة دي هترن أول ما طلبك يجهز.', 'Done. This page will ring the moment your order is ready.')}</span></p>
    : <button ref={mainButton} type="button" className={className} onClick={turnOnSound}><SpeakerHighIcon size={20} aria-hidden="true" /><span>{label}</span></button>;

  let body;
  if (mode === 'push') {
    const working = step === 'subscribing' || step === 'checking';
    body = <>
      {(step === 'idle' || step === 'subscribing' || step === 'checking') && <>
        <p className="track-alerts-text">{text('هنبعتلك إشعار أول ما طلبك يجهز، حتى لو قفلت الصفحة.', 'We will send you a notification the moment your order is ready, even if you close this page.')}</p>
        <button ref={mainButton} type="button" className="order-button track-alerts-button" onClick={() => void turnOn()} disabled={working} aria-busy={step === 'subscribing'}>
          {step === 'subscribing' ? <SpinnerGapIcon className="track-alerts-spinner" size={20} aria-hidden="true" /> : <BellRingingIcon size={20} aria-hidden="true" />}
          <span>{step === 'subscribing' ? text('بنشغّل التنبيه…', 'Turning on alerts…') : text('نبّهني لما طلبي يجهز', 'Notify me when it’s ready')}</span>
        </button>
        {updatesChoice}
      </>}
      {(step === 'on' || step === 'unsubscribing') && <div className="track-alerts-row">
        <p className="track-alerts-on" ref={message} tabIndex={-1}><CheckCircleIcon size={20} weight="fill" aria-hidden="true" /><span>{text('هنبعتلك إشعار أول ما يجهز.', 'We will notify you the moment it is ready.')}</span></p>
        <button type="button" className="track-alerts-link" onClick={() => void turnOff()} disabled={step === 'unsubscribing'}>{step === 'unsubscribing' ? text('بنقفل التنبيه…', 'Turning off…') : text('اقفل التنبيه', 'Turn off')}</button>
      </div>}
      {(step === 'on' || step === 'unsubscribing') && updatesChoice}
      {step === 'denied' && <p className="order-alert track-alerts-alert" ref={message} tabIndex={-1}><WarningCircleIcon size={18} weight="fill" aria-hidden="true" /><span>{text(
        'الإشعارات مقفولة للموقع ده من إعدادات المتصفح. افتحها من الإعدادات، أو سيب الصفحة دي مفتوحة وهترن أول ما يجهز.',
        'Notifications are blocked for this site in your browser settings. Allow them there, or keep this page open and it will ring when your order is ready.',
      )}</span></p>}
      {(step === 'failed-on' || step === 'failed-off') && <div className="order-alert track-alerts-alert">
        <WarningCircleIcon size={18} weight="fill" aria-hidden="true" />
        <p ref={message} tabIndex={-1}>{step === 'failed-on'
          ? text('مقدرناش نشغّل التنبيه. اتأكد من النت وجرّب تاني.', 'We could not turn on alerts. Check your connection and try again.')
          : text('مقدرناش نقفل التنبيه. اتأكد من النت وجرّب تاني.', 'We could not turn off alerts. Check your connection and try again.')}</p>
        <button type="button" className="order-alert-action" onClick={() => void (step === 'failed-on' ? turnOn() : turnOff())}><ArrowClockwiseIcon size={15} aria-hidden="true" /> {text('حاول تاني', 'Try again')}</button>
      </div>}
    </>;
  } else if (mode === 'home-screen') {
    body = <>
      <p className="track-alerts-text">{text('عشان يوصلك إشعار حتى لو قفلت الصفحة، ضيفها للشاشة الرئيسية الأول:', 'To get a notification even with this page closed, add it to your Home Screen first:')}</p>
      <ol className="track-alerts-steps">
        <li><span className="track-alerts-step" aria-hidden="true">{number(1)}</span><span>{text('دوس على زرار المشاركة', 'Tap the Share button')} <ExportIcon className="track-alerts-inline-icon" size={18} aria-hidden="true" /></span></li>
        <li><span className="track-alerts-step" aria-hidden="true">{number(2)}</span><span>{text('اختار «إضافة إلى الشاشة الرئيسية»', 'Choose “Add to Home Screen”')} <PlusSquareIcon className="track-alerts-inline-icon" size={18} aria-hidden="true" /></span></li>
        <li><span className="track-alerts-step" aria-hidden="true">{number(3)}</span><span>{text('افتحها من الأيقونة الجديدة، وشغّل التنبيه من هناك', 'Open it from the new icon and turn on alerts there')}</span></li>
      </ol>
      {soundButton(text('أو شغّل الصوت وسيب الصفحة مفتوحة', 'Or turn on sound and keep this page open'), 'track-alerts-link')}
    </>;
  } else {
    body = <>
      <p className="track-alerts-text">{text('سيب الصفحة دي مفتوحة، وهترن وتهتز أول ما طلبك يجهز (لو موبايلك بيدعم ده).', 'Keep this page open and it will ring, and vibrate where supported, the moment your order is ready.')}</p>
      {soundButton(text('شغّل الصوت', 'Turn on sound'), 'order-button ghost track-alerts-button')}
    </>;
  }

  return <section className="track-card track-alerts" aria-labelledby="track-alerts">
    <div className="track-alerts-head">
      <span className="track-alerts-icon" aria-hidden="true"><BellRingingIcon size={22} weight="fill" /></span>
      <h2 id="track-alerts">{text('تنبيه لما طلبك يجهز', 'Ready alert')}</h2>
    </div>
    {/* Screen readers hear each change of state. */}
    <div className="track-alerts-body" aria-live="polite">{body}</div>
  </section>;
}
