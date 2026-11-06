import { useEffect, useId, useRef, useState } from 'react';
import { BellRingingIcon, BroomIcon, ChatCircleTextIcon, CheckCircleIcon, DropIcon, NoteIcon, ReceiptIcon, ScrollIcon, XIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { type PublicServiceRequest, SERVICE_REQUEST_LIMITS, type ServiceRequestStatus, type ServiceRequestType } from '@bilhanah/contracts';
import { ApiError } from '../../lib/api';
import { useLanguage } from '../../lib/language';
import { cancelServiceRequest, sendServiceRequest } from './service-api';
import type { TableService } from './use-table-service';
import './table-service.css';

const OPTIONS: { type: Exclude<ServiceRequestType, 'CUSTOM'>; ar: string; en: string; icon: Icon }[] = [
  { type: 'CALL_WAITER', ar: 'نادي الويتر', en: 'Call a waiter', icon: BellRingingIcon },
  { type: 'REQUEST_BILL', ar: 'الحساب', en: 'The bill', icon: ReceiptIcon },
  { type: 'REQUEST_WATER', ar: 'مية', en: 'Water', icon: DropIcon },
  { type: 'REQUEST_NAPKINS', ar: 'مناديل', en: 'Napkins', icon: ScrollIcon },
  { type: 'REQUEST_CLEANING', ar: 'تنضيف الترابيزة', en: 'Clean the table', icon: BroomIcon },
];
const NAMES: Record<ServiceRequestType, [string, string]> = {
  CALL_WAITER: ['نادي الويتر', 'Waiter'], REQUEST_BILL: ['الحساب', 'The bill'], REQUEST_WATER: ['مية', 'Water'],
  REQUEST_NAPKINS: ['مناديل', 'Napkins'], REQUEST_CLEANING: ['تنضيف الترابيزة', 'Table cleaning'], CUSTOM: ['طلب خاص', 'Request'],
};
const STATUS: Record<ServiceRequestStatus, [string, string]> = {
  PENDING: ['اتبعت، مستني الويتر', 'Sent, waiting for the staff'],
  ACKNOWLEDGED: ['الويتر شاف طلبك', 'The staff have seen it'],
  IN_PROGRESS: ['جاي لك', 'On its way'],
  COMPLETED: ['اتنفّذ', 'Done'],
  CANCELLED: ['اتلغى', 'Cancelled'],
};

/**
 * The table's service sheet: one tap to call a waiter or ask for the bill, water, napkins or
 * cleaning, a free note for anything else, and this table's requests with their live status.
 */
export function ServiceSheet({ service, tableName, onClose, onFeedback }: { service: TableService; tableName: string | null; onClose: () => void; onFeedback?: () => void }) {
  const { text, number } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [note, setNote] = useState('');
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState<ServiceRequestType | string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  const close = () => dialog.current?.close();

  const send = async (type: ServiceRequestType) => {
    if (!service.token) return;
    setBusy(type);
    setMessage(null);
    try {
      const sent = await sendServiceRequest(service.token, type, type === 'CUSTOM' ? note.trim() : undefined);
      service.upsert(sent.request);
      setMessage({ kind: 'ok', text: sent.duplicate ? text('طلبك ده لسه مفتوح، والويتر جاي لك.', 'You already asked for this; the staff are on it.') : text('وصل طلبك للمطعم.', 'Your request reached the staff.') });
      if (type === 'CUSTOM') { setNote(''); setWriting(false); }
    } catch (error) {
      setMessage({ kind: 'error', text: failure(error) });
    } finally {
      setBusy(null);
    }
  };
  const withdraw = async (request: PublicServiceRequest) => {
    if (!service.token) return;
    setBusy(request.id);
    try { service.upsert(await cancelServiceRequest(service.token, request.id)); }
    catch (error) { setMessage({ kind: 'error', text: failure(error) }); }
    finally { setBusy(null); }
  };
  function failure(error: unknown): string {
    if (error instanceof ApiError && error.code === 'SERVICE_REQUEST_THROTTLED') {
      const seconds = (error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 60;
      const wait = seconds >= 90 ? text(`${number(Math.ceil(seconds / 60))} دقيقة`, `${Math.ceil(seconds / 60)} min`) : text(`${number(seconds)} ثانية`, `${seconds} s`);
      return text(`لسه طالبه من شوية. تقدر تطلبه تاني بعد ${wait}.`, `You asked for this a moment ago. You can ask again in ${wait}.`);
    }
    if (error instanceof ApiError && error.code === 'TABLE_SESSION_INVALID') {
      service.rejoin();
      return text('جلسة الترابيزة خلصت. جرّب تاني بعد ثانية.', 'Your table session ended. Try again in a moment.');
    }
    if (error instanceof ApiError && error.code === 'SERVICE_REQUESTS_UNAVAILABLE') return text('المطعم مش بيستقبل طلبات خدمة دلوقتي.', 'The restaurant is not taking requests right now.');
    if (error instanceof ApiError && error.status === 0) return text('مفيش اتصال. اتأكد من النت وجرّب تاني.', 'No connection. Check your internet and try again.');
    return text('حصلت مشكلة. جرّب تاني.', 'Something went wrong. Try again.');
  }
  const openTypes = new Set(service.requests.filter(request => request.status === 'PENDING' || request.status === 'ACKNOWLEDGED' || request.status === 'IN_PROGRESS').map(request => request.type));

  return <dialog ref={dialog} className="dish-sheet order-sheet service-sheet" aria-labelledby={titleId} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="order-sheet-body">
      <header className="order-sheet-header">
        <h2 id={titleId}>{text('خدمة الترابيزة', 'Table service')}{tableName && <small className="service-sheet-table"> · <bdi>{tableName}</bdi></small>}</h2>
        <button type="button" className="icon-button" onClick={close} aria-label={text('إغلاق', 'Close')}><XIcon size={20} /></button>
      </header>
      <div className="order-sheet-content service-sheet-content">
        {!service.token && <p className="service-sheet-wait" role="status">{text('بنوصّل بالمطعم…', 'Connecting to the restaurant…')}</p>}
        <div className="service-options" role="group" aria-label={text('محتاج إيه؟', 'What do you need?')}>
          {OPTIONS.map(option => <button key={option.type} type="button" className={`service-option ${openTypes.has(option.type) ? 'is-open' : ''}`}
            disabled={!service.token || busy !== null} onClick={() => void send(option.type)} aria-describedby={openTypes.has(option.type) ? `${titleId}-${option.type}` : undefined}>
            <option.icon size={26} weight="duotone" aria-hidden="true" />
            <span>{text(option.ar, option.en)}</span>
            {openTypes.has(option.type) && <small id={`${titleId}-${option.type}`}>{text('مطلوب', 'Requested')}</small>}
          </button>)}
          <button type="button" className={`service-option ${writing ? 'is-open' : ''}`} disabled={!service.token || busy !== null} onClick={() => setWriting(value => !value)} aria-expanded={writing}>
            <NoteIcon size={26} weight="duotone" aria-hidden="true" /><span>{text('حاجة تانية', 'Something else')}</span>
          </button>
        </div>
        {writing && <form className="service-custom" onSubmit={event => { event.preventDefault(); if (note.trim()) void send('CUSTOM'); }}>
          <label htmlFor={`${titleId}-note`}>{text('اكتب طلبك', 'Write your request')}</label>
          <textarea id={`${titleId}-note`} maxLength={SERVICE_REQUEST_LIMITS.note} value={note} onChange={event => setNote(event.target.value)}
            placeholder={text('زي «كرسي أطفال» أو «شوكة زيادة»', 'For example “A high chair” or “An extra fork”')} />
          <button type="submit" className="service-send" disabled={!note.trim() || busy !== null}>{text('ابعت', 'Send')}</button>
        </form>}
        <div className="service-message-region" role="status" aria-live="polite">
          {message && <p className={`service-message is-${message.kind}`}>{message.kind === 'ok' && <CheckCircleIcon size={18} weight="fill" aria-hidden="true" />}{message.text}</p>}
        </div>
        {service.requests.length > 0 && <section className="service-mine" aria-labelledby={`${titleId}-mine`}>
          <h3 id={`${titleId}-mine`}>{text('طلبات الترابيزة', 'Your table’s requests')}</h3>
          <ul>
            {service.requests.map(request => <li key={request.id} className={`service-mine-row is-${request.status.toLowerCase()}`} data-testid="my-service-request" data-type={request.type.toLowerCase()}>
              <span className="service-mine-name">{text(...NAMES[request.type])}{request.note && <small><bdi>{request.note}</bdi></small>}</span>
              <span className="service-mine-status">{text(...STATUS[request.status])}</span>
              {request.status === 'PENDING' && <button type="button" className="service-mine-cancel" disabled={busy !== null} onClick={() => void withdraw(request)}>{text('الغي', 'Cancel')}</button>}
            </li>)}
          </ul>
        </section>}
        {/* The restaurant takes feedback without an order: from the table, about the visit. */}
        {onFeedback && <button type="button" className="service-feedback" onClick={onFeedback} aria-haspopup="dialog">
          <ChatCircleTextIcon size={20} aria-hidden="true" /><span>{text('قول رأيك في الزيارة', 'Share feedback about your visit')}</span>
        </button>}
      </div>
    </div>
  </dialog>;
}
