import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowCounterClockwiseIcon, CheckCircleIcon, HeadsetIcon, PaperPlaneRightIcon, RobotIcon } from '@phosphor-icons/react';
import { type AssistantSession, type LiveChat, SUPPORT_LIMITS } from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { supportApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { formatRelative } from '../../lib/format';
import { useLanguage } from '../../lib/language';
import { sessionKey } from './AssistantChat';
import { useSupportSocket } from './support-socket';

/** A person from the support team: their initial, or a headset until someone takes the chat. */
export function AgentAvatar({ name }: { name: string | null }) {
  return <span className="support-avatar-agent" aria-hidden="true">{name && name !== 'Bilhanah' ? name.trim().charAt(0).toUpperCase() : <HeadsetIcon size={15} weight="fill" />}</span>;
}

/** Three dots, as when someone is typing. */
export function Typing({ label }: { label: string }) {
  return <span className="support-typing-dots" role="status" aria-label={label}><span /><span /><span /></span>;
}

/** Handing the conversation to a person: the assistant, a line of moving dots, then a representative. */
export function TransferringView() {
  const { text } = useLanguage();
  return <div className="support-chat support-transfer" role="status" aria-live="polite" data-testid="support-transferring">
    <div className="support-transfer-art" aria-hidden="true">
      <span className="support-transfer-node is-bot"><RobotIcon size={22} weight="fill" /></span>
      <span className="support-transfer-line"><i /><i /><i /><i /><i /></span>
      <span className="support-transfer-node is-agent"><HeadsetIcon size={22} weight="fill" /><b /></span>
    </div>
    <strong>{text('جاري تحويلك إلى أحد ممثلي خدمة العملاء…', 'Transferring you to a customer service representative…')}</strong>
    <p>{text('ثواني وهيكون معاك حد من فريق بالهنا. خليك هنا.', 'Someone from the Bilhanah team will be with you shortly. Please stay here.')}</p>
  </div>;
}

/**
 * The live chat with the support team, alone on screen so nothing distracts: the customer's problem,
 * a typing indicator while a representative is being reached, then the conversation with them.
 */
export function LiveChatView({ sessionId, live, onRestart, restarting }: { sessionId: string; live: LiveChat; onRestart: () => void; restarting: boolean }) {
  const { text, language } = useLanguage();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  // The agent typing right now (over Socket.IO), shown as three dots for a few seconds.
  const [agentTyping, setAgentTyping] = useState<{ name: string | null; until: number } | null>(null);
  const socket = useSupportSocket({
    onTyping: event => { if (event.ticketId === live.ticketId && event.side === 'AGENT') setAgentTyping({ name: event.name, until: Date.now() + 4_000 }); },
    onUpdated: event => { if (event.ticketId === live.ticketId) setAgentTyping(null); },
  });
  useEffect(() => {
    if (!agentTyping) return;
    const timer = window.setTimeout(() => setAgentTyping(null), Math.max(0, agentTyping.until - Date.now()));
    return () => window.clearTimeout(timer);
  }, [agentTyping]);
  const list = useRef<HTMLDivElement>(null);
  const reply = useMutation({
    mutationFn: (body: string) => supportApi.liveReply(sessionId, body),
    onSuccess: data => { queryClient.setQueryData<AssistantSession>(sessionKey(language), data); setDraft(''); },
  });
  const count = live.messages.length;
  useEffect(() => {
    const box = list.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [count, live.state, agentTyping]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const body = draft.trim();
    if (body && !reply.isPending && live.state !== 'ENDED') reply.mutate(body);
  };
  const enter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
  };
  const agent = live.agentName && live.agentName !== 'Bilhanah' ? live.agentName : null;

  return <div className="support-chat support-live" data-testid="support-live" data-state={live.state}>
    <div className={`support-live-status is-${live.state.toLowerCase()}`}>
      <AgentAvatar name={agent} />
      <div>
        <strong>{live.state === 'WAITING' ? text('جاري التواصل مع خدمة العملاء…', 'Connecting you with customer service…')
          : live.state === 'LIVE' ? (agent ? text(`${agent} من فريق بالهنا معاك`, `${agent} from Bilhanah is with you`) : text('فريق بالهنا معاك', 'The Bilhanah team is with you'))
            : text('المحادثة انتهت', 'This chat has ended')}</strong>
        <small><span className="ltr">{live.reference}</span>{live.state === 'WAITING' && text(' · بنرد عادةً خلال دقايق', ' · We usually reply within minutes')}</small>
      </div>
    </div>

    <div ref={list} className="support-messages" aria-live="polite" aria-relevant="additions">
      <div className="support-bubble is-user"><span className="visually-hidden">{text('إنت:', 'You:')} </span>{live.problem.split('\n\n')[0]}</div>
      {live.messages.map(message => message.side === 'AGENT'
        ? <div key={message.id} className="support-row is-agent" data-testid="live-agent-message">
          <AgentAvatar name={message.authorName} />
          <div className="support-bubble is-agent">
            <span className="support-bubble-name">{message.authorName === 'Bilhanah' ? text('فريق بالهنا', 'Bilhanah team') : message.authorName}</span>
            <p>{message.body}</p>
          </div>
        </div>
        : <div key={message.id} className="support-bubble is-user" data-testid="live-customer-message"><p>{message.body}</p></div>)}
      {live.state === 'WAITING' && <div className="support-row is-agent">
        <AgentAvatar name={null} />
        <div className="support-bubble is-agent support-waiting">
          <Typing label={text('حد من خدمة العملاء هيرد عليك', 'A representative will reply')} />
        </div>
      </div>}
      {live.state === 'LIVE' && agentTyping && <div className="support-row is-agent" data-testid="live-agent-typing">
        <AgentAvatar name={agentTyping.name ?? agent} />
        <div className="support-bubble is-agent support-waiting"><Typing label={text(`${agentTyping.name ?? agent ?? 'فريق الدعم'} بيكتب…`, `${agentTyping.name ?? agent ?? 'Support'} is typing…`)} /></div>
      </div>}
      {live.state === 'ENDED' && <div className="support-live-ended">
        <CheckCircleIcon size={20} weight="fill" aria-hidden="true" />
        <p>{text('فريق الدعم قفل المحادثة دي. لو محتاج حاجة تانية ابدأ محادثة جديدة.', 'Support has closed this chat. Start a new conversation if you need anything else.')}</p>
        <Button small onClick={onRestart} loading={restarting} icon={<ArrowCounterClockwiseIcon size={16} aria-hidden="true" />} data-testid="live-restart">{text('محادثة جديدة', 'New conversation')}</Button>
      </div>}
      {reply.isError && <p className="support-inline-error" role="alert">{errorMessage(reply.error, text)}</p>}
    </div>

    {live.state !== 'ENDED' && <form className="support-footer support-live-composer" onSubmit={submit}>
      <label className="visually-hidden" htmlFor="support-live-input">{text('رسالتك لخدمة العملاء', 'Your message to customer service')}</label>
      <div className="support-composer">
        <textarea id="support-live-input" rows={1} value={draft} onChange={event => { setDraft(event.target.value); if (event.target.value) socket.typing(live.ticketId); }} onKeyDown={enter} maxLength={SUPPORT_LIMITS.reply}
          placeholder={live.state === 'WAITING' ? text('اكتب مشكلتك…', 'Describe your problem…') : text('اكتب رسالتك…', 'Type your message…')} />
        <button type="submit" className="support-send" disabled={!draft.trim() || reply.isPending} aria-label={text('ابعت', 'Send')}><PaperPlaneRightIcon size={17} weight="fill" /></button>
      </div>
      <small className="support-live-note">{text(`بدأت ${formatRelative(live.createdAt, language)} · التذكرة متسجلة في «تذاكري»`, `Started ${formatRelative(live.createdAt, language)} · Saved under “My tickets”`)}</small>
    </form>}
  </div>;
}
