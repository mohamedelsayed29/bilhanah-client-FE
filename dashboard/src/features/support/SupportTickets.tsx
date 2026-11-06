import { type ChangeEvent, type FormEvent, useEffect, useId, useState } from 'react';
import { useLocation } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightIcon, CheckCircleIcon, ImageIcon, LockSimpleIcon, PaperclipIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import {
  type CustomerTicket, SUPPORT_LIMITS, SUPPORT_TOPICS, type SupportTopic, TICKET_PRIORITIES, type TicketAttachment, type TicketPriority, type TicketSummary,
} from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { useProtectedImage } from '../../components/ProtectedImage';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { supportApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { formatRelative } from '../../lib/format';
import { useLanguage } from '../../lib/language';
import type { Handoff } from './AssistantChat';
import { moduleOf, NOTIFICATION_LABELS, PRIORITY_LABELS, STATUS_LABELS, TOPIC_LABELS, topicOf } from './labels';

export const ticketsKey = ['support', 'tickets'] as const;
export const notificationsKey = ['support', 'notifications'] as const;
const ticketKey = (id: string) => ['support', 'ticket', id] as const;

export function StatusPill({ status }: { status: TicketSummary['status'] }) {
  const { text } = useLanguage();
  return <span className={`support-status is-${status.toLowerCase().replace(/_/g, '-')}`} data-testid="ticket-status">{text(...STATUS_LABELS[status])}</span>;
}

/** The restaurant's tickets, with the latest support updates on top. */
export function TicketList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { text, language } = useLanguage();
  const tickets = useQuery({ queryKey: ticketsKey, queryFn: () => supportApi.tickets(), refetchInterval: 60_000, staleTime: 0 });
  const notifications = useQuery({ queryKey: notificationsKey, queryFn: supportApi.notifications, staleTime: 0 });
  const updates = (notifications.data?.items ?? []).filter(item => !item.read && NOTIFICATION_LABELS[item.kind]);
  return <div className="support-tickets">
    <div className="support-tickets-head">
      <p>{text('تذاكرك مع فريق الدعم', 'Your tickets with our support team')}</p>
      <Button small icon={<PlusIcon size={16} aria-hidden="true" />} onClick={onNew}>{text('تذكرة جديدة', 'New ticket')}</Button>
    </div>
    {updates.length > 0 && <ul className="support-updates" aria-label={text('تحديثات جديدة', 'New updates')}>
      {updates.map(item => <li key={item.id}><button type="button" onClick={() => onOpen(item.ticketId)} data-testid="support-update">
        <span className="support-dot" aria-hidden="true" />
        <span><strong>{text(...NOTIFICATION_LABELS[item.kind]!)}</strong><small><bdi>{item.reference}</bdi> · <bdi>{item.subject}</bdi></small></span>
      </button></li>)}
    </ul>}
    {tickets.isPending ? <div role="status" aria-label={text('بنحمّل التذاكر', 'Loading tickets')}><Skeleton height={60} /><Skeleton height={60} /></div>
      : tickets.isError ? <div className="support-state" role="alert"><p>{errorMessage(tickets.error, text)}</p><Button small variant="secondary" onClick={() => void tickets.refetch()}>{text('حاول تاني', 'Try again')}</Button></div>
        : tickets.data.items.length === 0 ? <div className="support-state"><p>{text('مفيش تذاكر لسه. لو المساعد مقدرش يجاوبك، افتح تذكرة وفريقنا هيرد عليك.', 'No tickets yet. If the assistant cannot answer you, open a ticket and our team will reply.')}</p></div>
          : <ul className="support-ticket-list">
            {tickets.data.items.map(ticket => <li key={ticket.id}><button type="button" onClick={() => onOpen(ticket.id)} data-testid="support-ticket-row" data-unread={ticket.unread || undefined}>
              <span className="support-ticket-row-top"><bdi className="support-ref">{ticket.reference}</bdi><StatusPill status={ticket.status} />{ticket.unread && <span className="support-dot" aria-label={text('رد جديد', 'New reply')} />}</span>
              <strong><bdi>{ticket.subject}</bdi></strong>
              <small>{text(...TOPIC_LABELS[ticket.topic])} · {formatRelative(ticket.lastActivityAt, language)}</small>
            </button></li>)}
          </ul>}
  </div>;
}

/** Image attachments chosen for a ticket or a reply, uploaded as soon as they are picked. */
function useAttachments() {
  const { text } = useLanguage();
  const [items, setItems] = useState<{ key: string; name: string; preview: string; attachment?: TicketAttachment; error?: string }[]>([]);
  useEffect(() => () => { for (const item of items) URL.revokeObjectURL(item.preview); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const add = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, SUPPORT_LIMITS.attachments - items.length);
    event.target.value = '';
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      const tooBig = file.size > SUPPORT_LIMITS.attachmentBytes;
      setItems(current => [...current, { key, name: file.name, preview: URL.createObjectURL(file), ...(tooBig && { error: text('الصورة أكبر من ٨ ميجا', 'The image is over 8 MB') }) }]);
      if (tooBig) continue;
      supportApi.upload(file).then(
        attachment => setItems(current => current.map(item => (item.key === key ? { ...item, attachment } : item))),
        (error: unknown) => setItems(current => current.map(item => (item.key === key ? { ...item, error: errorMessage(error, text) } : item))),
      );
    }
  };
  const remove = (key: string) => setItems(current => current.filter(item => {
    if (item.key === key) URL.revokeObjectURL(item.preview);
    return item.key !== key;
  }));
  return {
    items, add, remove,
    ids: items.flatMap(item => (item.attachment ? [item.attachment.id] : [])),
    uploading: items.some(item => !item.attachment && !item.error),
    full: items.length >= SUPPORT_LIMITS.attachments,
    reset: () => { for (const item of items) URL.revokeObjectURL(item.preview); setItems([]); },
  };
}

function AttachmentPicker({ files }: { files: ReturnType<typeof useAttachments> }) {
  const { text } = useLanguage();
  const id = useId();
  return <div className="support-attach">
    {files.items.length > 0 && <ul className="support-attach-list">
      {files.items.map(item => <li key={item.key} className={item.error ? 'has-error' : item.attachment ? '' : 'is-uploading'}>
        <img src={item.preview} alt="" />
        <span className="visually-hidden">{item.name}</span>
        {item.error && <small role="alert">{item.error}</small>}
        <button type="button" className="support-attach-remove" onClick={() => files.remove(item.key)} aria-label={text(`شيل ${item.name}`, `Remove ${item.name}`)}><XIcon size={12} /></button>
      </li>)}
    </ul>}
    {!files.full && <label htmlFor={id} className="support-chip">
      <PaperclipIcon size={15} aria-hidden="true" />{text('ضيف صورة', 'Add a screenshot')}
      <input id={id} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={files.add} className="visually-hidden" data-testid="support-attach-input" />
    </label>}
  </div>;
}

/** Opening a ticket: from the assistant (with the question that did not help) or from the tickets tab. */
export function NewTicket({ handoff, sessionId, onCreated, onCancel }: { handoff: Handoff; sessionId: string | null; onCreated: (ticket: CustomerTicket) => void; onCancel: () => void }) {
  const { text } = useLanguage();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const module = moduleOf(pathname);
  const [subject, setSubject] = useState(handoff.question ?? '');
  const [description, setDescription] = useState('');
  const [topic, setTopic] = useState<SupportTopic>(topicOf(module));
  const [priority, setPriority] = useState<TicketPriority>('NORMAL');
  const files = useAttachments();
  const ids = { subject: useId(), topic: useId(), priority: useId(), description: useId() };
  const create = useMutation({
    mutationFn: () => supportApi.create({
      subject, description, topic, priority, module, attachmentIds: files.ids,
      ...(handoff.faqArticleId && { faqArticleId: handoff.faqArticleId }), ...(sessionId && { assistantSessionId: sessionId }),
    }),
    onSuccess: ticket => {
      void queryClient.invalidateQueries({ queryKey: ticketsKey });
      void queryClient.invalidateQueries({ queryKey: ['support', 'session'] });
      queryClient.setQueryData(ticketKey(ticket.id), ticket);
      files.reset();
      onCreated(ticket);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (subject.trim() && description.trim() && !files.uploading) create.mutate();
  };
  return <form className="support-form" onSubmit={submit} noValidate>
    <button type="button" className="support-back" onClick={onCancel}><ArrowRightIcon size={15} className="directional" aria-hidden="true" />{text('رجوع', 'Back')}</button>
    <h3>{text('افتح تذكرة لفريق الدعم', 'Open a ticket for our support team')}</h3>
    <p className="muted">{text('اكتب المشكلة بالتفصيل، وفريق بالهنا هيرد عليك هنا.', 'Describe the issue in detail; the Bilhanah team will reply here.')}</p>
    {handoff.question && <p className="support-form-context">{text('عن السؤال:', 'About:')} <bdi>{handoff.question}</bdi></p>}
    <div className="field"><label htmlFor={ids.subject}>{text('عنوان المشكلة', 'Issue title')}</label>
      <input id={ids.subject} className="input" value={subject} onChange={event => setSubject(event.target.value)} maxLength={SUPPORT_LIMITS.subject} required /></div>
    <div className="support-form-row">
      <div className="field"><label htmlFor={ids.topic}>{text('الموضوع', 'Category')}</label>
        <select id={ids.topic} className="select" value={topic} onChange={event => setTopic(event.target.value as SupportTopic)}>
          {SUPPORT_TOPICS.map(value => <option key={value} value={value}>{text(...TOPIC_LABELS[value])}</option>)}
        </select></div>
      <div className="field"><label htmlFor={ids.priority}>{text('الأهمية', 'Priority')}</label>
        <select id={ids.priority} className="select" value={priority} onChange={event => setPriority(event.target.value as TicketPriority)}>
          {TICKET_PRIORITIES.map(value => <option key={value} value={value}>{text(...PRIORITY_LABELS[value])}</option>)}
        </select></div>
    </div>
    <div className="field"><label htmlFor={ids.description}>{text('التفاصيل', 'Details')}</label>
      <textarea id={ids.description} className="input textarea" rows={5} value={description} onChange={event => setDescription(event.target.value)} maxLength={SUPPORT_LIMITS.description} required
        placeholder={text('حصل إيه؟ في أنهي صفحة؟ وإيه اللي كنت متوقع يحصل؟', 'What happened, on which page, and what did you expect?')} /></div>
    <AttachmentPicker files={files} />
    {create.isError && <p className="support-inline-error" role="alert">{errorMessage(create.error, text)}</p>}
    <div className="support-form-actions">
      <Button type="submit" loading={create.isPending} disabled={!subject.trim() || !description.trim() || files.uploading} data-testid="support-ticket-submit">{text('ابعت التذكرة', 'Send ticket')}</Button>
      <Button variant="ghost" onClick={onCancel}>{text('إلغاء', 'Cancel')}</Button>
    </div>
  </form>;
}

function AttachmentThumb({ attachment }: { attachment: TicketAttachment }) {
  const { text } = useLanguage();
  const image = useProtectedImage(attachment.url);
  return <li className="support-thumb">
    {image.url
      ? <a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={text('صورة مرفقة', 'Attached screenshot')} /></a>
      : <span className="support-thumb-empty"><ImageIcon size={20} aria-hidden="true" /></span>}
  </li>;
}

/** One ticket: the conversation with support, a reply box, and reopening or closing it. */
export function TicketDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { text, language } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const ticket = useQuery({ queryKey: ticketKey(id), queryFn: () => supportApi.ticket(id), refetchInterval: 30_000, staleTime: 0 });
  const [body, setBody] = useState('');
  const files = useAttachments();
  const replyId = useId();
  // Opening the ticket reads its notifications on the server.
  useEffect(() => {
    if (ticket.isSuccess) {
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
      void queryClient.invalidateQueries({ queryKey: ticketsKey });
    }
  }, [ticket.isSuccess, ticket.dataUpdatedAt, queryClient]);
  const update = (data: CustomerTicket) => {
    queryClient.setQueryData(ticketKey(id), data);
    void queryClient.invalidateQueries({ queryKey: ticketsKey });
  };
  const reply = useMutation({
    mutationFn: () => supportApi.reply(id, { body, attachmentIds: files.ids }),
    onSuccess: data => { update(data); setBody(''); files.reset(); },
  });
  const status = useMutation({
    mutationFn: (next: 'OPEN' | 'CLOSED') => supportApi.setStatus(id, next),
    onSuccess: (data, next) => { update(data); toast.success(next === 'OPEN' ? text('التذكرة اتفتحت تاني', 'Ticket reopened') : text('التذكرة اتقفلت', 'Ticket closed')); },
    onError: error => toast.error(errorMessage(error, text)),
  });

  if (ticket.isPending) return <div className="support-detail" role="status" aria-label={text('بنحمّل التذكرة', 'Loading the ticket')}><Skeleton height={80} /><Skeleton height={160} /></div>;
  if (ticket.isError) {
    return <div className="support-state" role="alert">
      <button type="button" className="support-back" onClick={onBack}><ArrowRightIcon size={15} className="directional" aria-hidden="true" />{text('التذاكر', 'Tickets')}</button>
      <p>{errorMessage(ticket.error, text)}</p>
    </div>;
  }
  const data = ticket.data;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (body.trim() && !files.uploading) reply.mutate();
  };
  return <div className="support-detail" data-testid="support-ticket">
    <button type="button" className="support-back" onClick={onBack}><ArrowRightIcon size={15} className="directional" aria-hidden="true" />{text('التذاكر', 'Tickets')}</button>
    <header className="support-detail-head">
      <span className="support-ticket-row-top"><bdi className="support-ref" data-testid="ticket-reference">{data.reference}</bdi><StatusPill status={data.status} /></span>
      <h3><bdi>{data.subject}</bdi></h3>
      <small className="muted">{text(...TOPIC_LABELS[data.topic])} · {text(...PRIORITY_LABELS[data.priority])} · {formatRelative(data.createdAt, language)}</small>
    </header>
    <ol className="support-thread">
      <li className="support-msg is-customer">
        <span className="support-msg-author"><bdi>{data.requesterName}</bdi></span>
        <p>{data.description}</p>
        {data.attachments.length > 0 && <ul className="support-thumbs">{data.attachments.map(attachment => <AttachmentThumb key={attachment.id} attachment={attachment} />)}</ul>}
      </li>
      {data.messages.map(message => <li key={message.id} className={`support-msg ${message.side === 'AGENT' ? 'is-agent' : 'is-customer'}`} data-testid="support-msg">
        <span className="support-msg-author">{message.side === 'AGENT' ? text('فريق بالهنا', 'Bilhanah team') : <bdi>{message.authorName}</bdi>} · {formatRelative(message.createdAt, language)}</span>
        <p>{message.body}</p>
        {message.attachments.length > 0 && <ul className="support-thumbs">{message.attachments.map(attachment => <AttachmentThumb key={attachment.id} attachment={attachment} />)}</ul>}
      </li>)}
    </ol>
    {data.status === 'RESOLVED' && <p className="support-resolved"><CheckCircleIcon size={18} weight="fill" aria-hidden="true" />{text('فريق الدعم شايف إن المشكلة اتحلّت. لو لسه موجودة، افتح التذكرة تاني أو رد هنا.', 'Support marked this resolved. If the issue is still there, reopen the ticket or reply here.')}</p>}
    {data.status === 'CLOSED'
      ? <p className="support-closed"><LockSimpleIcon size={16} aria-hidden="true" />{text('التذكرة دي اتقفلت. لو عندك مشكلة جديدة افتح تذكرة جديدة.', 'This ticket is closed. Open a new one for a new issue.')}</p>
      : <form className="support-reply" onSubmit={submit}>
        <label htmlFor={replyId} className="visually-hidden">{text('ردك', 'Your reply')}</label>
        <textarea id={replyId} className="input textarea" rows={3} value={body} onChange={event => setBody(event.target.value)} maxLength={SUPPORT_LIMITS.reply}
          placeholder={text('اكتب ردك لفريق الدعم', 'Write your reply to support')} />
        <AttachmentPicker files={files} />
        {reply.isError && <p className="support-inline-error" role="alert">{errorMessage(reply.error, text)}</p>}
        <div className="support-form-actions">
          <Button type="submit" small loading={reply.isPending} disabled={!body.trim() || files.uploading} data-testid="support-reply-submit">{text('ابعت', 'Send')}</Button>
          {data.allowedStatuses.includes('OPEN') && <Button small variant="secondary" loading={status.isPending} onClick={() => status.mutate('OPEN')}>{text('افتحها تاني', 'Reopen')}</Button>}
          {data.allowedStatuses.includes('CLOSED') && <Button small variant="ghost" disabled={status.isPending} onClick={() => status.mutate('CLOSED')}>{text('اقفل التذكرة', 'Close ticket')}</Button>}
        </div>
      </form>}
  </div>;
}
