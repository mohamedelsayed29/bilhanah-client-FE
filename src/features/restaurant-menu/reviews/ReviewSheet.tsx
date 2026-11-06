import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, Ref } from 'react';
import { CameraIcon, CheckCircleIcon, GoogleLogoIcon, TrashIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import {
  REVIEW_LIMITS,
  REVIEW_SUB_RATING_LABELS,
  reviewDisplayName,
  type DinerReviewResult,
  type DinerReviewState,
  type ReviewForm,
  type ReviewSubRating,
} from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';
import { branchTitle } from '../branches';
import { localized } from '../menu-format';
import { loadReviewKey, saveReviewKey } from '../ordering/ordering-storage';
import {
  ApiError, isValidPhone, newEditKey, normalizePhone, PAYLOAD_TOO_LARGE, PHOTO_MAX_BYTES, PHOTO_TYPES, RATE_LIMITED, REVIEW_CODES,
  reviewPhotoUrl, safeExternalUrl, submitReview, uploadReviewPhoto, VALIDATION_FAILED,
} from './review-api';
import { editWindowText, outcomeText, StarsInput, ThumbsInput } from './review-ui';
import './reviews.css';

type Text = (ar: string, en: string) => string;
type Photo = { key: string; id: string | null; preview: string; progress: number; status: 'uploading' | 'done' | 'error'; name: string; local: boolean; broken?: boolean };
type Field = 'overall' | 'comment' | 'name' | 'phone' | 'consent';
type Errors = Partial<Record<Field, string>>;

/** Why a photo was not taken, in the diner's words. */
function photoErrorText(error: unknown, text: Text, number: (value: number) => string): string {
  if (error instanceof ApiError) {
    if (error.code === 'UNSUPPORTED_IMAGE') return text('الصورة دي مش JPEG أو PNG أو WebP.', 'This photo is not a JPEG, PNG or WebP image.');
    if (error.code === 'IMAGE_TOO_SMALL') return text('الصورة صغيرة أوي. استخدم صورة أكبر من ٢٠٠ بكسل.', 'This photo is too small. Use one at least 200 pixels wide and tall.');
    if (error.code === PAYLOAD_TOO_LARGE || error.status === 413) return text('الصورة أكبر من ٥ ميجا.', 'This photo is larger than 5 MB.');
    if (error.code === REVIEW_CODES.PHOTO_LIMIT) return text(`رفعت صور كتير للطلب ده (الحد ${number(REVIEW_LIMITS.photoUploadsPerOrder)}).`, `You have uploaded too many photos for this order (the limit is ${REVIEW_LIMITS.photoUploadsPerOrder}).`);
    if (error.code === REVIEW_CODES.PHOTOS_OFF) return text('المطعم مش بياخد صور مع التقييمات.', 'The restaurant does not take photos with reviews.');
    if (error.code === RATE_LIMITED) return text('رفعت صور كتير في وقت قصير. جرّب تاني بعد شوية.', 'Too many photos in a short time. Try again in a while.');
    if (error.code === REVIEW_CODES.NOT_ELIGIBLE) return text('الطلب ده مبقاش ينفع يتقيّم.', 'This order can no longer be reviewed.');
    if (error.status === 0) return text('مفيش اتصال. اتأكد من النت وجرّب تاني.', 'No connection. Check your internet and try again.');
  }
  return text('مقدرناش نرفع الصورة. جرّب تاني.', 'We could not upload the photo. Try again.');
}

/** A failed submission: the field it concerns (if any), what to tell the diner, and whether the form must be reloaded. */
function submitErrorText(error: unknown, text: Text, number: (value: number) => string): { field?: Field; message: string; stale?: boolean; photoId?: string } {
  if (!(error instanceof ApiError)) return { message: text('حصلت مشكلة. جرّب تاني.', 'Something went wrong. Try again.') };
  const details = (error.details ?? {}) as { below?: number; eligibility?: string; photoId?: string };
  switch (error.code) {
    case REVIEW_CODES.COMMENT_REQUIRED:
      return { field: 'comment', message: text(`اكتب للمطعم إيه اللي مكانش كويس: التعليق مطلوب للتقييم الأقل من ${number(details.below ?? 3)} نجوم.`, `Tell the restaurant what went wrong: a comment is needed for ratings under ${details.below ?? 3} stars.`) };
    case REVIEW_CODES.CONTACT_CONSENT_REQUIRED:
      return { field: 'consent', message: text('وافق إن المطعم يكلّمك عشان تسيب رقمك، أو امسح الرقم.', 'Agree to be contacted to leave your number, or clear it.') };
    case REVIEW_CODES.EDIT_FORBIDDEN:
      return { message: text('التقييم ده اتكتب من جهاز تاني، فمينفعش يتعدّل من هنا.', 'This review was written on another device, so it cannot be changed here.'), stale: true };
    case REVIEW_CODES.NOT_ELIGIBLE:
      if (details.eligibility === 'LOCKED') return { message: text('وقت تعديل التقييم خلص.', 'The time to edit this review is over.'), stale: true };
      if (details.eligibility === 'NOT_YET') return { message: text('تقدر تقيّم الطلب أول ما يوصلك.', 'You can review the order once it is served.'), stale: true };
      return { message: text('الطلب ده مينفعش يتقيّم.', 'This order cannot be reviewed.'), stale: true };
    case REVIEW_CODES.UNAVAILABLE:
      return { message: text('المطعم مبقاش بياخد تقييمات.', 'The restaurant no longer takes reviews.'), stale: true };
    case REVIEW_CODES.PHOTO_NOT_FOUND:
      return { message: text('صورة من صورك مبقتش موجودة. شيلناها، ارفعها تاني لو حابب.', 'One of your photos is no longer there. We removed it; upload it again if you like.'), photoId: details.photoId };
    case REVIEW_CODES.PHOTOS_OFF:
      return { message: text('المطعم مبقاش بياخد صور. شيل الصور وابعت تاني.', 'The restaurant no longer takes photos. Remove them and send again.'), stale: true };
    case REVIEW_CODES.TAG_UNKNOWN:
    case REVIEW_CODES.RATING_NOT_ASKED:
    case REVIEW_CODES.DISH_NOT_IN_ORDER:
      return { message: text('المطعم غيّر الأسئلة من شوية. حدّثنا الفورم، راجع تقييمك وابعت تاني.', 'The restaurant just changed its questions. We updated the form: check your answers and send again.'), stale: true };
    case RATE_LIMITED:
      return { message: text('محاولات كتير ورا بعض. استنى شوية وجرّب تاني.', 'Too many tries in a row. Wait a little and try again.') };
    case VALIDATION_FAILED:
      return { message: text('في حاجة في الفورم مش مظبوطة. راجع إجاباتك وجرّب تاني.', 'Something in the form is not valid. Check your answers and try again.') };
    case 'ORDER_NOT_FOUND':
      return { message: text('مش لاقيين الطلب ده.', 'We could not find this order.') };
  }
  if (error.status === 0) return { message: text('مفيش اتصال. اتأكد من النت وجرّب تاني.', 'No connection. Check your internet and try again.') };
  return { message: text('حصلت مشكلة. جرّب تاني.', 'Something went wrong. Try again.') };
}

/** Negative chips first for a low rating, positive first otherwise. */
function orderedTags(form: ReviewForm, overall: number | null) {
  const low = overall !== null && overall <= 3;
  return [...form.tags].sort((a, b) => (a.sentiment === b.sentiment ? 0 : (a.sentiment === 'NEGATIVE') === low ? -1 : 1));
}

/**
 * The order's review: overall stars (required), the restaurant's extra questions, each dish of the
 * order, quick tags, a comment (required below the restaurant's threshold), up to three photos, the
 * name to show and, with consent, a phone number. Edits the review when it exists. Ends on a thank
 * you that says what happens next, and invites happy diners to Google when the restaurant asks.
 */
export default function ReviewSheet({ token, state, defaultName, initialOverall = null, onDone, onStale, onClose }: {
  token: string;
  state: DinerReviewState;
  defaultName: string;
  initialOverall?: number | null;
  onDone: (result: DinerReviewResult) => void;
  onStale: () => void;
  onClose: () => void;
}) {
  const { language, text, number } = useLanguage();
  const form = state.form!;
  const existing = state.review;
  const editing = !!existing;
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const thanksHeading = useRef<HTMLHeadingElement>(null);
  const [overall, setOverall] = useState<number | null>(existing?.overall ?? initialOverall);
  const [ratings, setRatings] = useState<Partial<Record<ReviewSubRating, number>>>(() => ({ ...existing?.ratings }));
  const [dishes, setDishes] = useState<Record<string, number>>(() => Object.fromEntries((existing?.dishes ?? []).map(dish => [dish.orderItemId, dish.rating])));
  const [tags, setTags] = useState<string[]>(() => existing?.tags.filter(code => form.tags.some(tag => tag.code === code)) ?? []);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [name, setName] = useState(existing ? existing.name ?? '' : defaultName);
  const [phone, setPhone] = useState('');
  // A number left earlier stays (unless the diner unticks consent or types a new one).
  const [consent, setConsent] = useState(() => Boolean(existing?.hasContact));
  const [photos, setPhotos] = useState<Photo[]>(() => (existing?.photoIds ?? []).map(photoId => ({ key: photoId, id: photoId, preview: reviewPhotoUrl(token, photoId), progress: 1, status: 'done', name: '', local: false })));
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DinerReviewResult | null>(null);
  const uploads = useRef(new Map<string, AbortController>());
  const previews = useRef(new Set<string>());

  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  // Uploads still running stop with the sheet, and local previews are freed.
  useEffect(() => () => {
    for (const controller of uploads.current.values()) controller.abort();
    for (const url of previews.current) URL.revokeObjectURL(url);
  }, []);
  useEffect(() => { if (result) thanksHeading.current?.focus(); }, [result]);
  const close = () => dialog.current?.close();

  const commentRequired = form.commentRequiredBelow > 0 && overall !== null && overall < form.commentRequiredBelow;
  const shownAs = reviewDisplayName(name.trim() || null, form.displayName);
  const maxPhotos = Math.min(form.maxPhotos, REVIEW_LIMITS.photosPerReview);
  const uploading = photos.some(photo => photo.status === 'uploading');

  const clearError = (field: Field) => setErrors(current => (current[field] ? { ...current, [field]: undefined } : current));

  function validate(): Errors {
    const found: Errors = {};
    if (overall === null) found.overall = text('اختار عدد النجوم الأول.', 'Choose a star rating first.');
    if (commentRequired && !comment.trim()) found.comment = text(`اكتب للمطعم إيه اللي مكانش كويس: التعليق مطلوب للتقييم الأقل من ${number(form.commentRequiredBelow)} نجوم.`, `Tell the restaurant what went wrong: a comment is needed for ratings under ${form.commentRequiredBelow} stars.`);
    if (phone.trim() && !isValidPhone(phone)) found.phone = text('اكتب رقم تليفون صحيح.', 'Enter a valid phone number.');
    if (phone.trim() && !consent) found.consent = text('وافق إن المطعم يكلّمك عشان تسيب رقمك، أو امسح الرقم.', 'Agree to be contacted to leave your number, or clear it.');
    return found;
  }

  function focusField(field: Field) {
    const target: Record<Field, string> = { overall: `${id}-overall`, comment: `${id}-comment`, name: `${id}-name`, phone: `${id}-phone`, consent: `${id}-consent` };
    const element = document.getElementById(target[field]);
    if (field === 'overall') (element?.querySelector<HTMLInputElement>('input:checked') ?? element?.querySelector<HTMLInputElement>('input'))?.focus();
    else element?.focus();
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    setPhotoMessage(null);
    const room = maxPhotos - photos.filter(photo => photo.status !== 'error').length;
    if (files.length > room) setPhotoMessage(text(`تقدر تضيف ${number(maxPhotos)} صور بس.`, `You can add up to ${maxPhotos} photos.`));
    const problems: string[] = [];
    for (const file of files.slice(0, Math.max(room, 0))) {
      if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) { problems.push(text(`«${file.name}» مش صورة JPEG أو PNG أو WebP.`, `“${file.name}” is not a JPEG, PNG or WebP photo.`)); continue; }
      if (file.size > PHOTO_MAX_BYTES) { problems.push(text(`«${file.name}» أكبر من ٥ ميجا.`, `“${file.name}” is larger than 5 MB.`)); continue; }
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      const controller = new AbortController();
      uploads.current.set(key, controller);
      setPhotos(current => [...current, { key, id: null, preview, progress: 0, status: 'uploading', name: file.name, local: true }]);
      uploadReviewPhoto(token, file, progress => setPhotos(current => current.map(photo => photo.key === key ? { ...photo, progress } : photo)), controller.signal)
        .then(uploaded => setPhotos(current => current.map(photo => photo.key === key ? { ...photo, id: uploaded.id, progress: 1, status: 'done' } : photo)))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setPhotos(current => current.filter(photo => photo.key !== key));
          const reason = photoErrorText(error, text, number);
          setPhotoMessage(text(`«${file.name}»: ${reason}`, `“${file.name}”: ${reason}`));
        })
        .finally(() => uploads.current.delete(key));
    }
    if (problems.length) setPhotoMessage(problems.join(' '));
  }

  function removePhoto(photo: Photo) {
    uploads.current.get(photo.key)?.abort();
    if (photo.local) { URL.revokeObjectURL(photo.preview); previews.current.delete(photo.preview); }
    setPhotos(current => current.filter(entry => entry.key !== photo.key));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    const found = validate();
    setErrors(found);
    const first = (['overall', 'comment', 'phone', 'consent'] as const).find(field => found[field]);
    if (first) { focusField(first); return; }
    if (uploading) { setFormError(text('استنى لحد ما الصور تخلص رفع.', 'Wait for your photos to finish uploading.')); return; }
    // A key from this browser: kept before sending, so a retry (or a later edit) uses the same one.
    const stored = loadReviewKey(token);
    const editKey = stored?.key ?? (editing ? undefined : newEditKey());
    if (editKey && !stored) saveReviewKey(token, editKey, false);
    setSubmitting(true);
    try {
      const sent = await submitReview(token, {
        overall: overall!,
        ratings: Object.fromEntries(Object.entries(ratings).filter(([key]) => (form.subRatings as string[]).includes(key))),
        dishes: form.dishRatings ? form.dishes.filter(dish => dishes[dish.orderItemId]).map(dish => ({ orderItemId: dish.orderItemId, rating: dishes[dish.orderItemId]! })) : [],
        tags: tags.filter(code => form.tags.some(tag => tag.code === code)),
        comment: comment.trim() || null,
        photoIds: form.photos ? photos.filter(photo => photo.status === 'done' && photo.id).map(photo => photo.id!) : [],
        name: name.trim() || null,
        // Left empty while a number is on file and consent stays ticked: omit it, so the API keeps it.
        ...(phone.trim() ? { contactPhone: normalizePhone(phone) } : existing?.hasContact && consent ? {} : { contactPhone: null }),
        contactConsent: consent && (!!phone.trim() || !!existing?.hasContact),
        language,
        ...(editKey && { editKey }),
      });
      if (editKey) saveReviewKey(token, editKey, true);
      setResult(sent);
      onDone(sent);
    } catch (error) {
      const problem = submitErrorText(error, text, number);
      if (problem.photoId) setPhotos(current => current.filter(photo => photo.id !== problem.photoId));
      if (problem.field) { setErrors(current => ({ ...current, [problem.field!]: problem.message })); focusField(problem.field); }
      else setFormError(problem.message);
      if (problem.stale) onStale();
    } finally {
      setSubmitting(false);
    }
  }

  const title = result ? null : editing ? text('عدّل تقييمك', 'Edit your review') : text('الأكل كان عامل إيه؟', 'How was it?');
  const describedBy = (field: Field, hint?: boolean) => [errors[field] && `${id}-${field}-error`, hint && `${id}-${field}-hint`].filter(Boolean).join(' ') || undefined;

  return <dialog ref={dialog} className="review-sheet" aria-labelledby={`${id}-title`} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="review-sheet-body">
      <header className="review-sheet-header">
        <h2 id={`${id}-title`}>{title ?? text('شكرًا على تقييمك', 'Thanks for your review')}</h2>
        <button type="button" className="review-icon-button" onClick={close} aria-label={text('إغلاق', 'Close')}><XIcon size={20} /></button>
      </header>
      {result ? <ReviewThanks result={result} branchName={form.branch.name} headingRef={thanksHeading} onClose={close} />
        : <form className="review-sheet-form" onSubmit={event => void submit(event)} noValidate>
          <div className="review-sheet-content">
            <p className="review-sheet-intro">{text('رأيك بيفرق مع', 'Your opinion matters to')} <bdi>{form.restaurant.name}</bdi>{text('.', '.')}</p>
            <StarsInput id={`${id}-overall`} label={text('تقييمك العام', 'Your overall rating')} value={overall} required error={errors.overall}
              onChange={stars => { setOverall(stars); clearError('overall'); if (!(form.commentRequiredBelow > 0 && stars < form.commentRequiredBelow)) clearError('comment'); }} />

            {form.subRatings.length > 0 && <section className="review-section" aria-labelledby={`${id}-details`}>
              <h3 id={`${id}-details`}>{text('بالتفصيل', 'In detail')} <small>{text('(اختياري)', '(optional)')}</small></h3>
              {form.subRatings.map(key => <StarsInput key={key} size="compact" label={text(...REVIEW_SUB_RATING_LABELS[key])} value={ratings[key] ?? null}
                onChange={stars => setRatings(current => ({ ...current, [key]: stars }))} />)}
            </section>}

            {form.dishRatings && form.dishes.length > 0 && <section className="review-section" aria-labelledby={`${id}-dishes`}>
              <h3 id={`${id}-dishes`}>{text('الأطباق اللي طلبتها', 'The dishes you ordered')} <small>{text('(اختياري)', '(optional)')}</small></h3>
              <ul className="review-dishes">
                {form.dishes.map(dish => {
                  const dishName = localized(language, dish.nameAr, dish.nameEn);
                  const size = localized(language, dish.variantNameAr, dish.variantNameEn);
                  const label = size ? `${dishName} (${size})` : dishName;
                  return <li key={dish.orderItemId} className={`review-dish is-${form.dishRatingScale.toLowerCase()}`} data-testid="review-dish">
                    {form.dishRatingScale === 'THUMBS' ? <>
                      <span className="review-dish-name"><bdi>{dishName}</bdi>{size && <small> · <bdi>{size}</bdi></small>}{dish.quantity > 1 && <small> · {number(dish.quantity)}×</small>}</span>
                      <ThumbsInput dish={label} value={dishes[dish.orderItemId] ?? null} onChange={rating => setDishes(current => { const next = { ...current }; if (rating === null) delete next[dish.orderItemId]; else next[dish.orderItemId] = rating; return next; })} />
                    </> : <StarsInput size="compact" label={label} value={dishes[dish.orderItemId] ?? null} onChange={rating => setDishes(current => ({ ...current, [dish.orderItemId]: rating }))} />}
                  </li>;
                })}
              </ul>
            </section>}

            {form.tags.length > 0 && <section className="review-section" aria-labelledby={`${id}-tags`}>
              <h3 id={`${id}-tags`}>{text('في كلمة', 'In a word')} <small>{text('(اختياري)', '(optional)')}</small></h3>
              <div className="review-tags">
                {orderedTags(form, overall).map(tag => {
                  const on = tags.includes(tag.code);
                  return <button key={tag.code} type="button" className={`review-tag is-${tag.sentiment.toLowerCase()} ${on ? 'is-on' : ''}`} aria-pressed={on}
                    disabled={!on && tags.length >= REVIEW_LIMITS.tagsPerReview}
                    onClick={() => setTags(current => on ? current.filter(code => code !== tag.code) : [...current, tag.code])}>
                    {on && <CheckCircleIcon size={16} weight="fill" aria-hidden="true" />}<bdi>{localized(language, tag.nameAr, tag.nameEn)}</bdi>
                  </button>;
                })}
              </div>
            </section>}

            <div className={`review-field ${errors.comment ? 'invalid' : ''}`}>
              <label htmlFor={`${id}-comment`}>{text('تعليقك', 'Your comment')}{commentRequired ? <span className="field-required">{text(' (مطلوب)', ' (required)')}</span> : <small>{text(' (اختياري)', ' (optional)')}</small>}</label>
              <textarea id={`${id}-comment`} value={comment} maxLength={REVIEW_LIMITS.commentLength} rows={3} dir="auto"
                aria-invalid={errors.comment ? true : undefined} aria-describedby={describedBy('comment', commentRequired)} aria-required={commentRequired || undefined}
                placeholder={commentRequired ? text('إيه اللي مكانش كويس؟', 'What went wrong?') : text('إيه اللي عجبك أو ممكن يتحسّن؟', 'What did you like, or what could be better?')}
                onChange={event => { setComment(event.target.value); clearError('comment'); }} />
              {commentRequired && <p className="field-hint" id={`${id}-comment-hint`}>{text(`مطلوب للتقييم الأقل من ${number(form.commentRequiredBelow)} نجوم، عشان المطعم يعرف يصلّح إيه.`, `Needed for ratings under ${form.commentRequiredBelow} stars, so the restaurant knows what to fix.`)}</p>}
              {comment.length > REVIEW_LIMITS.commentLength - 100 && <p className="field-hint">{text(`${number(comment.length)} من ${number(REVIEW_LIMITS.commentLength)} حرف`, `${comment.length} of ${REVIEW_LIMITS.commentLength} characters`)}</p>}
              {errors.comment && <p className="field-error" id={`${id}-comment-error`}>{errors.comment}</p>}
            </div>

            {form.photos && <section className="review-section" aria-labelledby={`${id}-photos`}>
              <h3 id={`${id}-photos`}>{text('صور', 'Photos')} <small>{text(`(اختياري، لحد ${number(maxPhotos)})`, `(optional, up to ${maxPhotos})`)}</small></h3>
              <ul className="review-photos">
                {photos.map((photo, index) => <li key={photo.key} className={`review-photo is-${photo.status}`} data-testid="review-photo">
                  {/* A photo that cannot be shown stays on the review: a plain tile names it. */}
                  {photo.broken
                    ? <span className="review-photo-placeholder" role="img" aria-label={text(`صورة ${number(index + 1)}`, `Photo ${index + 1}`)}><CameraIcon size={24} aria-hidden="true" /><span aria-hidden="true">{number(index + 1)}</span></span>
                    : <img src={photo.preview} alt={text(`صورة ${number(index + 1)}`, `Photo ${index + 1}`)} onError={() => setPhotos(current => current.map(entry => entry.key === photo.key ? { ...entry, broken: true } : entry))} />}
                  {photo.status === 'uploading' && <progress max={1} value={photo.progress} aria-label={text(`بنرفع صورة ${number(index + 1)}`, `Uploading photo ${index + 1}`)} />}
                  <button type="button" className="review-photo-remove" onClick={() => removePhoto(photo)} aria-label={text(`شيل صورة ${number(index + 1)}`, `Remove photo ${index + 1}`)}><TrashIcon size={18} /></button>
                </li>)}
                {photos.length < maxPhotos && <li className="review-photo-add">
                  <label>
                    <input type="file" accept={PHOTO_TYPES.join(',')} multiple onChange={event => void addPhotos(event)} data-testid="review-photo-input" />
                    <CameraIcon size={24} aria-hidden="true" /><span>{text('أضف صورة', 'Add a photo')}</span>
                  </label>
                </li>}
              </ul>
              <p className="field-hint">{text('JPEG أو PNG أو WebP، لحد ٥ ميجا للصورة.', 'JPEG, PNG or WebP, up to 5 MB each.')}</p>
              <div role="status" aria-live="polite">{photoMessage && <p className="field-error">{photoMessage}</p>}</div>
            </section>}

            <div className="review-field">
              <label htmlFor={`${id}-name`}>{text('اسمك', 'Your name')} <small>{text('(اختياري)', '(optional)')}</small></label>
              <input id={`${id}-name`} value={name} maxLength={REVIEW_LIMITS.nameLength} autoComplete="name" dir="auto" aria-describedby={`${id}-name-hint`} onChange={event => setName(event.target.value)} />
              <p className="field-hint" id={`${id}-name-hint`}>{form.displayName === 'ANONYMOUS'
                ? text('المطعم بينشر التقييمات من غير أسماء.', 'The restaurant publishes reviews without names.')
                : <>{text('هيظهر باسم: ', 'Shown as: ')}<bdi dir="auto">{shownAs ?? text('ضيف', 'Guest')}</bdi></>}</p>
            </div>

            <fieldset className="review-contact">
              <legend>{text('المطعم يكلّمك؟', 'Should the restaurant reach you?')} <small>{text('(اختياري)', '(optional)')}</small></legend>
              <div className={`review-field ${errors.phone ? 'invalid' : ''}`}>
                <label htmlFor={`${id}-phone`}>{text('رقم تليفونك', 'Your phone number')}</label>
                <input id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} maxLength={20}
                  aria-invalid={errors.phone ? true : undefined} aria-describedby={describedBy('phone', true)}
                  onChange={event => { setPhone(event.target.value); clearError('phone'); if (!event.target.value.trim()) clearError('consent'); }} />
                <p className="field-hint" id={`${id}-phone-hint`}>{existing?.hasContact
                  ? text('سبت رقمك قبل كده، ومش بنعرضه هنا عشان خصوصيتك. هيفضل مع التقييم؛ اكتب رقم جديد لو عايز تغيّره، أو شيل علامة الموافقة عشان يتمسح.', 'You left your number before; for your privacy it is not shown here. It stays with your review: type a new one to change it, or untick consent to remove it.')
                  : text('المطعم بس اللي بيشوفه، عشان يتواصل معاك بخصوص تقييمك. مش بيظهر للناس أبدًا.', 'Only the restaurant sees it, to reach you about your review. It is never shown publicly.')}</p>
                {errors.phone && <p className="field-error" id={`${id}-phone-error`}>{errors.phone}</p>}
              </div>
              <div className={`review-consent ${errors.consent ? 'invalid' : ''}`}>
                <label>
                  <input id={`${id}-consent`} type="checkbox" checked={consent} aria-invalid={errors.consent ? true : undefined} aria-describedby={describedBy('consent')}
                    onChange={event => { setConsent(event.target.checked); clearError('consent'); }} />
                  <span>{text('موافق إن المطعم يكلّمني بخصوص التقييم ده', 'I agree that the restaurant may contact me about this review')}</span>
                </label>
                {errors.consent && <p className="field-error" id={`${id}-consent-error`}>{errors.consent}</p>}
              </div>
            </fieldset>
          </div>
          <footer className="review-sheet-footer">
            <div role="alert">{formError && <p className="review-alert"><WarningCircleIcon size={18} weight="fill" aria-hidden="true" /><span>{formError}</span></p>}</div>
            <button type="submit" className="review-button" disabled={submitting} aria-busy={submitting || undefined}>
              {submitting ? text('بنبعت…', 'Sending…') : editing ? text('احفظ التعديل', 'Save changes') : text('ابعت التقييم', 'Send review')}
            </button>
          </footer>
        </form>}
    </div>
  </dialog>;
}

/** After sending: what happens next, the Google invitation when the restaurant asks, and how long it can be edited. */
export function ReviewThanks({ result, branchName, headingRef, onClose }: { result: Pick<DinerReviewResult, 'outcome'> & { editableUntil?: string | null }; branchName: string | null; headingRef: Ref<HTMLHeadingElement>; onClose: () => void }) {
  const { language, text, number } = useLanguage();
  const { title, detail } = outcomeText(result.outcome, text);
  const google = safeExternalUrl(result.outcome.google?.url);
  const editable = result.editableUntil ? editWindowText(result.editableUntil, Date.now(), language, text, number) : null;
  return <div className="review-sheet-content review-thanks" data-testid="review-thanks" data-outcome={result.outcome.status.toLowerCase()}>
    <span className="review-thanks-mark" aria-hidden="true"><CheckCircleIcon size={40} weight="fill" /></span>
    <h3 ref={headingRef} tabIndex={-1}>{title}</h3>
    <p>{detail}</p>
    {editable && <p className="review-thanks-edit">{editable}</p>}
    {google && <div className="review-google" data-testid="review-google">
      <p>{branchName ? <>{text('عجبك؟ قيّم ', 'Enjoyed it? Review ')}<bdi>{branchTitle(branchName, language)}</bdi>{text(' على جوجل كمان، عشان ناس أكتر تعرفه.', ' on Google too, so more people find it.')}</> : text('عجبك؟ قيّم المطعم على جوجل كمان، عشان ناس أكتر تعرفه.', 'Enjoyed it? Review the restaurant on Google too, so more people find it.')}</p>
      <a className="review-button secondary" href={google} target="_blank" rel="noopener noreferrer"><GoogleLogoIcon size={20} weight="bold" aria-hidden="true" />{text('قيّم على جوجل', 'Review on Google')}<span className="visually-hidden">{text(' (بيفتح في صفحة جديدة)', ' (opens in a new tab)')}</span></a>
    </div>}
    <button type="button" className="review-button ghost" onClick={onClose}>{text('تمام', 'Done')}</button>
  </div>;
}
