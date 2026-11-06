import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChatCircleDotsIcon, XIcon } from '@phosphor-icons/react';
import type { AssistantSession } from '@bilhanah/contracts';
import { useToast } from '../../components/Toast';
import { supportApi } from '../../lib/api/endpoints';
import { useLanguage } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';
import { AssistantChat, type Handoff, sessionKey } from './AssistantChat';
import { useSupportSocket } from './support-socket';
import { NewTicket, notificationsKey, TicketDetail, TicketList, ticketsKey } from './SupportTickets';

type Screen = { tab: 'assistant' } | { tab: 'tickets' } | { tab: 'new'; handoff: Handoff; from: 'assistant' | 'tickets' } | { tab: 'ticket'; id: string };

const OPEN_KEY = 'bilhanah:support-open:v1';
function readOpen(): boolean {
  try { return sessionStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
}
function writeOpen(open: boolean) {
  try { sessionStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* The panel simply starts closed. */ }
}

/** The support assistant, on every dashboard page of anyone with support.use. */
export function SupportWidget() {
  const { can } = useWorkspace();
  return can('support.use') ? <SupportLauncher /> : null;
}

/**
 * A round button with the count of unread support updates, opening a chat panel beside the page. The
 * panel stays mounted with the layout, so the conversation and the open screen survive navigation.
 */
function SupportLauncher() {
  const { text, language, number } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(readOpen);
  const [screen, setScreen] = useState<Screen>({ tab: 'assistant' });
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const notifications = useQuery({ queryKey: notificationsKey, queryFn: supportApi.notifications, refetchInterval: 30_000, refetchOnWindowFocus: true, staleTime: 0 });
  const unread = notifications.data?.unread ?? 0;
  // Replies, status changes and live-chat messages arrive over Socket.IO: refresh what is on screen.
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['support'] });
  useSupportSocket({ onUpdated: refresh, onConnect: refresh });

  const toggle = (next: boolean) => {
    setOpen(next);
    writeOpen(next);
    if (!next) launcher.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) toggle(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // A support reply arriving while the tickets are open shows up without waiting for the next poll.
  useEffect(() => { if (unread > 0) void queryClient.invalidateQueries({ queryKey: ticketsKey }); }, [unread, queryClient]);

  const session = queryClient.getQueryData<AssistantSession>(sessionKey(language));
  const tab = screen.tab === 'assistant' ? 'assistant' : 'tickets';
  const ticketCount = unread > 0 ? <span className="support-count" aria-label={text(`${number(unread)} تحديث جديد`, `${unread} new updates`)}>{number(unread)}</span> : null;

  return <>
    <button ref={launcher} type="button" className={`support-launcher${open ? ' is-open' : ''}`} onClick={() => toggle(!open)} aria-expanded={open} aria-controls="support-panel"
      data-testid="support-launcher" aria-label={open ? text('اقفل الدعم', 'Close support') : unread > 0 ? text(`الدعم: ${number(unread)} تحديث جديد`, `Support: ${unread} new updates`) : text('محتاج مساعدة؟', 'Need help?')}>
      {open ? <XIcon size={24} weight="bold" aria-hidden="true" /> : <ChatCircleDotsIcon size={26} weight="fill" aria-hidden="true" />}
      {!open && unread > 0 && <span className="support-launcher-badge" data-testid="support-unread" aria-hidden="true">{number(unread)}</span>}
    </button>
    {open && <section ref={panel} id="support-panel" className="support-panel" role="dialog" aria-modal="false" aria-labelledby="support-title" tabIndex={-1} data-testid="support-panel">
      <header className="support-panel-head">
        <span className="support-avatar" aria-hidden="true"><ChatCircleDotsIcon size={18} weight="fill" /></span>
        <div><h2 id="support-title">{text('دعم بالهنا', 'Bilhanah Support')}</h2><p><span className="support-online" aria-hidden="true" />{text('متاحين ٢٤ ساعة، ٧ أيام', 'Available 24/7')}</p></div>
        <button type="button" className="support-close" onClick={() => toggle(false)} aria-label={text('اقفل', 'Close')}><XIcon size={20} /></button>
      </header>
      <div className="support-tabs" role="tablist" aria-label={text('الدعم', 'Support')}>
        <button type="button" role="tab" aria-selected={tab === 'assistant'} onClick={() => setScreen({ tab: 'assistant' })}>{text('المساعد', 'Assistant')}</button>
        <button type="button" role="tab" aria-selected={tab === 'tickets'} onClick={() => setScreen({ tab: 'tickets' })} data-testid="support-tickets-tab">{text('تذاكري', 'My tickets')}{ticketCount}</button>
      </div>
      <div className="support-body" role="tabpanel">
        {screen.tab === 'assistant' && <AssistantChat onContact={handoff => setScreen({ tab: 'new', handoff, from: 'assistant' })} onOpenTicket={id => setScreen({ tab: 'ticket', id })} onNavigate={() => window.matchMedia('(max-width: 760px)').matches && toggle(false)} />}
        {screen.tab === 'tickets' && <TicketList onOpen={id => setScreen({ tab: 'ticket', id })} onNew={() => setScreen({ tab: 'new', handoff: {}, from: 'tickets' })} />}
        {screen.tab === 'new' && <NewTicket handoff={screen.handoff} sessionId={session?.id ?? null}
          onCreated={ticket => { toast.success(text(`اتفتحت التذكرة ${ticket.reference}`, `Ticket ${ticket.reference} opened`)); setScreen({ tab: 'ticket', id: ticket.id }); }}
          onCancel={() => setScreen({ tab: screen.from })} />}
        {screen.tab === 'ticket' && <TicketDetail id={screen.id} onBack={() => setScreen({ tab: 'tickets' })} />}
      </div>
    </section>}
  </>;
}
