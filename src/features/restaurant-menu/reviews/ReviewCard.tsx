import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChatCircleTextIcon, GoogleLogoIcon, PencilSimpleIcon, StarIcon } from '@phosphor-icons/react';
import type { DinerReviewResult, DinerReviewState, OrderStatus, PublicOrder } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';
import { dismissReview, isReviewDismissed, loadReviewKey } from '../ordering/ordering-storage';
import { fetchReviewState, safeExternalUrl } from './review-api';
import { editWindowText, ratingWord, Stars, starsLabel } from './review-ui';
import './reviews.css';

// The sheet (and its stylesheet) loads when the diner starts a review.
const ReviewSheet = lazy(() => import('./ReviewSheet').catch(() => ({ default: SheetUnavailable })));

function SheetUnavailable() {
  const { text } = useLanguage();
  return <p className="review-alert" role="alert">{text('مقدرناش نفتح التقييم. اتأكد من النت وجرّب تاني.', 'We could not open the review. Check your connection and try again.')}</p>;
}

/**
 * The order's review state, asked for once the order can have reached the restaurant's moment to
 * ask (ready or completed) and again at each of those steps: before that the answer is NOT_YET.
 */
export function useOrderReview(token: string, status: OrderStatus | undefined) {
  const [state, setState] = useState<DinerReviewState | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (status !== 'READY' && status !== 'COMPLETED') return;
    const controller = new AbortController();
    fetchReviewState(token, controller.signal)
      .then(next => { if (!controller.signal.aborted) setState(next); })
      // No answer: nothing to ask about yet; the next status change asks again.
      .catch(() => undefined);
    return () => controller.abort();
  }, [token, status, attempt]);
  const refresh = useCallback(() => setAttempt(value => value + 1), []);
  return { state, setState, refresh };
}

/** The time now, every 30 seconds while `active`. */
function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * "How was it?" on the order page: an invitation once the order is reviewable (tapping a star starts
 * the review with it), then the diner's review with what happened to it, how long it can still be
 * edited from this browser, and the Google invitation when the restaurant offers it.
 */
export function ReviewCard({ token, order, review, openOnLoad }: {
  token: string;
  order: PublicOrder;
  review: ReturnType<typeof useOrderReview>;
  /** The diner came from "Rate your last order" on the menu: open the sheet once the form is in. */
  openOnLoad: boolean;
}) {
  const { language, text, number } = useLanguage();
  const id = useId();
  const { state, setState, refresh } = review;
  const [open, setOpen] = useState<{ overall: number | null } | null>(null);
  const [dismissed, setDismissed] = useState(() => isReviewDismissed(token));
  const opened = useRef(false);
  const cardRef = useRef<HTMLElement>(null);
  const editableUntil = state?.eligibility === 'EDITABLE' ? state.editableUntil : null;
  const now = useClock(!!editableUntil);
  const canEdit = state?.eligibility === 'EDITABLE' && !!editableUntil && Date.parse(editableUntil) > now && !!loadReviewKey(token);

  // The edit window closes while the page is open: the review becomes read-only.
  useEffect(() => {
    if (state?.eligibility === 'EDITABLE' && editableUntil && Date.parse(editableUntil) <= now) setState({ ...state, eligibility: 'LOCKED', form: null });
  }, [state, editableUntil, now, setState]);

  useEffect(() => {
    if (!openOnLoad || opened.current || !state) return;
    if (state.eligibility === 'OPEN' || (state.eligibility === 'EDITABLE' && loadReviewKey(token))) {
      opened.current = true;
      setOpen({ overall: null });
      // Once: going back and forward again does not reopen it.
      try { history.replaceState({ ...(history.state as object | null), review: false }, ''); } catch { /* History state is optional. */ }
    }
  }, [openOnLoad, state, token]);

  const onDone = useCallback((result: DinerReviewResult) => {
    setState(current => ({
      eligibility: Date.parse(result.editableUntil) > Date.now() ? 'EDITABLE' : 'LOCKED',
      form: current?.form ?? null,
      review: result.review,
      editableUntil: result.editableUntil,
      outcome: result.outcome,
    }));
  }, [setState]);

  if (!state || !['OPEN', 'EDITABLE', 'LOCKED'].includes(state.eligibility)) return null;
  const sheet = open && state.form && <Suspense fallback={null}>
    <ReviewSheet token={token} state={state} defaultName={order.customerName} initialOverall={open.overall}
      onDone={onDone} onStale={refresh} onClose={() => { setOpen(null); cardRef.current?.querySelector<HTMLElement>('button')?.focus(); }} />
  </Suspense>;
  // The sheet keeps its place whatever the card shows, so sending a review (which turns the
  // invitation into "Your review") does not remount it and lose its thank-you.
  const withSheet = (card: ReactNode) => <>{card}{sheet}</>;

  if (state.eligibility === 'OPEN') {
    if (dismissed) {
      return withSheet(<section className="review-card is-quiet" ref={cardRef} data-testid="review-card">
        <button type="button" className="review-link" onClick={() => setOpen({ overall: null })} aria-haspopup="dialog"><StarIcon size={18} aria-hidden="true" />{text('قيّم طلبك', 'Rate your order')}</button>
      </section>);
    }
    const served = order.status === 'COMPLETED';
    return withSheet(<section className="review-card is-invite" ref={cardRef} aria-labelledby={`${id}-title`} data-testid="review-invite">
      <h2 id={`${id}-title`}>{served ? text('الأكل كان عامل إيه؟', 'How was it?') : text('أول ما تدوق: الأكل كان عامل إيه؟', 'Once you have tasted it: how was it?')}</h2>
      <p>{text('قيّم طلبك من', 'Rate your order from')} <bdi>{order.restaurant.name}</bdi>{text('، مش هياخد غير ثواني.', '. It only takes a few seconds.')}</p>
      <div className="review-quick-stars" role="group" aria-label={text('اختار عدد النجوم', 'Choose a star rating')}>
        {[1, 2, 3, 4, 5].map(stars => <button key={stars} type="button" className="review-quick-star" aria-haspopup="dialog" onClick={() => setOpen({ overall: stars })}
          aria-label={`${starsLabel(stars, text, number)}${text('، ', ', ')}${ratingWord(stars, text)}`}>
          <StarIcon size={30} aria-hidden="true" />
        </button>)}
      </div>
      <button type="button" className="review-link quiet" onClick={() => { dismissReview(token); setDismissed(true); }}>{text('مش دلوقتي', 'Not now')}</button>
    </section>);
  }

  // Reviewed: what the diner said, where it stands, and the edit window.
  const mine = state.review!;
  const status = state.outcome?.status;
  const google = safeExternalUrl(state.outcome?.google?.url);
  const editNote = canEdit && editableUntil ? editWindowText(editableUntil, now, language, text, number) : null;
  return withSheet(<section className="review-card is-mine" ref={cardRef} aria-labelledby={`${id}-title`} data-testid="review-mine" data-eligibility={state.eligibility.toLowerCase()}>
    <h2 id={`${id}-title`}>{text('تقييمك', 'Your review')}</h2>
    <p className="review-mine-stars"><Stars value={mine.overall} size={20} /><span>{ratingWord(mine.overall, text)}</span></p>
    {mine.comment && <p className="review-mine-comment"><ChatCircleTextIcon size={17} aria-hidden="true" /><bdi dir="auto">{mine.comment}</bdi></p>}
    {status && <p className={`review-mine-status is-${status.toLowerCase()}`}>{status === 'PUBLISHED' ? text('منشور على المنيو', 'Published on the menu') : status === 'PENDING' ? text('مستني مراجعة المطعم', 'Waiting for the restaurant to check it') : text('وصل للمطعم بس، مش منشور', 'Seen by the restaurant only, not published')}</p>}
    {editNote && <p className="review-mine-window">{editNote}</p>}
    {state.eligibility === 'LOCKED' && <p className="review-mine-window">{text('التقييم ده مبقاش ينفع يتعدّل.', 'This review can no longer be changed.')}</p>}
    {state.eligibility === 'EDITABLE' && !canEdit && <p className="review-mine-window">{text('التقييم ده يتعدّل بس من الجهاز اللي اتكتب منه.', 'This review can only be changed on the device it was written on.')}</p>}
    <div className="review-mine-actions">
      {canEdit && state.form && <button type="button" className="review-button secondary" onClick={() => setOpen({ overall: null })} aria-haspopup="dialog"><PencilSimpleIcon size={18} aria-hidden="true" />{text('عدّل تقييمك', 'Edit your review')}</button>}
      {google && <a className="review-button secondary" href={google} target="_blank" rel="noopener noreferrer"><GoogleLogoIcon size={18} weight="bold" aria-hidden="true" />{text('قيّم على جوجل', 'Review on Google')}<span className="visually-hidden">{text(' (بيفتح في صفحة جديدة)', ' (opens in a new tab)')}</span></a>}
    </div>
  </section>);
}
