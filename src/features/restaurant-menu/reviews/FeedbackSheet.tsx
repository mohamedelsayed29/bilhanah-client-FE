import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ChairIcon, StorefrontIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { REVIEW_LIMITS, type FeedbackResult } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';
import { loadDiner } from '../ordering/ordering-storage';
import { ApiError, isValidPhone, normalizePhone, RATE_LIMITED, REVIEW_CODES, sendFeedback, VALIDATION_FAILED } from './review-api';
import { StarsInput } from './review-ui';
import { ReviewThanks } from './ReviewSheet';
import './reviews.css';

type Field = 'overall' | 'comment' | 'phone' | 'consent';

/**
 * Feedback without an order (from the menu or a table), when the restaurant takes it: stars, a
 * comment, a name and, with consent, a phone number. It is labelled unverified for the restaurant
 * and on the menu, cannot be edited, and is limited per day. A field no person sees (`website`)
 * catches bots: the API answers them like anyone else and keeps nothing.
 */
export default function FeedbackSheet({ subdomain, restaurantName, branch, table, onClose }: {
  subdomain: string;
  restaurantName: string;
  /** The branch the menu shows (null from an API that predates branches). */
  branch: { slug: string; name: string } | null;
  /** The scanned table: its code decides the branch. */
  table: { code: string; name: string | null } | null;
  onClose: () => void;
}) {
  const { language, text, number } = useLanguage();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const thanksHeading = useRef<HTMLHeadingElement>(null);
  const [overall, setOverall] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [name, setName] = useState(() => loadDiner().name);
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [atTable, setAtTable] = useState(table);
  // The restaurant's threshold is learnt from the API the first time it asks for a comment.
  const [commentBelow, setCommentBelow] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);

  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  useEffect(() => { if (result) thanksHeading.current?.focus(); }, [result]);
  const close = () => dialog.current?.close();
  const commentRequired = commentBelow > 0 && overall !== null && overall < commentBelow;
  const commentMessage = (below: number) => text(`اكتب للمطعم إيه اللي مكانش كويس: التعليق مطلوب للتقييم الأقل من ${number(below)} نجوم.`, `Tell the restaurant what went wrong: a comment is needed for ratings under ${below} stars.`);
  const clearError = (field: Field) => setErrors(current => (current[field] ? { ...current, [field]: undefined } : current));

  function focusField(field: Field) {
    const element = document.getElementById(`${id}-${field}`);
    if (field === 'overall') element?.querySelector<HTMLInputElement>('input')?.focus();
    else element?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    const found: Partial<Record<Field, string>> = {};
    if (overall === null) found.overall = text('اختار عدد النجوم الأول.', 'Choose a star rating first.');
    if (commentRequired && !comment.trim()) found.comment = commentMessage(commentBelow);
    if (phone.trim() && !isValidPhone(phone)) found.phone = text('اكتب رقم تليفون صحيح.', 'Enter a valid phone number.');
    if (phone.trim() && !consent) found.consent = text('وافق إن المطعم يكلّمك عشان تسيب رقمك، أو امسح الرقم.', 'Agree to be contacted to leave your number, or clear it.');
    setErrors(found);
    const first = (['overall', 'comment', 'phone', 'consent'] as const).find(field => found[field]);
    if (first) { focusField(first); return; }
    setSubmitting(true);
    try {
      const sent = await sendFeedback(subdomain, {
        overall: overall!,
        comment: comment.trim() || null,
        name: name.trim() || null,
        contactPhone: phone.trim() ? normalizePhone(phone) : null,
        contactConsent: consent && !!phone.trim(),
        language,
        ...(atTable ? { tableCode: atTable.code } : branch ? { branch: branch.slug } : {}),
        ...(website && { website }),
      });
      setResult(sent);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null;
      const details = (error instanceof ApiError ? error.details : null) as { below?: number } | null;
      if (code === REVIEW_CODES.COMMENT_REQUIRED) {
        const below = details?.below ?? 3;
        setCommentBelow(below);
        setErrors(current => ({ ...current, comment: commentMessage(below) }));
        focusField('comment');
      } else if (code === REVIEW_CODES.CONTACT_CONSENT_REQUIRED) {
        setErrors(current => ({ ...current, consent: text('وافق إن المطعم يكلّمك عشان تسيب رقمك، أو امسح الرقم.', 'Agree to be contacted to leave your number, or clear it.') }));
        focusField('consent');
      } else if (code === RATE_LIMITED) {
        setFormError(text(`شكرًا! بعت آراء كتير النهارده (الحد ${number(REVIEW_LIMITS.feedbackPerDay)} في اليوم). تقدر تبعت تاني بكرة.`, `Thank you! You have already sent a lot of feedback today (the limit is ${REVIEW_LIMITS.feedbackPerDay} a day). You can send more tomorrow.`));
      } else if (code === 'TABLE_NOT_FOUND') {
        // A retired table: the feedback goes to the branch instead.
        setAtTable(null);
        setFormError(text('مش لاقيين الطاولة دي، فهنبعت رأيك للفرع. ابعت تاني.', 'We could not find this table, so your feedback will go to the branch. Send it again.'));
      } else if (code === REVIEW_CODES.FEEDBACK_UNAVAILABLE || code === REVIEW_CODES.UNAVAILABLE) {
        setFormError(text('المطعم مش بياخد آراء من هنا دلوقتي.', 'The restaurant is not taking feedback here right now.'));
      } else if (code === 'BRANCH_NOT_FOUND') {
        setFormError(text('الفرع ده مبقاش موجود. ارجع للمنيو واختار فرع.', 'This branch is no longer there. Go back to the menu and choose one.'));
      } else if (code === VALIDATION_FAILED) {
        setFormError(text('في حاجة في الفورم مش مظبوطة. راجع إجاباتك وجرّب تاني.', 'Something in the form is not valid. Check your answers and try again.'));
      } else if (error instanceof ApiError && error.status === 0) {
        setFormError(text('مفيش اتصال. اتأكد من النت وجرّب تاني.', 'No connection. Check your internet and try again.'));
      } else {
        setFormError(text('حصلت مشكلة. جرّب تاني.', 'Something went wrong. Try again.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const describedBy = (field: Field, hint = false) => [errors[field] && `${id}-${field}-error`, hint && `${id}-${field}-hint`].filter(Boolean).join(' ') || undefined;

  return <dialog ref={dialog} className="review-sheet feedback-sheet" aria-labelledby={`${id}-title`} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="review-sheet-body">
      <header className="review-sheet-header">
        <h2 id={`${id}-title`}>{result ? text('شكرًا على رأيك', 'Thanks for your feedback') : text('قول رأيك', 'Share feedback')}</h2>
        <button type="button" className="review-icon-button" onClick={close} aria-label={text('إغلاق', 'Close')}><XIcon size={20} /></button>
      </header>
      {result ? <ReviewThanks result={result} branchName={branch?.name ?? null} headingRef={thanksHeading} onClose={close} />
        : <form className="review-sheet-form" onSubmit={event => void submit(event)} noValidate>
          <div className="review-sheet-content">
            <p className="review-sheet-intro">{text('قول لـ', 'Tell')} <bdi>{restaurantName}</bdi> {text('زيارتك كانت عاملة إيه. من غير طلب، رأيك بيوصل للمطعم على إنه مش مؤكد.', 'how your visit went. Without an order, your feedback reaches the restaurant marked as unverified.')}</p>
            {(atTable || branch) && <p className="feedback-context" data-testid="feedback-context">
              {atTable ? <ChairIcon size={17} aria-hidden="true" /> : <StorefrontIcon size={17} aria-hidden="true" />}
              <span>{text('عن: ', 'About: ')}{branch && <bdi>{branch.name}</bdi>}{branch && atTable?.name && ' · '}{atTable?.name && <bdi>{atTable.name}</bdi>}</span>
            </p>}
            <StarsInput id={`${id}-overall`} label={text('تقييمك', 'Your rating')} value={overall} required error={errors.overall}
              onChange={stars => { setOverall(stars); clearError('overall'); if (!(commentBelow > 0 && stars < commentBelow)) clearError('comment'); }} />
            <div className={`review-field ${errors.comment ? 'invalid' : ''}`}>
              <label htmlFor={`${id}-comment`}>{text('تعليقك', 'Your comment')}{commentRequired ? <span className="field-required">{text(' (مطلوب)', ' (required)')}</span> : <small>{text(' (اختياري)', ' (optional)')}</small>}</label>
              <textarea id={`${id}-comment`} value={comment} maxLength={REVIEW_LIMITS.commentLength} rows={3} dir="auto"
                aria-invalid={errors.comment ? true : undefined} aria-describedby={describedBy('comment')} aria-required={commentRequired || undefined}
                placeholder={text('إيه اللي عجبك أو ممكن يتحسّن؟', 'What did you like, or what could be better?')}
                onChange={event => { setComment(event.target.value); clearError('comment'); }} />
              {errors.comment && <p className="field-error" id={`${id}-comment-error`}>{errors.comment}</p>}
            </div>
            <div className="review-field">
              <label htmlFor={`${id}-name`}>{text('اسمك', 'Your name')} <small>{text('(اختياري)', '(optional)')}</small></label>
              <input id={`${id}-name`} value={name} maxLength={REVIEW_LIMITS.nameLength} autoComplete="name" dir="auto" onChange={event => setName(event.target.value)} />
            </div>
            <fieldset className="review-contact">
              <legend>{text('المطعم يكلّمك؟', 'Should the restaurant reach you?')} <small>{text('(اختياري)', '(optional)')}</small></legend>
              <div className={`review-field ${errors.phone ? 'invalid' : ''}`}>
                <label htmlFor={`${id}-phone`}>{text('رقم تليفونك', 'Your phone number')}</label>
                <input id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} maxLength={20}
                  aria-invalid={errors.phone ? true : undefined} aria-describedby={describedBy('phone', true)}
                  onChange={event => { setPhone(event.target.value); clearError('phone'); if (!event.target.value.trim()) clearError('consent'); }} />
                <p className="field-hint" id={`${id}-phone-hint`}>{text('المطعم بس اللي بيشوفه، عشان يتواصل معاك. مش بيظهر للناس أبدًا.', 'Only the restaurant sees it, to reach you. It is never shown publicly.')}</p>
                {errors.phone && <p className="field-error" id={`${id}-phone-error`}>{errors.phone}</p>}
              </div>
              <div className={`review-consent ${errors.consent ? 'invalid' : ''}`}>
                <label>
                  <input id={`${id}-consent`} type="checkbox" checked={consent} aria-invalid={errors.consent ? true : undefined} aria-describedby={describedBy('consent')}
                    onChange={event => { setConsent(event.target.checked); clearError('consent'); }} />
                  <span>{text('موافق إن المطعم يكلّمني بخصوص رأيي', 'I agree that the restaurant may contact me about my feedback')}</span>
                </label>
                {errors.consent && <p className="field-error" id={`${id}-consent-error`}>{errors.consent}</p>}
              </div>
            </fieldset>
            {/* Honeypot: off screen and out of the tab order, so only bots fill it. */}
            <div className="feedback-trap" aria-hidden="true">
              <label htmlFor={`${id}-website`}>Website</label>
              <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} />
            </div>
          </div>
          <footer className="review-sheet-footer">
            <div role="alert">{formError && <p className="review-alert"><WarningCircleIcon size={18} weight="fill" aria-hidden="true" /><span>{formError}</span></p>}</div>
            <button type="submit" className="review-button" disabled={submitting} aria-busy={submitting || undefined}>{submitting ? text('بنبعت…', 'Sending…') : text('ابعت رأيك', 'Send feedback')}</button>
          </footer>
        </form>}
    </div>
  </dialog>;
}
