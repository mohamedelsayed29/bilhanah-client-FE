import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router';
import {
  ArrowRightIcon, CameraIcon, ChatCircleTextIcon, EyeIcon, EyeSlashIcon, PencilSimpleIcon, PhoneIcon, SealCheckIcon, ThumbsDownIcon, ThumbsUpIcon, TrashIcon, WhatsappLogoIcon,
} from '@phosphor-icons/react';
import {
  hideReviewSchema, REVIEW_FOLLOW_UP_STATUSES, REVIEW_LIMITS, reviewFollowUpSchema, reviewReplySchema,
  type OwnerReview, type OwnerReviewPhoto, type ReviewEvent, type ReviewFollowUpStatus, type ReviewSettings,
} from '@bilhanah/contracts';
import type { z } from 'zod';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { useProtectedImage } from '../../components/ProtectedImage';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { reviewsApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { formatPrice } from '../../lib/format';
import { applyServerIssues, schemaResolver } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { replyVisibility, type ReplyVisibility, whatsappLink } from './present';
import {
  FOLLOW_UP_HELP, FOLLOW_UP_STEPS, FollowUpBadge, reviewKeys, ReviewStatusBadge, Stars, TagChip, useReviewActions, useReviewFormat, useReviewSettings,
} from './shared';

/** After a change: the review as the API answered, and every list and figure refreshed. */
function useApplyReview() {
  const queryClient = useQueryClient();
  return (review: OwnerReview) => {
    queryClient.setQueryData(reviewKeys.detail(review.id), review);
    for (const part of ['list', 'badge', 'stats', 'dishes']) void queryClient.invalidateQueries({ queryKey: ['reviews', part] });
  };
}

/** One review in full: ratings, dishes, photos, the order, the reply, moderation, the follow-up and the history. */
export function ReviewDetailPage() {
  const { text } = useLanguage();
  usePageTitle('تقييم', 'Review');
  const { reviewId = '' } = useParams();
  const review = useQuery({ queryKey: reviewKeys.detail(reviewId), queryFn: () => reviewsApi.get(reviewId), retry: (count, error) => (error as { status?: number }).status !== 404 && (error as { status?: number }).status !== 403 && count < 2 });
  const settings = useReviewSettings();
  return <>
    <BackToInbox />
    {review.isPending && <div className="rv-detail-skeleton"><Skeleton height={180} /><Skeleton height={120} /></div>}
    {review.isError && <Alert kind="error" title={text('مقدرناش نعرض التقييم ده', 'We could not show this review')}
      actions={<Button small variant="secondary" onClick={() => void review.refetch()}>{text('حاول تاني', 'Try again')}</Button>}>{errorMessage(review.error, text)}</Alert>}
    {review.data && <ReviewDetail review={review.data} settings={settings.data ?? null} />}
  </>;
}

function BackToInbox() {
  const { text } = useLanguage();
  const { to } = useWorkspace();
  const location = useLocation();
  const inbox = (location.state as { inbox?: string } | null)?.inbox ?? '';
  return <div className="back-row"><Link to={`${to('/reviews')}${inbox}`} className="back-link" data-testid="rv-back"><ArrowRightIcon size={16} className="directional" aria-hidden="true" />{text('كل التقييمات', 'All reviews')}</Link></div>;
}

function ReviewDetail({ review, settings }: { review: OwnerReview; settings: ReviewSettings | null }) {
  const { text, number } = useLanguage();
  const format = useReviewFormat();
  const actions = useReviewActions();
  const scope = useBranchScope();
  const ratings = Object.entries(review.ratings) as [keyof OwnerReview['ratings'], number][];
  return <div className="rv-detail" data-testid="rv-detail" data-status={review.status}>
    <div className="rv-detail-main">
      <article className={`card rv-review ${review.lowRating ? 'is-low' : ''}`} aria-labelledby="rv-review-title">
        <header className="rv-review-head">
          <div className="rv-review-score"><strong>{number(review.overall)}</strong><Stars value={review.overall} size={16} /></div>
          <div className="rv-review-who">
            <h2 id="rv-review-title"><bdi dir="auto">{format.diner(review.authorName)}</bdi></h2>
            <p className="rv-review-meta">
              {review.verified
                ? <span className="rv-verified"><SealCheckIcon size={15} weight="fill" aria-hidden="true" />{text('موثّق من طلب', 'Verified order')}</span>
                : <span className="badge badge-muted">{review.source === 'TABLE' ? text('من QR الطاولة', 'Table QR') : text('من المنيو', 'From the menu')} · {text('مش موثّق', 'Unverified')}</span>}
              {!scope.locked && <bdi>{review.branchName}</bdi>}
              {review.tableLabel && <bdi>{review.tableLabel}</bdi>}
              <time dateTime={review.createdAt}>{format.dateTime(review.createdAt)}</time>
              {review.edited && <span>{text(`اتعدّل ${format.relative(review.updatedAt)}`, `edited ${format.relative(review.updatedAt)}`)}</span>}
            </p>
            <p className="rv-review-public muted">{text('بيظهر للزباين باسم', 'Shown publicly as')} <strong><bdi dir="auto">{format.diner(review.displayName)}</bdi></strong></p>
          </div>
          <ReviewStatusBadge status={review.status} />
        </header>
        {ratings.length > 0 && <dl className="rv-ratings">
          {ratings.map(([key, value]) => <div key={key} className={value <= 2 ? 'is-low' : ''}><dt>{format.subRating(key)}</dt><dd><Stars value={value} size={13} /><span aria-hidden="true">{number(value)}</span></dd></div>)}
        </dl>}
        {review.comment
          ? <blockquote className="rv-comment" lang={review.language} dir="auto"><bdi dir="auto">{review.comment}</bdi></blockquote>
          : <p className="muted rv-no-comment">{text('من غير تعليق.', 'No comment.')}</p>}
        {review.tags.length > 0 && <div className="rv-tags" aria-label={text('اختيارات الزبون', 'What the diner picked')}>{review.tags.map(tag => <TagChip key={tag.code} tag={tag} />)}</div>}
        {review.dishes.length > 0 && <section className="rv-block" aria-labelledby="rv-dishes-title">
          <h3 id="rv-dishes-title">{text('الأطباق', 'Dishes')}</h3>
          <ul className="rv-dishes">{review.dishes.map((dish, index) => <li key={dish.orderItemId ?? `${dish.nameAr}-${index}`}>
            <bdi>{format.name(dish.nameAr, dish.nameEn)}</bdi>
            <DishRating rating={dish.rating} scale={settings?.dishRatingScale ?? 'THUMBS'} />
          </li>)}</ul>
        </section>}
        {review.photos.length > 0 && <Photos photos={review.photos} />}
      </article>
      {(actions.respond || review.reply) && <ReplyCard review={review} settings={settings} />}
    </div>
    <aside className="rv-detail-side" aria-label={text('الإجراءات', 'Actions')}>
      <ModerationCard review={review} settings={settings} />
      <FollowUpCard review={review} />
      {review.order && <OrderCard order={review.order} />}
    </aside>
    <div className="rv-detail-history"><History events={review.history} /></div>
  </div>;
}

/** Thumbs travel as 5 (up) and 1 (down); a stars scale shows the stars. */
function DishRating({ rating, scale }: { rating: number; scale: ReviewSettings['dishRatingScale'] }) {
  const { text } = useLanguage();
  if (scale === 'THUMBS' && (rating === 5 || rating === 1)) {
    return rating === 5
      ? <span className="rv-thumb is-up"><ThumbsUpIcon size={16} weight="fill" aria-hidden="true" />{text('عجبه', 'Liked it')}</span>
      : <span className="rv-thumb is-down"><ThumbsDownIcon size={16} weight="fill" aria-hidden="true" />{text('ماعجبوش', 'Didn’t like it')}</span>;
  }
  return <Stars value={rating} size={13} />;
}

function Photos({ photos }: { photos: OwnerReviewPhoto[] }) {
  const { text, number } = useLanguage();
  const [open, setOpen] = useState<OwnerReviewPhoto | null>(null);
  return <section className="rv-block" aria-labelledby="rv-photos-title">
    <h3 id="rv-photos-title">{text('الصور', 'Photos')}</h3>
    <ul className="rv-photos">{photos.map((photo, index) => <li key={photo.id}>
      <button type="button" className="rv-photo" onClick={() => setOpen(photo)} aria-label={text(`افتح الصورة ${number(index + 1)}`, `Open photo ${index + 1}`)}>
        <ReviewPhoto photo={photo} sizes="160px" alt="" />
      </button>
    </li>)}</ul>
    <Dialog open={open !== null} onClose={() => setOpen(null)} size="wide" title={text('صورة من الزبون', 'Diner’s photo')}
      footer={<Button variant="secondary" onClick={() => setOpen(null)} data-autofocus>{text('إغلاق', 'Close')}</Button>}>
      {open && <div className="rv-photo-large"><ReviewPhoto photo={open} sizes="720px" alt={text('صورة من الزبون', 'Photo from the diner')} /></div>}
    </Dialog>
  </section>;
}

/** Published photos have public renditions; private ones are streamed through the API with the session. */
function ReviewPhoto({ photo, sizes, alt }: { photo: OwnerReviewPhoto; sizes: string; alt: string }) {
  const { text } = useLanguage();
  const publicSource = photo.sources[0];
  const image = useProtectedImage(publicSource ? null : photo.privateUrl);
  if (publicSource) return <img src={publicSource.url} srcSet={photo.sources.map(source => `${source.url} ${source.width}w`).join(', ')} sizes={sizes} alt={alt} loading="lazy" width={photo.width} height={photo.height} />;
  if (image.error) return <span className="rv-photo-state"><CameraIcon size={20} aria-hidden="true" /><small>{text('الصورة مش متاحة', 'Photo unavailable')}</small></span>;
  if (!image.url) return <Skeleton height="100%" radius={0} />;
  return <img src={image.url} alt={alt} width={photo.width} height={photo.height} />;
}

const VISIBILITY_NOTE: Record<ReplyVisibility, [string, string]> = {
  public: ['الرد هيظهر تحت التقييم في صفحة التقييمات على المنيو.', 'The reply shows under the review on your menu’s reviews page.'],
  pending: ['التقييم لسه مستني موافقتك، فالرد مش هيظهر لحد ما تنشره.', 'The review is waiting for you, so the reply shows once you publish it.'],
  hidden: ['التقييم مخفي، فالرد مش ظاهر لحد. هيظهر لو نشرته تاني.', 'The review is hidden, so nobody sees the reply. It shows if you publish the review again.'],
  never: ['التقييمات كلها خاصة (النشر مقفول في الإعدادات)، فالرد مش هيظهر للزباين.', 'Every review is kept private (publishing is off in the settings), so diners will not see the reply.'],
  'page-off': ['صفحة التقييمات مقفولة على المنيو، فالرد هيظهر لما تفتحها من الإعدادات.', 'The reviews page is off on your menu; the reply shows once you turn it on in the settings.'],
};

type ReplyValues = z.input<typeof reviewReplySchema>;

/** The restaurant's one public reply: write, edit or remove it, with how it will look to diners. */
function ReplyCard({ review, settings }: { review: OwnerReview; settings: ReviewSettings | null }) {
  const { text, number } = useLanguage();
  const format = useReviewFormat();
  const actions = useReviewActions();
  const toast = useToast();
  const apply = useApplyReview();
  const restaurantName = useWorkspace().restaurant.name;
  const [editing, setEditing] = useState(!review.reply);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { register, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm<ReplyValues>({
    resolver: schemaResolver(reviewReplySchema),
    defaultValues: { text: review.reply?.text ?? '' },
  });
  const draft = watch('text') ?? '';
  const remove = useMutation({
    mutationFn: () => reviewsApi.removeReply(review.id),
    onSuccess: saved => { apply(saved); reset({ text: '' }); setEditing(true); setConfirmRemove(false); toast.success(text('اتشال الرد', 'Reply removed')); },
    onError: error => { setConfirmRemove(false); toast.error(errorMessage(error, text)); },
  });
  const submit = handleSubmit(async values => {
    try {
      const saved = await reviewsApi.reply(review.id, values.text);
      apply(saved);
      reset({ text: saved.reply?.text ?? values.text });
      setEditing(false);
      toast.success(review.reply ? text('اتحفظ الرد', 'Reply saved') : text('اتنشر ردك', 'Reply posted'));
    } catch (error) {
      if (!applyServerIssues(error, setError, ['text'])) toast.error(errorMessage(error, text));
    }
  });
  const visibility = replyVisibility(review.status, settings);
  const length = [...draft].length;
  return <section className="card rv-card" aria-labelledby="rv-reply-title" data-testid="rv-reply">
    <header className="rv-card-head">
      <h2 id="rv-reply-title"><ChatCircleTextIcon size={19} aria-hidden="true" />{text('ردك على الزبون', 'Your reply')}</h2>
      {review.reply && !editing && actions.respond && <div className="rv-card-actions">
        <Button small variant="ghost" icon={<PencilSimpleIcon size={16} aria-hidden="true" />} onClick={() => setEditing(true)} data-testid="rv-reply-edit">{text('عدّل', 'Edit')}</Button>
        <Button small variant="ghost" icon={<TrashIcon size={16} aria-hidden="true" />} onClick={() => setConfirmRemove(true)} data-testid="rv-reply-remove">{text('شيل الرد', 'Remove')}</Button>
      </div>}
    </header>
    {review.reply && !editing && <div className="rv-reply-current">
      <p dir="auto"><bdi dir="auto">{review.reply.text}</bdi></p>
      <small className="muted">{[review.reply.byName, format.dateTime(review.reply.at), review.reply.updatedAt !== review.reply.at ? text(`اتعدّل ${format.relative(review.reply.updatedAt)}`, `edited ${format.relative(review.reply.updatedAt)}`) : null].filter(Boolean).join(' · ')}</small>
    </div>}
    {editing && actions.respond && <form className="form rv-reply-form" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
      <Field label={text('الرد اللي هيظهر للناس', 'The reply diners will see')} error={errors.text}
        hint={<span className="rv-counter" aria-live="polite">{text(`${number(length)} من ${number(REVIEW_LIMITS.replyLength)} حرف`, `${length} of ${REVIEW_LIMITS.replyLength} characters`)}</span>}>
        <textarea className="textarea" dir="auto" rows={4} maxLength={REVIEW_LIMITS.replyLength} data-testid="rv-reply-text"
          placeholder={text('اشكر الزبون، ولو في مشكلة قوله هتتعامل معاها إزاي.', 'Thank the diner; if something went wrong, say how you are handling it.')} {...register('text')} />
      </Field>
      <div className="rv-preview" aria-label={text('معاينة: كده هيظهر للزباين', 'Preview: how diners will see it')} data-testid="rv-reply-preview">
        <span className="rv-preview-label"><EyeIcon size={15} aria-hidden="true" />{text('كده هيظهر للزباين', 'How diners will see it')}</span>
        <div className="rv-preview-card">
          <div className="rv-preview-head"><strong><bdi dir="auto">{format.diner(review.displayName)}</bdi></strong><Stars value={review.overall} size={12} />
            {review.verified && <span className="rv-verified is-small"><SealCheckIcon size={13} weight="fill" aria-hidden="true" />{text('طلب موثّق', 'Verified order')}</span>}</div>
          {review.comment && <p className="rv-preview-comment" dir="auto"><bdi dir="auto">{review.comment}</bdi></p>}
          <div className="rv-preview-reply">
            <strong>{text('رد', 'Reply from')} <bdi>{restaurantName}</bdi></strong>
            <p dir="auto"><bdi dir="auto">{draft.trim() || text('…', '…')}</bdi></p>
          </div>
        </div>
        <p className={`rv-visibility is-${visibility}`} data-visibility={visibility}>{text(...VISIBILITY_NOTE[visibility])}</p>
      </div>
      <div className="form-actions form-actions-end">
        {review.reply && <Button variant="secondary" disabled={isSubmitting} onClick={() => { reset({ text: review.reply?.text ?? '' }); setEditing(false); }}>{text('إلغاء', 'Cancel')}</Button>}
        <Button type="submit" loading={isSubmitting} disabled={!draft.trim() || draft.trim() === review.reply?.text} data-testid="rv-reply-save">{review.reply ? text('احفظ الرد', 'Save reply') : text('انشر الرد', 'Post reply')}</Button>
      </div>
    </form>}
    {!review.reply && !actions.respond && <p className="muted">{text('لسه محدش رد.', 'No reply yet.')}</p>}
    <ConfirmDialog open={confirmRemove} title={text('تشيل الرد؟', 'Remove the reply?')} confirmLabel={text('شيل الرد', 'Remove reply')} busy={remove.isPending}
      description={text('الرد هيختفي من تحت التقييم. وقت أول رد بيفضل محسوب في سرعة الرد.', 'The reply disappears from under the review. The time of the first reply still counts in your reply time.')}
      onCancel={() => setConfirmRemove(false)} onConfirm={() => remove.mutate()} />
  </section>;
}

type HideValues = z.input<typeof hideReviewSchema>;

/** Publish a waiting or hidden review, or hide one with a reason (kept and audited). */
function ModerationCard({ review, settings }: { review: OwnerReview; settings: ReviewSettings | null }) {
  const { text } = useLanguage();
  const format = useReviewFormat();
  const actions = useReviewActions();
  const toast = useToast();
  const apply = useApplyReview();
  const [hiding, setHiding] = useState(false);
  const never = settings?.publishMode === 'NEVER';
  const publish = useMutation({
    mutationFn: () => reviewsApi.publish(review.id),
    onSuccess: saved => { apply(saved); toast.success(text('التقييم اتنشر', 'Review published')); },
    onError: error => toast.error(errorMessage(error, text)),
  });
  const status: Record<OwnerReview['status'], [string, string]> = {
    PUBLISHED: settings && !settings.showOnMenu
      ? ['منشور، بس صفحة التقييمات مقفولة على المنيو، فالزباين مش شايفينه دلوقتي.', 'Published, but the reviews page is off on your menu, so diners do not see it now.']
      : ['ظاهر للزباين في صفحة التقييمات وبيدخل في المتوسط اللي على المنيو.', 'Shown to diners on the reviews page and counted in the average on your menu.'],
    PENDING: never
      ? ['التقييمات كلها خاصة (النشر مقفول في الإعدادات). بيفضل ظاهر لك هنا وفي الأرقام.', 'Every review is kept private (publishing is off in the settings). It stays here and in your figures.']
      : ['مستني موافقتك: مش ظاهر للزباين لحد ما تنشره. بيدخل في أرقامك عادي.', 'Waiting for you: diners do not see it until you publish it. It counts in your figures as usual.'],
    HIDDEN: ['مخفي عن الزباين ومش داخل في المتوسط اللي على المنيو. بيفضل ظاهر لك هنا وفي الأرقام.', 'Hidden from diners and left out of the average on your menu. It stays here and in your figures.'],
  };
  return <section className="card rv-card" aria-labelledby="rv-moderation-title" data-testid="rv-moderation">
    <header className="rv-card-head"><h2 id="rv-moderation-title">{text('الظهور على المنيو', 'On your menu')}</h2><ReviewStatusBadge status={review.status} /></header>
    <p className="rv-card-text">{text(...status[review.status])}</p>
    {review.hidden && <div className="rv-hidden-reason" data-testid="rv-hidden-reason">
      <strong>{text('سبب الإخفاء', 'Why it was hidden')}</strong>
      <p dir="auto"><bdi dir="auto">{review.hidden.reason}</bdi></p>
      <small className="muted">{[review.hidden.byName, format.dateTime(review.hidden.at)].filter(Boolean).join(' · ')}</small>
    </div>}
    {actions.moderate && <div className="rv-card-actions is-stacked">
      {review.status !== 'PUBLISHED' && <Button variant={review.status === 'PENDING' ? 'primary' : 'secondary'} block loading={publish.isPending} disabled={never}
        icon={<EyeIcon size={17} aria-hidden="true" />} onClick={() => publish.mutate()} data-testid="rv-publish">
        {review.status === 'HIDDEN' ? text('انشره تاني', 'Publish again') : text('انشر التقييم', 'Publish review')}
      </Button>}
      {review.status !== 'HIDDEN' && <Button variant="danger-outline" block icon={<EyeSlashIcon size={17} aria-hidden="true" />} onClick={() => setHiding(true)} data-testid="rv-hide">{text('اخفيه', 'Hide review')}</Button>}
      {never && review.status !== 'PUBLISHED' && <small className="muted">{text('النشر مقفول من الإعدادات («متتنشرش خالص»).', 'Publishing is off in the settings (“Never publish”).')}</small>}
    </div>}
    {hiding && <HideDialog review={review} onClose={() => setHiding(false)} />}
  </section>;
}

function HideDialog({ review, onClose }: { review: OwnerReview; onClose: () => void }) {
  const { text, number } = useLanguage();
  const toast = useToast();
  const apply = useApplyReview();
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<HideValues>({ resolver: schemaResolver(hideReviewSchema), defaultValues: { reason: '' } });
  const reason = watch('reason') ?? '';
  const submit = handleSubmit(async values => {
    try {
      const saved = await reviewsApi.hide(review.id, values);
      apply(saved);
      toast.success(text('التقييم اتخفى', 'Review hidden'));
      onClose();
    } catch (error) {
      if (!applyServerIssues(error, setError, ['reason'])) toast.error(errorMessage(error, text));
    }
  });
  return <Dialog open onClose={onClose} size="small" busy={isSubmitting} onSubmit={() => void submit()} title={text('تخفي التقييم ده؟', 'Hide this review?')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" variant="danger" loading={isSubmitting} data-testid="rv-hide-confirm">{text('اخفيه', 'Hide review')}</Button>
    </>}>
    <div className="form">
      <p className="muted rv-dialog-text">{text('الزباين مش هيشوفوه ومش هيدخل في المتوسط اللي على المنيو. بيفضل هنا وفي أرقامك، والسبب بيتسجل.', 'Diners will not see it and it leaves the average on your menu. It stays here and in your figures, and the reason is recorded.')}</p>
      <Field label={text('السبب', 'Reason')} error={errors.reason} required
        hint={text(`مثلًا: فيه رقم تليفون أو شتيمة، أو مش عن المطعم. (${number([...reason].length)} من ${number(REVIEW_LIMITS.hideReasonLength)})`, `For example: it has a phone number or abuse, or it is not about the restaurant. (${[...reason].length} of ${REVIEW_LIMITS.hideReasonLength})`)}>
        <textarea className="textarea" dir="auto" rows={3} maxLength={REVIEW_LIMITS.hideReasonLength} data-autofocus data-testid="rv-hide-reason" {...register('reason')} />
      </Field>
    </div>
  </Dialog>;
}

type FollowUpValues = { status: ReviewFollowUpStatus; note: string; assigneeId: string };

/** Following up an unhappy diner: the step reached, who is on it, internal notes (with their history), and how to reach the diner. */
function FollowUpCard({ review }: { review: OwnerReview }) {
  const { text, number } = useLanguage();
  const format = useReviewFormat();
  const actions = useReviewActions();
  const toast = useToast();
  const apply = useApplyReview();
  const assignees = useQuery({ queryKey: reviewKeys.assignees(review.branchId), queryFn: () => reviewsApi.assignees(review.branchId), enabled: actions.respond, staleTime: 60_000 });
  const current = review.followUp;
  const defaults: FollowUpValues = { status: current?.status ?? 'OPEN', note: '', assigneeId: current?.assigneeId ?? '' };
  const { register, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm<FollowUpValues>({ defaultValues: defaults });
  const values = watch();
  const notes = review.history.filter(event => event.kind === 'FOLLOW_UP').reverse();
  const changed = !current || values.status !== current.status || values.note.trim() !== '' || values.assigneeId !== (current.assigneeId ?? '');
  const submit = handleSubmit(async submitted => {
    const body = {
      status: submitted.status,
      note: submitted.note.trim() || null,
      // Omitted keeps the assignee; null clears it.
      ...(submitted.assigneeId !== (current?.assigneeId ?? '') ? { assigneeId: submitted.assigneeId || null } : {}),
    };
    const parsed = reviewFollowUpSchema.safeParse(body);
    if (!parsed.success) { setError('note', { type: 'validate', message: `@@max|string|${REVIEW_LIMITS.noteLength}` }); return; }
    try {
      const saved = await reviewsApi.followUp(review.id, parsed.data);
      apply(saved);
      reset({ status: saved.followUp?.status ?? submitted.status, note: '', assigneeId: saved.followUp?.assigneeId ?? '' });
      toast.success(text('اتحفظت المتابعة', 'Follow-up saved'));
    } catch (error) {
      if (!applyServerIssues(error, setError, ['status', 'note', 'assigneeId'])) toast.error(errorMessage(error, text));
    }
  });
  const phone = review.contactPhone;
  const whatsapp = phone ? whatsappLink(phone) : null;
  const assigneeChoices = assignees.data ?? [];
  const missingAssignee = current?.assigneeId && !assigneeChoices.some(person => person.id === current.assigneeId) ? { id: current.assigneeId, fullName: current.assigneeName ?? '—' } : null;
  return <section className="card rv-card" aria-labelledby="rv-follow-title" data-testid="rv-follow-up">
    <header className="rv-card-head"><h2 id="rv-follow-title">{text('متابعة الزبون', 'Following up')}</h2>{current && <FollowUpBadge status={current.status} />}</header>
    {current
      ? <p className="rv-card-text">{current.assigneeName ? text(`مع ${current.assigneeName}`, `With ${current.assigneeName}`) : text('مش متسلّمة لحد.', 'Not given to anyone.')} <span className="muted">· {format.relative(current.updatedAt)}</span></p>
      : <p className="rv-card-text muted">{review.lowRating ? text('مفيش متابعة لسه.', 'No follow-up yet.') : text('التقييم ده مش محتاج متابعة، بس تقدر تبدأ واحدة لو حابب.', 'This review does not need a follow-up, but you can start one.')}</p>}
    {phone && <div className="rv-contact" data-testid="rv-contact">
      <span className="muted">{text('الزبون وافق نكلّمه على', 'The diner agreed to be contacted on')}</span>
      <strong className="ltr">{phone}</strong>
      <div className="rv-contact-actions">
        <a className="button button-secondary button-small" href={`tel:${phone.replace(/[^\d+]/g, '')}`}><PhoneIcon size={16} aria-hidden="true" />{text('اتصل', 'Call')}</a>
        {whatsapp && <a className="button button-secondary button-small" href={whatsapp} target="_blank" rel="noreferrer"><WhatsappLogoIcon size={16} aria-hidden="true" />{text('واتساب', 'WhatsApp')}</a>}
      </div>
    </div>}
    {!phone && review.hasContact && <p className="field-hint">{text('الزبون ساب رقم؛ اللي عندهم صلاحية الرد والمتابعة بس يقدروا يشوفوه.', 'The diner left a number; only people who reply and follow up can see it.')}</p>}
    {!review.hasContact && <p className="field-hint">{text('الزبون ماسابش رقم للتواصل.', 'The diner did not leave a number to reach them.')}</p>}
    {actions.respond && <form className="form rv-follow-form" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset className="field">
        <legend className="field-label">{text('وصلنا لفين', 'Where it stands')}</legend>
        <div className="segmented rv-follow-steps" data-testid="rv-follow-status">
          {REVIEW_FOLLOW_UP_STATUSES.map(status => <label key={status} title={text(...FOLLOW_UP_HELP[status])}>
            <input type="radio" value={status} {...register('status')} />{text(...FOLLOW_UP_STEPS[status])}
          </label>)}
        </div>
        <p className="field-hint">{text(...FOLLOW_UP_HELP[values.status])}</p>
      </fieldset>
      <Field label={text('مين ماسكها', 'Who is on it')} hint={assignees.isError ? errorMessage(assignees.error, text) : undefined}>
        <select className="select" {...register('assigneeId')} data-testid="rv-follow-assignee" disabled={assignees.isPending}>
          <option value="">{text('محدش', 'Nobody')}</option>
          {missingAssignee && <option value={missingAssignee.id}>{missingAssignee.fullName}</option>}
          {assigneeChoices.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}
        </select>
      </Field>
      <Field label={text('ملاحظة داخلية', 'Internal note')} optional error={errors.note}
        hint={text(`للفريق بس، الزبون مش بيشوفها. (${number([...values.note].length)} من ${number(REVIEW_LIMITS.noteLength)})`, `For the team only; the diner never sees it. (${[...values.note].length} of ${REVIEW_LIMITS.noteLength})`)}>
        <textarea className="textarea" dir="auto" rows={3} maxLength={REVIEW_LIMITS.noteLength} data-testid="rv-follow-note" {...register('note')}
          placeholder={text('كلّمته الساعة ٨، اتفقنا نعوضه في الطلب الجاي…', 'Called at 8, agreed to make it up on the next order…')} />
      </Field>
      <Button type="submit" loading={isSubmitting} disabled={!changed} data-testid="rv-follow-save">{current ? text('احفظ المتابعة', 'Save follow-up') : text('ابدأ متابعة', 'Start a follow-up')}</Button>
    </form>}
    {notes.length > 0 && <section className="rv-notes" aria-labelledby="rv-notes-title">
      <h3 id="rv-notes-title">{text('سجل المتابعة', 'Follow-up history')}</h3>
      <ol>{notes.map((event, index) => <li key={`${event.at}-${index}`}>
        <div className="rv-note-head">{event.followUpStatus && <FollowUpBadge status={event.followUpStatus} />}<small className="muted">{[event.actorName, format.dateTime(event.at)].filter(Boolean).join(' · ')}</small></div>
        {event.assigneeName && <small>{text(`اتسلّمت لـ ${event.assigneeName}`, `Given to ${event.assigneeName}`)}</small>}
        {event.note && <p dir="auto"><bdi dir="auto">{event.note}</bdi></p>}
      </li>)}</ol>
    </section>}
  </section>;
}

function OrderCard({ order }: { order: NonNullable<OwnerReview['order']> }) {
  const { text, number, language } = useLanguage();
  const format = useReviewFormat();
  return <section className="card rv-card" aria-labelledby="rv-order-title" data-testid="rv-order">
    <header className="rv-card-head"><h2 id="rv-order-title">{text(`طلب #${number(order.number)}`, `Order #${order.number}`)}</h2>
      <span className="badge badge-muted">{order.type === 'DINE_IN' ? text('صالة', 'Dine-in') : text('تيك أواي', 'Pickup')}</span></header>
    <p className="rv-card-text muted">{format.dateTime(order.placedAt)}</p>
    <ul className="rv-order-items">{order.items.map(item => <li key={item.id}>
      <span className="rv-order-qty">{number(item.quantity)}×</span>
      <bdi>{format.name(item.nameAr, item.nameEn)}{(item.variantNameAr || item.variantNameEn) && <small> · {format.name(item.variantNameAr, item.variantNameEn)}</small>}</bdi>
      <span className="rv-order-price">{formatPrice(item.lineTotalPiastres, language)}</span>
    </li>)}</ul>
    <p className="rv-order-total"><span>{text('الإجمالي', 'Subtotal')}</span><strong>{formatPrice(order.subtotalPiastres, language)}</strong></p>
  </section>;
}

const EVENT_LABELS: Record<ReviewEvent['kind'], [string, string]> = {
  CREATED: ['الزبون كتب التقييم', 'The diner wrote the review'],
  EDITED: ['الزبون عدّل التقييم', 'The diner edited the review'],
  PUBLISHED: ['اتنشر', 'Published'],
  HIDDEN: ['اتخفى', 'Hidden'],
  REPLIED: ['اترد عليه', 'Replied'],
  REPLY_REMOVED: ['الرد اتشال', 'Reply removed'],
  FOLLOW_UP: ['متابعة', 'Follow-up'],
};

/** Everything that happened to the review, oldest first (edits keep the rating before). */
function History({ events }: { events: ReviewEvent[] }) {
  const { text, number } = useLanguage();
  const format = useReviewFormat();
  if (events.length === 0) return null;
  return <section className="card rv-card" aria-labelledby="rv-history-title" data-testid="rv-history">
    <header className="rv-card-head"><h2 id="rv-history-title">{text('اللي حصل', 'History')}</h2></header>
    <ol className="timeline rv-history">{events.map((event, index) => <li key={`${event.kind}-${event.at}-${index}`} className={`timeline-item ${index === events.length - 1 ? 'is-current' : ''}`}>
      <span className="timeline-dot" aria-hidden="true" />
      <div className="timeline-body">
        <div className="timeline-head"><strong>{text(...EVENT_LABELS[event.kind])}</strong>
          {event.kind === 'FOLLOW_UP' && event.followUpStatus && <FollowUpBadge status={event.followUpStatus} />}
          <small className="muted">{[event.actorName, format.dateTime(event.at)].filter(Boolean).join(' · ')}</small></div>
        {event.kind === 'EDITED' && event.previousOverall !== null && <small className="muted">{text(`كان ${number(event.previousOverall)} من ٥`, `It was ${event.previousOverall} of 5`)}</small>}
        {event.kind === 'HIDDEN' && event.note && <small><bdi dir="auto">{text('السبب: ', 'Reason: ')}{event.note}</bdi></small>}
        {event.kind === 'FOLLOW_UP' && event.assigneeName && <small>{text(`مع ${event.assigneeName}`, `With ${event.assigneeName}`)}</small>}
        {event.kind === 'FOLLOW_UP' && event.note && <small><bdi dir="auto">{event.note}</bdi></small>}
      </div>
    </li>)}</ol>
  </section>;
}
