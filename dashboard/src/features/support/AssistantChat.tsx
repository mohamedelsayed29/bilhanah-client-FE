import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowCounterClockwiseIcon, ArrowRightIcon, CaretLeftIcon, CheckCircleIcon, HeadsetIcon, HouseSimpleIcon, RobotIcon, MagnifyingGlassIcon, PaperPlaneRightIcon, ThumbsDownIcon, ThumbsUpIcon,
} from '@phosphor-icons/react';
import type { AssistantBlock, AssistantInput, AssistantMessage, AssistantSession, FaqArticleSummary } from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { Skeleton } from '../../components/Skeleton';
import { supportApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage } from '../../lib/language';
import { categoryIcon } from './labels';
import { LiveChatView, TransferringView, Typing } from './LiveChatView';
import { RichText } from './RichText';

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
/** How long the transfer animation shows before the live chat. */
const TRANSFER_MS = 3_000;

export const sessionKey = (language: string) => ['support', 'session', language] as const;

/** Where "Contact support" was asked from: the answer that did not help, if any. */
export type Handoff = { faqArticleId?: string; question?: string };

/** The FAQ assistant: the conversation (kept on the server, so it survives page changes and reloads), search and the hand-off to support. */
export function AssistantChat({ onContact, onOpenTicket, onNavigate }: { onContact: (handoff: Handoff) => void; onOpenTicket: (id: string) => void; onNavigate: () => void }) {
  const { text, language } = useLanguage();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: sessionKey(language),
    queryFn: () => supportApi.start(language),
    staleTime: Infinity,
    gcTime: Infinity,
    // While a live chat waits for or talks with an agent, their messages arrive every few seconds.
    // Socket.IO brings changes at once; this is only a fallback if the connection drops.
    refetchInterval: query => (query.state.data?.live && query.state.data.live.state !== 'ENDED' ? 15_000 : false),
  });
  const [draft, setDraft] = useState('');
  // The lists the user came through (topics, searches), so "Back" can show the previous one again.
  const [trail, setTrail] = useState<AssistantInput[]>([]);
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const list = useRef<HTMLDivElement>(null);
  const [collecting, setCollecting] = useState(false);
  const [transferring, setTransferring] = useState(false);
  useEffect(() => { setCollecting(session.data?.handoff === 'COLLECTING'); }, [session.data?.id, session.data?.handoff]);

  const send = useMutation({
    // A short pause with the typing dots, so the reply reads like someone answering.
    mutationFn: async (input: AssistantInput) => (await Promise.all([supportApi.send(session.data!.id, input), wait(input.type === 'human' || collecting ? 1_400 : 700)]))[0],
    onSuccess: (messages, input) => {
      queryClient.setQueryData<AssistantSession>(sessionKey(language), current => current && { ...current, messages: [...current.messages, ...messages] });
      // A hand-off to a person: show the transfer for a moment, then the live chat.
      if (messages.some(message => message.blocks.some(block => block.type === 'ticket'))) {
        setTransferring(true);
        window.setTimeout(() => { void session.refetch().finally(() => setTransferring(false)); }, TRANSFER_MS);
      }
      if (input.type === 'category' || input.type === 'search' || input.type === 'message') setTrail(current => [...current, input]);
      if (input.type === 'home') setTrail([]);
      // Asked for a person: the next message is the problem (until something else is chosen).
      const handedOff = messages.some(message => message.blocks.some(block => block.type === 'ticket'));
      setCollecting(!handedOff && (messages.length === 0 ? collecting : messages.some(message => message.provider === 'human')));
      if (input.type === 'feedback') setAnswered(current => ({ ...current, [input.articleId]: input.helpful }));
    },
  });
  const restart = useMutation({
    mutationFn: () => supportApi.start(language, true),
    onSuccess: data => { queryClient.setQueryData(sessionKey(language), data); setTrail([]); setAnswered({}); },
  });

  // Only the message list scrolls (never the panel): the welcome is read from the top, a new turn from its start.
  const count = session.data?.messages.length ?? 0;
  const seen = useRef(count);
  useEffect(() => {
    const previous = seen.current;
    seen.current = count;
    const box = list.current;
    if (!box || count <= previous || previous === 0) return;
    const first = box.querySelectorAll<HTMLElement>('[data-message]')[previous];
    if (first) box.scrollTo({ top: first.offsetTop - 12, behavior: 'smooth' });
  }, [count]);
  useEffect(() => {
    const box = list.current;
    if (send.isPending && box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [send.isPending]);

  if (session.isPending) return <div className="support-chat support-loading" role="status" aria-label={text('بنحمّل المساعد', 'Loading the assistant')}><Skeleton height={56} /><Skeleton height={180} /><Skeleton height={80} /></div>;
  if (session.isError) {
    return <div className="support-state" role="alert">
      <p>{errorMessage(session.error, text)}</p>
      <Button small variant="secondary" onClick={() => void session.refetch()}>{text('حاول تاني', 'Try again')}</Button>
    </div>;
  }

  if (transferring) return <TransferringView />;
  if (session.data.live) {
    return <LiveChatView sessionId={session.data.id} live={session.data.live} onRestart={() => restart.mutate()} restarting={restart.isPending} />;
  }

  const ask = (input: AssistantInput) => { if (!send.isPending) send.mutate(input); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    ask({ type: 'search', query: value });
    setDraft('');
  };
  const back = () => {
    const previous = trail.at(-2);
    setTrail(current => current.slice(0, -2));
    ask(previous ?? { type: 'home' });
  };
  const lastAnswer = [...session.data.messages].reverse().flatMap(message => message.blocks).find(block => block.type === 'answer');
  // Contacting support carries the last answer shown, so the team sees which question did not help.
  const handoff: Handoff = lastAnswer?.type === 'answer' ? { faqArticleId: lastAnswer.article.id, question: lastAnswer.article.question } : {};
  const started = count > 1;

  return <div className="support-chat">
    {started && <div className="support-nav">
      <button type="button" onClick={back} disabled={send.isPending}><ArrowRightIcon size={15} className="directional" aria-hidden="true" />{text('رجوع', 'Back')}</button>
      <button type="button" onClick={() => ask({ type: 'home' })} disabled={send.isPending}><HouseSimpleIcon size={15} aria-hidden="true" />{text('البداية', 'Start')}</button>
      <button type="button" className="support-nav-end" onClick={() => restart.mutate()} disabled={restart.isPending || send.isPending}
        title={text('محادثة جديدة', 'New conversation')} aria-label={text('محادثة جديدة', 'New conversation')}><ArrowCounterClockwiseIcon size={15} aria-hidden="true" /></button>
    </div>}
    <div ref={list} className="support-messages" aria-live="polite" aria-relevant="additions" data-testid="support-messages">
      {session.data.messages.map(message => <Message key={message.id} message={message} answered={answered} busy={send.isPending}
        onAsk={ask} onContact={() => onContact(handoff)} onHuman={() => ask({ type: 'human' })} onOpenTicket={onOpenTicket} onNavigate={onNavigate} />)}
      {send.isPending && <div className="support-row is-bot">
        <span className="support-avatar-bot" aria-hidden="true"><RobotIcon size={16} weight="fill" /></span>
        <div className="support-bubble is-assistant support-waiting"><Typing label={text('المساعد بيكتب…', 'The assistant is typing…')} /></div>
      </div>}
      {send.isError && <p className="support-inline-error" role="alert">{errorMessage(send.error, text)}</p>}
    </div>
    <div className="support-footer">
      <form className="support-composer" onSubmit={submit} role="search">
        <MagnifyingGlassIcon size={18} aria-hidden="true" className="support-composer-icon" />
        <label className="visually-hidden" htmlFor="support-search">{text('ابحث في الأسئلة', 'Search the questions')}</label>
        <input id="support-search" value={draft} onChange={event => setDraft(event.target.value)} maxLength={120} autoComplete="off"
          placeholder={collecting ? text('اكتب سبب المشكلة…', 'Describe the problem…') : text('اكتب سؤالك…', 'Type your question…')} />
        <button type="submit" className="support-send" disabled={!draft.trim() || send.isPending} aria-label={text('ابحث', 'Search')}><PaperPlaneRightIcon size={17} weight="fill" /></button>
      </form>
      {!collecting && <button type="button" className="support-contact" onClick={() => ask({ type: 'human' })} disabled={send.isPending} data-testid="support-human">
        <HeadsetIcon size={16} aria-hidden="true" />{text('مالقيتش إجابتك؟', 'Didn’t find your answer?')} <strong>{text('كلّم فريق الدعم', 'Talk to our team')}</strong>
      </button>}
    </div>
  </div>;
}

function Message({ message, answered, busy, onAsk, onContact, onHuman, onOpenTicket, onNavigate }: {
  message: AssistantMessage;
  answered: Record<string, boolean>;
  busy: boolean;
  onAsk: (input: AssistantInput) => void;
  onContact: () => void;
  onHuman: () => void;
  onOpenTicket: (id: string) => void;
  onNavigate: () => void;
}) {
  const { text, number } = useLanguage();
  if (message.role === 'user') {
    return <div className="support-bubble is-user" data-message><span className="visually-hidden">{text('إنت:', 'You:')} </span>{message.blocks.map((block, index) => block.type === 'text' && <span key={index}>{block.text}</span>)}</div>;
  }
  const questions = (items: FaqArticleSummary[]) => <ul className="support-list">
    {items.map(item => <li key={item.id}><button type="button" onClick={() => onAsk({ type: 'question', articleId: item.id })} disabled={busy} data-testid="support-question">
      <span>{item.question}</span><CaretLeftIcon size={14} className="directional" aria-hidden="true" />
    </button></li>)}
  </ul>;
  const render = (block: AssistantBlock, index: number) => {
    switch (block.type) {
      case 'text':
        return <div key={index} className="support-bubble is-assistant"><RichText source={block.text} onNavigate={onNavigate} /></div>;
      case 'answer':
        return <article key={index} className="support-answer" data-testid="support-answer">
          <small className="support-answer-topic">{block.article.categoryName}</small>
          <h3>{block.article.question}</h3>
          <RichText source={block.article.answer} onNavigate={onNavigate} />
          {block.article.related.length > 0 && <div className="support-related">
            <p className="support-label">{text('أسئلة قريبة', 'Related questions')}</p>
            {questions(block.article.related)}
          </div>}
        </article>;
      case 'suggestions':
        return <div key={index} className="support-block"><p className="support-label">{block.title}</p>{questions(block.items)}</div>;
      case 'results':
        return <div key={index} className="support-block"><p className="support-label">{text(`نتايج «${block.query}»`, `Results for “${block.query}”`)}</p>{questions(block.items)}</div>;
      case 'categories':
        return <div key={index} className="support-block">
          <p className="support-label">{text('تصفّح حسب الموضوع', 'Browse by topic')}</p>
          <ul className="support-topics">
            {block.items.map(category => {
              const Icon = categoryIcon(category.icon);
              return <li key={category.slug}><button type="button" onClick={() => onAsk({ type: 'category', slug: category.slug })} disabled={busy} data-testid="support-category"
                aria-label={text(`${category.name} (${number(category.articleCount)})`, `${category.name} (${category.articleCount})`)}>
                <Icon size={16} aria-hidden="true" /><span>{category.name}</span>
              </button></li>;
            })}
          </ul>
        </div>;
      case 'feedback': {
        const verdict = answered[block.articleId];
        return <div key={index} className="support-feedback" role="group" aria-label={text('الإجابة دي ساعدتك؟', 'Was this helpful?')}>
          <span>{verdict === undefined ? text('الإجابة دي ساعدتك؟', 'Was this helpful?') : text('شكرًا على رأيك', 'Thanks for your feedback')}</span>
          <button type="button" aria-pressed={verdict === true} disabled={busy || verdict !== undefined} onClick={() => onAsk({ type: 'feedback', articleId: block.articleId, helpful: true })}>
            <ThumbsUpIcon size={15} aria-hidden="true" />{text('أيوه', 'Yes')}
          </button>
          <button type="button" aria-pressed={verdict === false} disabled={busy || verdict !== undefined} onClick={() => onAsk({ type: 'feedback', articleId: block.articleId, helpful: false })}>
            <ThumbsDownIcon size={15} aria-hidden="true" />{text('لأ', 'No')}
          </button>
        </div>;
      }
      case 'handoff':
        return <div key={index} className="support-handoff">
          <p>{block.reason === 'NO_RESULTS' ? text('فريق الدعم يقدر يجاوبك على ده.', 'Our support team can answer this.') : text('تحب تكلّم حد من فريق الدعم؟', 'Would you like to talk to our support team?')}</p>
          <div className="support-handoff-actions">
            <Button small onClick={onHuman} disabled={busy} icon={<HeadsetIcon size={16} aria-hidden="true" />} data-testid="support-handoff-chat">{text('كلّم خدمة العملاء', 'Chat with customer service')}</Button>
            <button type="button" className="link-action" onClick={onContact} data-testid="support-handoff">{text('أو افتح تذكرة', 'or open a ticket')}</button>
          </div>
        </div>;
      case 'ticket':
        return <div key={index} className="support-ticket-made" data-testid="support-ticket-made">
          <CheckCircleIcon size={20} weight="fill" aria-hidden="true" />
          <p>{text(`اتفتحت التذكرة ${block.reference}، وفريق الدعم هيرد عليك هنا.`, `Ticket ${block.reference} is open; our support team will reply here.`)}</p>
          <button type="button" className="link-action" onClick={() => onOpenTicket(block.ticketId)}>{text('افتح التذكرة', 'Open the ticket')}</button>
        </div>;
    }
  };
  // The assistant's messages carry its avatar; notes about a ticket do not.
  if (message.role === 'system') return <div className="support-turn is-system" data-message>{message.blocks.map(render)}</div>;
  return <div className="support-row is-bot" data-message>
    <span className="support-avatar-bot" aria-hidden="true"><RobotIcon size={16} weight="fill" /></span>
    <div className="support-turn">{message.blocks.map(render)}</div>
  </div>;
}
