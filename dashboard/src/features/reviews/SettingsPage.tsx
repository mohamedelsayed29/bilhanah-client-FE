import { useEffect, useId, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import {
  ArrowSquareOutIcon, BellRingingIcon, ChatCircleDotsIcon, ForkKnifeIcon, GlobeHemisphereEastIcon, GoogleLogoIcon, PlusIcon, ScalesIcon, ShieldCheckIcon, StarIcon, TagIcon, TrashIcon, UserCircleIcon,
} from '@phosphor-icons/react';
import {
  DEFAULT_REVIEW_SETTINGS, PERMISSION_LABELS, REVIEW_ASK_AFTER, REVIEW_DISPLAY_NAMES, REVIEW_LIMITS, REVIEW_PUBLISH_MODES, REVIEW_SUB_RATING_LABELS, REVIEW_SUB_RATINGS,
  reviewDisplayName, reviewSettingsSchema, ROLE_LABELS, rolesWith,
  type ReviewAskAfter, type ReviewDisplayNameMode, type ReviewPublishMode, type ReviewSettings, type ReviewSubRating, type ReviewTag,
} from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Option, SaveBar, SectionHead, SettingsLayout, type SettingsSection } from '../../components/SettingsSections';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { reviewsApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { contractIssues } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchList, useWorkspace } from '../branches/workspace';
import { REVIEW_PERMISSIONS } from './access';
import { REVIEW_PERMISSION_HELP } from './permission-help';
import { type Draft, newTagKey, settingsBody, toDraft, whole } from './settings-form';
import { reviewKeys, useReviewFormat, useReviewSettings } from './shared';

type Label = [string, string];

const ASK_AFTER: Record<ReviewAskAfter, { label: Label; help: Label }> = {
  READY: { label: ['أول ما الطلب يجهز', 'Once the order is ready'], help: ['صفحة المتابعة بتسأل الزبون أول ما المطبخ يعلّم الطلب جاهز.', 'The tracking page asks as soon as the kitchen marks the order ready.'] },
  COMPLETED: { label: ['بعد ما يستلم الطلب', 'After the order is handed over'], help: ['بتسأل بعد ما الطلب يتسلم أو يتقدّم، لما الزبون يكون جرّب الأكل.', 'It asks once the order is handed over or served, when the diner has tasted the food.'] },
};

const PUBLISH: Record<ReviewPublishMode, { label: Label; help: Label }> = {
  AUTO: { label: ['انشر تلقائي', 'Publish automatically'], help: ['التقييمات من الحد اللي تختاره ولفوق بتتنشر على طول، والباقي يستناك.', 'Reviews at or above the rating you pick are published at once; the rest wait for you.'] },
  MANUAL: { label: ['أنا أوافق على كل تقييم', 'I approve each review'], help: ['كل تقييم بيستناك تنشره أو تخفيه.', 'Every review waits for you to publish or hide it.'] },
  NEVER: { label: ['متتنشرش خالص', 'Never publish'], help: ['التقييمات بتوصلك أنت بس، ومفيش صفحة تقييمات ولا تقييم على الأطباق.', 'Reviews reach you only; there is no reviews page and no rating on dishes.'] },
};

const DISPLAY: Record<ReviewDisplayNameMode, Label> = {
  FIRST_NAME_INITIAL: ['الاسم الأول وأول حرف من الأخير', 'First name and last initial'],
  FIRST_NAME: ['الاسم الأول بس', 'First name only'],
  ANONYMOUS: ['من غير اسم («ضيف»)', 'No name (“Guest”)'],
};

type SectionKey = 'ask' | 'what' | 'tags' | 'publish' | 'menu' | 'google' | 'alerts' | 'name' | 'permissions';
const SECTIONS: SettingsSection<SectionKey>[] = [
  { key: 'ask', icon: ChatCircleDotsIcon, label: ['سؤال الزباين', 'Asking diners'], hint: ['تشغيل التقييم وإمتى نسأل', 'On or off, and when to ask'] },
  { key: 'what', icon: StarIcon, label: ['الزبون بيقيّم إيه', 'What diners rate'], hint: ['الأسئلة والأطباق والصور', 'Questions, dishes and photos'] },
  { key: 'tags', icon: TagIcon, label: ['اختيارات سريعة', 'Quick chips'], hint: ['كلمات بيدوس عليها بدل الكتابة', 'Words diners tap'] },
  { key: 'publish', icon: GlobeHemisphereEastIcon, label: ['النشر', 'Publishing'], hint: ['تلقائي أو بموافقتك', 'Automatic or approved'] },
  { key: 'menu', icon: ForkKnifeIcon, label: ['على المنيو', 'On your menu'], hint: ['صفحة التقييمات وتقييم الأطباق', 'Reviews page and dish ratings'] },
  { key: 'google', icon: GoogleLogoIcon, label: ['تقييمات جوجل', 'Google reviews'], hint: ['دعوة الزبون المبسوط', 'Inviting happy diners'] },
  { key: 'alerts', icon: BellRingingIcon, label: ['التنبيهات والمتابعة', 'Alerts and follow-ups'], hint: ['التقييمات الضعيفة والتعديل', 'Low ratings and edits'] },
  { key: 'name', icon: UserCircleIcon, label: ['اسم الزبون', 'Diner’s name'], hint: ['إزاي الاسم يظهر', 'How the name shows'] },
  { key: 'permissions', icon: ShieldCheckIcon, label: ['الصلاحيات', 'Permissions'], hint: ['مين يقدر يعمل إيه', 'Who can do what'] },
];

/** Every review setting, one section at a time beside a menu of them, and who may do what. */
export function ReviewsSettingsPage() {
  const { text } = useLanguage();
  usePageTitle('إعدادات التقييمات', 'Review settings');
  const settings = useReviewSettings();
  const [params, setParams] = useSearchParams();
  const [dirty, setDirty] = useState(false);
  const wanted = params.get('section') as SectionKey | null;
  const section: SectionKey = SECTIONS.some(entry => entry.key === wanted) ? wanted! : 'ask';
  const open = (key: SectionKey) => setParams(current => { const next = new URLSearchParams(current); if (key === 'ask') next.delete('section'); else next.set('section', key); return next; }, { replace: true });
  return <SettingsLayout sections={SECTIONS} current={section} onOpen={open} unsaved={dirty} label={text('أقسام إعدادات التقييمات', 'Review settings sections')}>
    {settings.isError && <ErrorPanel error={settings.error} onRetry={() => void settings.refetch()} />}
    {settings.isPending && section !== 'permissions' && <Skeleton height={320} />}
    {/* The form stays mounted while other sections are open, so edits are kept until saved or undone. */}
    {settings.data && <SettingsForm settings={settings.data} section={section} onDirty={setDirty} />}
    {section === 'permissions' && <PermissionsCard />}
  </SettingsLayout>;
}

function SettingsForm({ settings, section, onDirty }: { settings: ReviewSettings; section: SectionKey; onDirty: (dirty: boolean) => void }) {
  const { text, number } = useLanguage();
  const format = useReviewFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  useEffect(() => setDraft(toDraft(settings)), [settings]);
  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const body = settingsBody(draft);
  const issues = contractIssues(reviewSettingsSchema, body);
  const issueAt = (path: string) => issues.find(issue => issue.path === path || issue.path.startsWith(`${path}.`));
  const baseline = useMemo(() => JSON.stringify(settingsBody(toDraft(settings))), [settings]);
  const dirty = JSON.stringify(body) !== baseline;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const save = useMutation({
    mutationFn: () => reviewsApi.updateSettings(body),
    onSuccess: next => {
      queryClient.setQueryData(reviewKeys.settings, next);
      for (const part of ['stats', 'dishes']) void queryClient.invalidateQueries({ queryKey: ['reviews', part] });
      toast.success(text('اتحفظت إعدادات التقييمات', 'Review settings saved'));
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const toggleSub = (key: ReviewSubRating) => set('subRatings')(draft.subRatings.includes(key) ? draft.subRatings.filter(entry => entry !== key) : [...draft.subRatings, key]);
  const starOptions = (from: number) => [1, 2, 3, 4, 5].filter(value => value >= from);
  const below = (value: number) => text(`أقل من ${number(value)} نجوم`, `Below ${value} stars`);
  return <form className="inv-settings rv-settings" noValidate onSubmit={event => { event.preventDefault(); if (!issues.length && dirty) save.mutate(); }} data-testid="reviews-settings">
    {section === 'ask' && <section className="card inv-set-card" aria-labelledby="rs-ask">
      <SectionHead id="rs-ask" icon={ChatCircleDotsIcon} title={text('سؤال الزباين', 'Asking diners')} text={text('صفحة متابعة الطلب هي اللي بتسأل الزبون عن رأيه.', 'The order tracking page is where diners are asked.')} />
      <Switch checked={draft.enabled} onChange={set('enabled')} label={text('اسأل الزباين عن رأيهم', 'Ask diners for feedback')}
        description={text('صفحة متابعة الطلب بتطلب من الزبون يقيّم زيارته والأطباق. لو مقفولة، محدش بيتسأل والتقييمات القديمة بتفضل.', 'The order tracking page asks diners to rate their visit and dishes. Off: nobody is asked, and earlier reviews stay.')} />
      <fieldset className="field">
        <legend className="field-label">{text('نسأله إمتى', 'When to ask')}</legend>
        <div className="inv-options">{REVIEW_ASK_AFTER.map(value => <Option key={value} name="ask-after" checked={draft.askAfter === value} onChange={() => set('askAfter')(value)}
          title={text(...ASK_AFTER[value].label)} help={text(...ASK_AFTER[value].help)} />)}</div>
      </fieldset>
      <Switch checked={draft.allowUnverified} onChange={set('allowUnverified')} label={text('اقبل رأي من غير طلب', 'Accept feedback without an order')}
        description={text('الزبون يقدر يكتب رأيه من QR الطاولة أو المنيو من غير ما يطلب. بيتعلّم «مش موثّق» في كل مكان، وبحد ٥ في اليوم لكل جهاز.', 'Diners can leave feedback from a table QR or the menu without ordering. It is labelled “unverified” everywhere, and limited to 5 a day per device.')} />
    </section>}

    {section === 'what' && <section className="card inv-set-card" aria-labelledby="rs-what">
      <SectionHead id="rs-what" icon={StarIcon} title={text('الزبون بيقيّم إيه', 'What diners rate')} text={text('التقييم العام دايمًا موجود؛ هنا بتختار اللي بيتسأل عنه جنبه.', 'The overall rating is always asked; choose what comes with it.')} />
      <fieldset className="field">
        <legend className="field-label">{text('أسئلة زيادة جنب التقييم العام', 'Extra questions besides the overall rating')}</legend>
        <div className="filter-chips rv-sub-chips" data-testid="rs-sub-ratings">{REVIEW_SUB_RATINGS.map(key => <button key={key} type="button" className={`filter-chip ${draft.subRatings.includes(key) ? 'active' : ''}`}
          aria-pressed={draft.subRatings.includes(key)} onClick={() => toggleSub(key)} data-sub={key}>{text(...REVIEW_SUB_RATING_LABELS[key])}</button>)}</div>
        <p className="field-hint">{text('كل سؤال من ١ لـ ٥ نجوم. أسئلة قليلة = زباين أكتر بيكمّلوا.', 'Each is 1 to 5 stars. Fewer questions mean more diners finish.')}</p>
      </fieldset>
      <Switch checked={draft.dishRatings} onChange={set('dishRatings')} label={text('قيّم كل طبق في الطلب', 'Rate each dish in the order')}
        description={text('الزبون بيقيّم كل طبق طلبه لوحده، فتعرف أي طبق بيتحب وأي واحد محتاج مراجعة.', 'Diners rate each dish they ordered, so you see which dishes are loved and which need work.')} />
      <fieldset className="field" disabled={!draft.dishRatings}>
        <legend className="field-label">{text('تقييم الطبق بـ', 'Dishes are rated with')}</legend>
        <div className="segmented">
          <label><input type="radio" name="dish-scale" checked={draft.dishRatingScale === 'THUMBS'} onChange={() => set('dishRatingScale')('THUMBS')} />{text('👍 / 👎', '👍 / 👎')}</label>
          <label><input type="radio" name="dish-scale" checked={draft.dishRatingScale === 'STARS'} onChange={() => set('dishRatingScale')('STARS')} />{text('١–٥ نجوم', '1–5 stars')}</label>
        </div>
        <p className="field-hint">{text('الإبهام أسرع للزبون؛ النجوم أدق.', 'Thumbs are quicker for diners; stars are finer.')}</p>
      </fieldset>
      <Field label={text('التعليق مطلوب لو التقييم', 'A comment is required when the rating is')} hint={text('عشان تعرف إيه اللي ضايق الزبون لما التقييم يبقى ضعيف.', 'So you learn what went wrong when the rating is low.')}>
        <select className="select" value={draft.commentRequiredBelow} onChange={event => set('commentRequiredBelow')(Number(event.target.value))} data-testid="rs-comment-below">
          <option value={0}>{text('مش مطلوب أبدًا', 'Never required')}</option>
          {[2, 3, 4, 5].map(value => <option key={value} value={value}>{below(value)}</option>)}
        </select>
      </Field>
      <Switch checked={draft.photos} onChange={set('photos')} label={text('الزبون يقدر يضيف صور', 'Diners may add photos')}
        description={text(`لحد ${number(REVIEW_LIMITS.photosPerReview)} صور في التقييم، بنشيل منها أي بيانات (زي المكان). بتفضل خاصة لحد ما التقييم يتنشر.`, `Up to ${REVIEW_LIMITS.photosPerReview} per review, stripped of any metadata (like location). They stay private until the review is published.`)} />
    </section>}

    {section === 'tags' && <TagsEditor tags={draft.tags} onChange={set('tags')} invalid={Boolean(issueAt('tags'))} />}

    {section === 'publish' && <section className="card inv-set-card" aria-labelledby="rs-publish">
      <SectionHead id="rs-publish" icon={GlobeHemisphereEastIcon} title={text('النشر', 'Publishing')} text={text('إمتى التقييم يبان للزباين على المنيو.', 'When a review becomes visible to diners on your menu.')} />
      <fieldset className="field">
        <legend className="field-label">{text('التقييمات بتتنشر إزاي', 'How reviews are published')}</legend>
        <div className="inv-options">{REVIEW_PUBLISH_MODES.map(value => <Option key={value} name="publish-mode" checked={draft.publishMode === value} onChange={() => set('publishMode')(value)}
          title={text(...PUBLISH[value].label)} help={text(...PUBLISH[value].help)} testId={`rs-publish-${value}`} />)}</div>
      </fieldset>
      {draft.publishMode === 'AUTO' && <Field label={text('انشر تلقائي من', 'Publish automatically from')} hint={draft.publishMinStars === 1 ? text('كل التقييمات بتتنشر على طول، حتى الضعيفة.', 'Every review is published at once, low ones too.') : text(`التقييمات أقل من ${number(draft.publishMinStars)} نجوم بتستنى موافقتك.`, `Reviews below ${draft.publishMinStars} stars wait for you.`)}>
        <select className="select" value={draft.publishMinStars} onChange={event => set('publishMinStars')(Number(event.target.value))} data-testid="rs-publish-min">
          <option value={1}>{text('أي تقييم (كله يتنشر)', 'Any rating (publish everything)')}</option>
          {starOptions(2).map(value => <option key={value} value={value}>{text(`${number(value)} نجوم ولفوق`, `${value} stars and up`)}</option>)}
        </select>
      </Field>}
      <div className="rv-honesty" data-testid="rs-honesty">
        <ScalesIcon size={20} aria-hidden="true" />
        <div>
          <strong>{text('الأمانة مع الزباين', 'Being straight with diners')}</strong>
          <p>{text('التقييمات الضعيفة عمرها ما بتستخبى عنك: بتظهر هنا وفي الأرقام والملف. المتوسط اللي على المنيو بيتحسب من كل التقييمات المنشورة، ولو بتوافق بنفسك أو بتنشر من حد معين، صفحة التقييمات بتقول كده للزباين. عشان كده «انشر كله» هو اللي بيبني ثقة أكتر.',
            'Low ratings are never hidden from you: they show here, in the figures and in the export. The average on your menu is computed from every published review, and when you approve reviews yourself or publish from a threshold, the reviews page tells diners so. That is why publishing everything builds the most trust.')}</p>
        </div>
      </div>
    </section>}

    {section === 'menu' && <section className="card inv-set-card" aria-labelledby="rs-menu">
      <SectionHead id="rs-menu" icon={ForkKnifeIcon} title={text('على المنيو', 'On your menu')} text={text('اللي الزباين بيشوفوه من التقييمات وهم بيطلبوا.', 'What diners see of your reviews while ordering.')} />
      <Switch checked={draft.showOnMenu} onChange={set('showOnMenu')} disabled={draft.publishMode === 'NEVER'} label={text('اعرض التقييمات على المنيو', 'Show reviews on your menu')}
        description={draft.publishMode === 'NEVER' ? text('النشر مقفول، فمفيش حاجة تتعرض.', 'Publishing is off, so there is nothing to show.') : text('صفحة تقييمات فيها المتوسط والتقييمات المنشورة وردودك، وتقييم صغير جنب كل طبق.', 'A reviews page with the average, the published reviews and your replies, and a small rating next to each dish.')} />
      <Field label={text('الطبق يظهر تقييمه بعد', 'A dish shows its rating after')} error={issueAt('menuMinCount') ? { message: '@@invalid' } : undefined}
        hint={text('عدد التقييمات اللي لازم الطبق ياخدها الأول، عشان تقييم واحد مايحكمش عليه.', 'How many ratings a dish needs first, so a single rating does not decide its badge.')}>
        {control => <div className="input-group rv-number"><input {...control} className="input ltr" inputMode="numeric" value={draft.menuMinCount} onChange={event => set('menuMinCount')(event.target.value)} data-testid="rs-menu-min" />
          <span className="input-affix">{text('تقييمات', 'ratings')}</span></div>}
      </Field>
    </section>}

    {section === 'google' && <GoogleSection draft={draft} onPrompt={set('googlePrompt')} onMin={set('googleMinStars')} />}

    {section === 'alerts' && <section className="card inv-set-card" aria-labelledby="rs-alerts">
      <SectionHead id="rs-alerts" icon={BellRingingIcon} title={text('التنبيهات والمتابعة', 'Alerts and follow-ups')} text={text('عشان مفيش زبون زعلان يعدّي من غير ما حد يكلّمه.', 'So no unhappy diner slips by without someone reaching out.')} />
      <Field label={text('نبّهني لما التقييم', 'Alert me when a review is')} hint={text('بيوصلك تنبيه هنا وإيميل ليك وللي بيتابعوا في الفرع، والتقييم بيفتح متابعة لوحده.', 'You get an alert here and an email to you and those who follow up at the branch, and the review opens a follow-up by itself.')}>
        <select className="select" value={draft.alertBelowStars <= 1 ? 0 : draft.alertBelowStars} onChange={event => set('alertBelowStars')(Number(event.target.value))} data-testid="rs-alert-below">
          <option value={0}>{text('مانبّهش خالص', 'Never alert')}</option>
          {[2, 3, 4, 5].map(value => <option key={value} value={value}>{below(value)}</option>)}
        </select>
      </Field>
      <Field label={text('الزبون يقدر يعدّل تقييمه لمدة', 'Diners may edit their review for')} error={issueAt('editWindowHours') ? { message: `@@max|number|${REVIEW_LIMITS.maxEditWindowHours}` } : undefined}
        hint={text('من وقت ما بيكتبه (صفر = مينفعش يتعدّل). التعديل بيتسجل والتقييم القديم بيفضل في السجل.', 'From when it is written (0 = no edits). Edits are recorded and the earlier rating stays in the history.')}>
        {control => <div className="rv-hours">
          <div className="input-group rv-number"><input {...control} className="input ltr" inputMode="numeric" value={draft.editWindowHours} onChange={event => set('editWindowHours')(event.target.value)} data-testid="rs-edit-hours" />
            <span className="input-affix">{text('ساعة', 'hours')}</span></div>
          <div className="att-presets">{[0, 24, 72, 168].map(hours => <button key={hours} type="button" className={`filter-chip ${whole(draft.editWindowHours) === hours ? 'active' : ''}`} onClick={() => set('editWindowHours')(String(hours))}>
            {hours === 0 ? text('مفيش تعديل', 'No edits') : hours === 168 ? text('أسبوع', 'A week') : text(`${number(hours / 24)} يوم`, `${hours / 24} day${hours === 24 ? '' : 's'}`)}</button>)}</div>
        </div>}
      </Field>
    </section>}

    {section === 'name' && <DisplayNameSection value={draft.displayName} onChange={set('displayName')} />}

    <SaveBar visible={dirty} saving={save.isPending} canSave={issues.length === 0} onUndo={() => setDraft(toDraft(settings))}
      problem={issues.length > 0 ? text('في إعداد محتاج يتراجع (أسماء الاختيارات السريعة والأرقام).', 'A setting needs your attention (quick chip names and the numbers).') : null}
      lastSaved={settings.updatedAt ? format.dateTime(settings.updatedAt) : null} undoTestId="rs-undo" saveTestId="rs-save" />
  </form>;
}

function TagsEditor({ tags, onChange, invalid }: { tags: Draft['tags']; onChange: (tags: Draft['tags']) => void; invalid: boolean }) {
  const { text, number } = useLanguage();
  const update = (key: string, change: Partial<ReviewTag>) => onChange(tags.map(tag => (tag.key === key ? { ...tag, ...change } : tag)));
  const add = (sentiment: ReviewTag['sentiment']) => onChange([...tags, { key: newTagKey(), code: '', nameAr: '', nameEn: null, sentiment, fresh: true }]);
  const resetDefaults = () => onChange(DEFAULT_REVIEW_SETTINGS.tags.map(tag => ({ ...tag, key: newTagKey(), fresh: false })));
  const full = tags.length >= REVIEW_LIMITS.tags;
  const groups: { sentiment: ReviewTag['sentiment']; title: Label; help: Label }[] = [
    { sentiment: 'POSITIVE', title: ['حاجات حلوة', 'Good things'], help: ['اللي الزبون يختاره لما يكون مبسوط.', 'What diners pick when they are happy.'] },
    { sentiment: 'NEGATIVE', title: ['حاجات ضايقته', 'Things that went wrong'], help: ['اللي يختاره لما حاجة ماعجبتوش؛ بتبان في الأرقام كمشاكل.', 'What they pick when something was off; these show as problems in the figures.'] },
  ];
  return <section className="card inv-set-card" aria-labelledby="rs-tags" data-testid="rs-tags">
    <SectionHead id="rs-tags" icon={TagIcon} title={text('اختيارات سريعة', 'Quick chips')} text={text(`كلمات الزبون يدوس عليها بدل ما يكتب، لحد ${number(REVIEW_LIMITS.tags)}. لو شلت واحدة، التقييمات القديمة بتفضل فاكراها.`, `Words diners tap instead of typing, up to ${REVIEW_LIMITS.tags}. Removing one does not change earlier reviews.`)} />
    {invalid && <Alert kind="error" live={false}>{text('كل اختيار محتاج اسم بالعربي (لحد ٣٠ حرف).', 'Each chip needs an Arabic name (up to 30 characters).')}</Alert>}
    {groups.map(group => <fieldset key={group.sentiment} className={`field rv-tag-editor is-${group.sentiment.toLowerCase()}`}>
      <legend className="field-label">{text(...group.title)}</legend>
      <p className="field-hint">{text(...group.help)}</p>
      <ul>{tags.filter(tag => tag.sentiment === group.sentiment).map(tag => <li key={tag.key} data-tag={tag.code || 'new'}>
        <input className="input" dir="rtl" lang="ar" maxLength={REVIEW_LIMITS.tagNameLength} value={tag.nameAr} placeholder={text('بالعربي', 'Arabic')}
          aria-label={text('الاسم بالعربي', 'Arabic name')} aria-invalid={!tag.nameAr.trim() || undefined} onChange={event => update(tag.key, { nameAr: event.target.value })} />
        <input className="input" dir="ltr" lang="en" maxLength={REVIEW_LIMITS.tagNameLength} value={tag.nameEn ?? ''} placeholder={text('بالإنجليزي', 'English')}
          aria-label={text('الاسم بالإنجليزي', 'English name')} onChange={event => update(tag.key, { nameEn: event.target.value })} />
        <button type="button" className="icon-button icon-button-danger" aria-label={text(`شيل ${tag.nameAr || 'الاختيار'}`, `Remove ${tag.nameEn || tag.nameAr || 'chip'}`)}
          onClick={() => onChange(tags.filter(entry => entry.key !== tag.key))}><TrashIcon size={17} aria-hidden="true" /></button>
      </li>)}</ul>
      <Button small variant="ghost" disabled={full} icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />} onClick={() => add(group.sentiment)}>{text('ضيف اختيار', 'Add a chip')}</Button>
    </fieldset>)}
    <button type="button" className="text-button" onClick={resetDefaults}>{text('رجّع الاختيارات الأصلية', 'Restore the default chips')}</button>
  </section>;
}

function GoogleSection({ draft, onPrompt, onMin }: { draft: Draft; onPrompt: (value: boolean) => void; onMin: (value: number) => void }) {
  const { text, number } = useLanguage();
  const { branchSettings, can, role } = useWorkspace();
  const branches = useBranchList().branches.filter(branch => branch.isActive);
  const missing = branches.filter(branch => !branch.googleReviewUrl);
  const canEdit = role === 'OWNER' || can('settings.operational');
  return <section className="card inv-set-card" aria-labelledby="rs-google" data-testid="rs-google">
    <SectionHead id="rs-google" icon={GoogleLogoIcon} title={text('تقييمات جوجل', 'Google reviews')} text={text('حوّل الزباين المبسوطين لتقييمات على جوجل.', 'Turn happy diners into Google reviews.')} />
    <Switch checked={draft.googlePrompt} onChange={onPrompt} label={text('اعزم الزبون المبسوط يقيّم على جوجل', 'Invite happy diners to review you on Google')}
      description={text('بعد ما يبعت تقييمه، بيظهر له زرار يفتح صفحة تقييم الفرع على جوجل.', 'After sending their review, they see a button that opens the branch’s Google review page.')} />
    <Field label={text('نعزمه لو قيّم', 'Invite when they rated')}>
      <select className="select" value={draft.googleMinStars} disabled={!draft.googlePrompt} onChange={event => onMin(Number(event.target.value))} data-testid="rs-google-min">
        {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value === 1 ? text('أي تقييم', 'Any rating') : text(`${number(value)} نجوم ولفوق`, `${value} stars and up`)}</option>)}
      </select>
    </Field>
    <p className="field-hint">{text('بالهنا بيعرض الدعوة وبس: الزبون بيكتب على جوجل اللي هو عايزه، ومحدش بيفلتر أو يعدّل تقييمات جوجل.', 'Bilhanah only shows the invitation: diners write whatever they like on Google, and nobody filters or edits Google reviews.')}</p>
    {branches.length > 0 && <div className="rv-google-branches">
      <strong>{missing.length === 0 ? text('كل الفروع ليها لينك تقييم على جوجل.', 'Every branch has a Google review link.') : text('الفروع دي محتاجة لينك تقييم جوجل عشان الدعوة تظهر:', 'These branches need a Google review link for the invitation to show:')}</strong>
      {missing.length > 0 && <ul>{missing.map(branch => <li key={branch.id}><bdi>{branch.name}</bdi>
        {canEdit && <Link className="link-action" to={`${branchSettings(branch.id)}#google-reviews`}>{text('حط اللينك', 'Add the link')}<ArrowSquareOutIcon size={14} aria-hidden="true" /></Link>}</li>)}</ul>}
    </div>}
  </section>;
}

function DisplayNameSection({ value, onChange }: { value: ReviewDisplayNameMode; onChange: (value: ReviewDisplayNameMode) => void }) {
  const { text, language } = useLanguage();
  const id = useId();
  const [sample, setSample] = useState(() => (language === 'ar' ? 'منى أحمد' : 'Mona Ahmed'));
  return <section className="card inv-set-card" aria-labelledby="rs-name" data-testid="rs-display-name">
    <SectionHead id="rs-name" icon={UserCircleIcon} title={text('اسم الزبون على التقييم', 'The diner’s name on reviews')} text={text('إزاي اسم الزبون يظهر على التقييمات المنشورة. الاسم كامل بيوصلك أنت بس، والأرقام والرموز بتتشال.', 'How a diner’s name appears on published reviews. You alone see the full name, and digits and symbols are dropped.')} />
    <Field label={text('جرّب اسم', 'Try a name')}>
      <input id={id} className="input" dir="auto" value={sample} maxLength={REVIEW_LIMITS.nameLength} onChange={event => setSample(event.target.value)} data-testid="rs-name-sample" />
    </Field>
    <div className="inv-options" role="radiogroup" aria-label={text('طريقة عرض الاسم', 'How the name shows')}>
      {REVIEW_DISPLAY_NAMES.map(mode => <label key={mode} className={`inv-option ${value === mode ? 'is-checked' : ''}`} data-testid={`rs-name-${mode}`}>
        <input type="radio" name="display-name" checked={value === mode} onChange={() => onChange(mode)} />
        <span><strong>{text(...DISPLAY[mode])}</strong><small>{text('هيظهر:', 'Shows as:')} <bdi dir="auto" className="rv-name-preview">{reviewDisplayName(sample, mode) ?? text('ضيف', 'Guest')}</bdi></small></span>
      </label>)}
    </div>
  </section>;
}

/** Who may do what with reviews: each permission in plain words, the roles that have it, and where to grant more. */
function PermissionsCard() {
  const { text } = useLanguage();
  const { can, role } = useWorkspace();
  return <section className="card inv-set-card" aria-labelledby="rs-permissions" data-testid="reviews-permissions">
    <SectionHead id="rs-permissions" icon={ShieldCheckIcon} title={text('مين يقدر يعمل إيه', 'Who can do what')} text={text('كل صلاحية من دول تقدر تديها لأي موظف (مدير، كاشير، ويتر، مطبخ) فوق صلاحيات دوره، من صفحة الموظفين. الموظف المربوط بفرع بيشوف تقييمات فرعه بس.', 'You can give any of these to any staff member (manager, cashier, waiter, kitchen) on top of their role, on the staff page. Staff tied to a branch only see its reviews.')} />
    <dl className="inv-permissions">{REVIEW_PERMISSIONS.map(permission => <div key={permission}>
      <dt>{text(...PERMISSION_LABELS[permission])}</dt>
      <dd>{text(...REVIEW_PERMISSION_HELP[permission])}
        <small className="muted">{text('عند:', 'Included for:')} {rolesWith(permission).map(role => text(...ROLE_LABELS[role])).join(text('، ', ', '))}</small></dd>
    </div>)}</dl>
    {can('staff.view') && <Link className="link-action" to={role === 'OWNER' ? '/settings/kitchen' : '/manager/staff'}>{text('افتح صفحة الموظفين', 'Open the staff page')}</Link>}
  </section>;
}

