import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CoffeeIcon, ForkKnifeIcon, GiftIcon, PencilSimpleIcon, PercentIcon, PlusIcon, TagIcon, TrashIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { LOYALTY_REWARD_TYPES, loyaltyRewardSchema, type LoyaltyReward, type LoyaltyRewardInput, type LoyaltyRewardType } from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { loyaltyApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { egpToPiastres, normalizeDigits, piastresToInput } from '../../lib/format';
import { contractIssues } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';
import { MoneyInput } from '../inventory/controls';
import { useMenuQuery } from '../restaurant/queries';
import { loyaltyKeys, useLoyaltyFormat, useLoyaltyRewards, useLoyaltySettings, useLoyaltyTiers, useRewardValue } from './shared';

const TYPE_ICONS: Record<LoyaltyRewardType, Icon> = { FIXED_DISCOUNT: TagIcon, PERCENT_DISCOUNT: PercentIcon, FREE_PRODUCT: ForkKnifeIcon, FREE_ADDON: CoffeeIcon };
const TYPE_HELP: Record<LoyaltyRewardType, [string, string]> = {
  FIXED_DISCOUNT: ['مبلغ ثابت يتخصم من الحساب، زي ٢٠ جنيه.', 'A set amount off the bill, like 20 EGP.'],
  PERCENT_DISCOUNT: ['نسبة من الحساب، وتقدر تحط حد أقصى للخصم.', 'A share of the bill, with an optional cap.'],
  FREE_PRODUCT: ['صنف من المنيو ببلاش لما يكون في الطلب.', 'A dish from your menu, free when it is in the order.'],
  FREE_ADDON: ['إضافة ببلاش (مشروب، صوص، جانبي) مع أي طلب فيه صنف تاني.', 'A free extra (drink, sauce, side) with any order that has another dish.'],
};

/** The rewards members spend points on: each shows what it gives, its cost and limits, and how often it was used. */
export function LoyaltyRewardsPage() {
  const { text } = useLanguage();
  usePageTitle('مكافآت برنامج الولاء', 'Loyalty rewards');
  const { can } = useWorkspace();
  const rewards = useLoyaltyRewards();
  const [editing, setEditing] = useState<LoyaltyReward | 'new' | null>(null);
  const [removing, setRemoving] = useState<LoyaltyReward | null>(null);
  const manage = can('loyalty.settings');
  const toast = useToast();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (reward: LoyaltyReward) => loyaltyApi.deleteReward(reward.id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: loyaltyKeys.rewards }); toast.success(text('المكافأة اتمسحت', 'Reward removed')); setRemoving(null); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  return <section className="ly-rewards" aria-labelledby="ly-rewards-title" data-testid="ly-rewards-page">
    <header className="ly-section-head">
      <div><h2 id="ly-rewards-title">{text('المكافآت', 'Rewards')}</h2>
        <p className="muted">{text('اللي الأعضاء يقدروا ياخدوه بنقاطهم وقت الطلب. مكافأة واحدة في كل طلب، والسيرفر بيتأكد من الرصيد والشروط.', 'What members can take with their points at checkout. One reward per order; the server checks the balance and conditions.')}</p></div>
      {manage && <Button icon={<PlusIcon size={16} aria-hidden="true" />} onClick={() => setEditing('new')} data-testid="ly-reward-new">{text('مكافأة جديدة', 'New reward')}</Button>}
    </header>
    {rewards.isError && <ErrorPanel error={rewards.error} onRetry={() => void rewards.refetch()} />}
    {rewards.isPending && <div className="ly-reward-grid"><Skeleton height={170} /><Skeleton height={170} /><Skeleton height={170} /></div>}
    {rewards.data && rewards.data.length === 0 && <div className="card"><div className="empty-state" data-testid="ly-rewards-empty">
      <span className="empty-state-icon" aria-hidden="true"><GiftIcon size={28} /></span>
      <h3>{text('لسه مفيش مكافآت', 'No rewards yet')}</h3>
      <p>{text('ابدأ بمكافأة بسيطة: مثلًا خصم ٢٠ جنيه بـ ١٠٠ نقطة، أو مشروب مجاني بـ ٥٠ نقطة.', 'Start simple: for example 20 EGP off for 100 points, or a free drink for 50 points.')}</p>
      {manage && <Button onClick={() => setEditing('new')}>{text('أضف أول مكافأة', 'Add the first reward')}</Button>}
    </div></div>}
    {rewards.data && rewards.data.length > 0 && <ul className="ly-reward-grid" role="list">
      {rewards.data.map(reward => <RewardCard key={reward.id} reward={reward} manage={manage} onEdit={() => setEditing(reward)} onRemove={() => setRemoving(reward)} />)}
    </ul>}
    {editing && <RewardDialog reward={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    <ConfirmDialog open={removing !== null} title={text('تمسح المكافأة؟', 'Remove this reward?')} busy={remove.isPending}
      description={text('الطلبات اللي استخدمتها بتفضل محفوظة باسمها، ونقاط الأعضاء مش هتتأثر. لو عايز توقفها مؤقتًا، اقفلها بدل ما تمسحها.', 'Orders that used it keep its name, and members’ points are not affected. To pause it instead, switch it off.')}
      confirmLabel={text('امسح', 'Remove')} onConfirm={() => removing && remove.mutate(removing)} onCancel={() => setRemoving(null)} />
  </section>;
}

function RewardCard({ reward, manage, onEdit, onRemove }: { reward: LoyaltyReward; manage: boolean; onEdit: () => void; onRemove: () => void }) {
  const { text, number, count } = useLanguage();
  const format = useLoyaltyFormat();
  const value = useRewardValue();
  const TypeIcon = TYPE_ICONS[reward.type];
  const limits = [
    reward.minOrderPiastres > 0 && text(`لطلب من ${format.money(reward.minOrderPiastres)}`, `Orders from ${format.money(reward.minOrderPiastres)}`),
    reward.maxPerMember && text(`${number(reward.maxPerMember)} مرة لكل عضو`, `${reward.maxPerMember}× per member`),
  ].filter(Boolean) as string[];
  return <li className={`card ly-reward ${reward.isActive ? '' : 'is-paused'}`} data-testid="ly-reward" data-type={reward.type}>
    <div className="ly-reward-top">
      <span className="ly-reward-icon" aria-hidden="true"><TypeIcon size={20} weight="duotone" /></span>
      <span className="ly-reward-type">{format.rewardType(reward.type)}</span>
      {!reward.isActive && <span className="badge badge-muted">{text('متوقفة', 'Paused')}</span>}
    </div>
    <h3>{format.name(reward.nameAr, reward.nameEn)}</h3>
    <p className="ly-reward-value">{value(reward)}</p>
    <p className="ly-reward-cost"><strong>{number(reward.pointsCost)}</strong> {text('نقطة', 'points')}</p>
    {limits.length > 0 && <ul className="ly-reward-limits">{limits.map(limit => <li key={limit}>{limit}</li>)}</ul>}
    <div className="ly-reward-foot">
      <span className="muted">{count(reward.redemptions, [{ one: 'اتصرفت مرة', two: 'اتصرفت مرتين', few: 'اتصرفت {n} مرات', many: 'اتصرفت {n} مرة', zero: 'لسه متصرفتش' }, { one: 'Redeemed once', other: 'Redeemed {n} times', zero: 'Not redeemed yet' }])}</span>
      {manage && <span className="ly-reward-actions">
        <button type="button" className="icon-button" onClick={onEdit} aria-label={text(`عدّل ${reward.nameAr}`, `Edit ${reward.nameEn || reward.nameAr}`)} data-testid="ly-reward-edit"><PencilSimpleIcon size={18} aria-hidden="true" /></button>
        <button type="button" className="icon-button" onClick={onRemove} aria-label={text(`امسح ${reward.nameAr}`, `Remove ${reward.nameEn || reward.nameAr}`)}><TrashIcon size={18} aria-hidden="true" /></button>
      </span>}
    </div>
  </li>;
}

type Draft = {
  type: LoyaltyRewardType; nameAr: string; nameEn: string; pointsCost: string; amount: string; percent: string; maxDiscount: string;
  dish: string; minOrder: string; maxPerMember: string; tierId: string; isActive: boolean;
};

const toDraft = (reward: LoyaltyReward | null): Draft => ({
  type: reward?.type ?? 'FIXED_DISCOUNT',
  nameAr: reward?.nameAr ?? '',
  nameEn: reward?.nameEn ?? '',
  pointsCost: reward ? String(reward.pointsCost) : '',
  amount: reward?.amountPiastres ? piastresToInput(reward.amountPiastres) : '',
  percent: reward?.percent ? String(reward.percent) : '',
  maxDiscount: reward?.maxDiscountPiastres ? piastresToInput(reward.maxDiscountPiastres) : '',
  dish: reward?.menuItemId ? `${reward.menuItemId}:${reward.variantId ?? ''}` : '',
  minOrder: reward?.minOrderPiastres ? piastresToInput(reward.minOrderPiastres) : '',
  maxPerMember: reward?.maxPerMember ? String(reward.maxPerMember) : '',
  tierId: reward?.tierId ?? '',
  isActive: reward?.isActive ?? true,
});

const whole = (value: string) => {
  const digits = normalizeDigits(value.trim());
  return /^\d+$/.test(digits) ? Number(digits) : null;
};

function bodyOf(draft: Draft): LoyaltyRewardInput {
  const free = draft.type === 'FREE_PRODUCT' || draft.type === 'FREE_ADDON';
  const [menuItemId, variantId] = draft.dish.split(':');
  return {
    type: draft.type,
    nameAr: draft.nameAr.trim(),
    nameEn: draft.nameEn.trim() || null,
    pointsCost: whole(draft.pointsCost) ?? 0,
    amountPiastres: draft.type === 'FIXED_DISCOUNT' ? egpToPiastres(draft.amount) : null,
    percent: draft.type === 'PERCENT_DISCOUNT' ? whole(draft.percent) : null,
    maxDiscountPiastres: draft.type === 'PERCENT_DISCOUNT' && draft.maxDiscount.trim() ? egpToPiastres(draft.maxDiscount) : null,
    menuItemId: free && menuItemId ? menuItemId : null,
    variantId: free && variantId ? variantId : null,
    minOrderPiastres: draft.minOrder.trim() ? (egpToPiastres(draft.minOrder) ?? -1) : 0,
    maxPerMember: draft.maxPerMember.trim() ? whole(draft.maxPerMember) : null,
    tierId: draft.tierId || null,
    isActive: draft.isActive,
  };
}

function RewardDialog({ reward, onClose }: { reward: LoyaltyReward | null; onClose: () => void }) {
  const { text } = useLanguage();
  const format = useLoyaltyFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useLoyaltySettings();
  const tiers = useLoyaltyTiers();
  const menu = useMenuQuery();
  const [draft, setDraft] = useState<Draft>(() => toDraft(reward));
  const [tried, setTried] = useState(false);
  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const body = bodyOf(draft);
  const issues = contractIssues(loyaltyRewardSchema, body);
  const problem = (path: string) => (tried && issues.some(issue => issue.path === path) ? { message: text('راجع القيمة دي', 'Check this value') } : undefined);
  const free = draft.type === 'FREE_PRODUCT' || draft.type === 'FREE_ADDON';
  const dishes = useMemo(() => (menu.data?.categories ?? []).flatMap(category => category.items.flatMap(item => [
    { value: `${item.id}:`, label: item.variants.length > 1 ? text(`${format.name(item.nameAr, item.nameEn)} (أي حجم)`, `${format.name(item.nameAr, item.nameEn)} (any size)`) : format.name(item.nameAr, item.nameEn), group: format.name(category.nameAr, category.nameEn) },
    ...(item.variants.length > 1 ? item.variants.map(variant => ({ value: `${item.id}:${variant.id}`, label: `${format.name(item.nameAr, item.nameEn)} · ${format.name(variant.nameAr, variant.nameEn)} — ${format.money(variant.pricePiastres)}`, group: format.name(category.nameAr, category.nameEn) })) : []),
  ])), [menu.data, format, text]);
  const groups = [...new Set(dishes.map(dish => dish.group))];
  const save = useMutation({
    mutationFn: () => (reward ? loyaltyApi.updateReward(reward.id, body) : loyaltyApi.createReward(body)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: loyaltyKeys.rewards });
      toast.success(reward ? text('المكافأة اتعدّلت', 'Reward updated') : text('المكافأة اتضافت', 'Reward added'));
      onClose();
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const submit = () => { setTried(true); if (!issues.length) save.mutate(); };
  return <Dialog open onClose={onClose} size="wide" title={reward ? text('عدّل المكافأة', 'Edit reward') : text('مكافأة جديدة', 'New reward')} busy={save.isPending} onSubmit={submit}
    footer={<><Button variant="secondary" onClick={onClose}>{text('إلغاء', 'Cancel')}</Button><Button type="submit" loading={save.isPending} data-testid="ly-reward-save">{text('احفظ', 'Save')}</Button></>}>
    <fieldset className="field">
      <legend className="field-label">{text('نوع المكافأة', 'Reward type')}</legend>
      <div className="ly-type-picker">{LOYALTY_REWARD_TYPES.map(type => {
        const TypeIcon = TYPE_ICONS[type];
        return <label key={type} className={`ly-type ${draft.type === type ? 'is-checked' : ''}`} data-testid={`ly-type-${type}`}>
          <input type="radio" name="ly-reward-type" checked={draft.type === type} onChange={() => set('type')(type)} />
          <TypeIcon size={20} weight="duotone" aria-hidden="true" />
          <strong>{format.rewardType(type)}</strong>
          <small>{text(...TYPE_HELP[type])}</small>
        </label>;
      })}</div>
    </fieldset>
    <div className="ly-form-grid">
      <Field label={text('الاسم بالعربي', 'Name in Arabic')} error={problem('nameAr')} required>
        <input className="input" maxLength={80} value={draft.nameAr} onChange={event => set('nameAr')(event.target.value)} placeholder={text('مثلًا: خصم ٢٠ جنيه', 'e.g. خصم ٢٠ جنيه')} data-testid="ly-reward-name" />
      </Field>
      <Field label={text('الاسم بالإنجليزي', 'Name in English')} optional>
        <input className="input" dir="ltr" maxLength={80} value={draft.nameEn} onChange={event => set('nameEn')(event.target.value)} />
      </Field>
      <Field label={text('تكلفتها بالنقاط', 'Cost in points')} error={problem('pointsCost')} required>
        <input className="input ltr" inputMode="numeric" value={draft.pointsCost} onChange={event => set('pointsCost')(event.target.value)} data-testid="ly-reward-cost" />
      </Field>
      {draft.type === 'FIXED_DISCOUNT' && <Field label={text('قيمة الخصم', 'Amount off')} error={problem('amountPiastres')} required>
        {props => <MoneyInput value={draft.amount} onChange={set('amount')} label={text('قيمة الخصم', 'Amount off')} invalid={props['aria-invalid']} describedBy={props['aria-describedby']} testId="ly-reward-amount" />}
      </Field>}
      {draft.type === 'PERCENT_DISCOUNT' && <>
        <Field label={text('نسبة الخصم ٪', 'Percentage off')} error={problem('percent')} required>
          <input className="input ltr" inputMode="numeric" value={draft.percent} onChange={event => set('percent')(event.target.value)} data-testid="ly-reward-percent" />
        </Field>
        <Field label={text('أقصى خصم', 'Maximum discount')} optional hint={text('فاضي = من غير حد', 'Empty: no cap')}>
          {props => <MoneyInput value={draft.maxDiscount} onChange={set('maxDiscount')} label={text('أقصى خصم', 'Maximum discount')} invalid={props['aria-invalid']} describedBy={props['aria-describedby']} />}
        </Field>
      </>}
      {free && <Field className="ly-span" label={draft.type === 'FREE_ADDON' ? text('الإضافة المجانية', 'Free add-on') : text('الصنف المجاني', 'Free dish')} error={problem('menuItemId')} required
        hint={draft.type === 'FREE_ADDON' ? text('الزبون بيضيفها لطلب فيه صنف تاني، وواحدة منها بتبقى ببلاش.', 'The diner adds it to an order with another dish; one of it is free.') : text('واحد من الصنف ده بيبقى ببلاش لما يكون في الطلب.', 'One of this dish is free when it is in the order.')}>
        <select className="select" value={draft.dish} onChange={event => set('dish')(event.target.value)} disabled={menu.isPending} data-testid="ly-reward-dish">
          <option value="">{menu.isPending ? text('بنحمّل المنيو…', 'Loading the menu…') : text('اختار صنف', 'Choose a dish')}</option>
          {groups.map(group => <optgroup key={group} label={group}>{dishes.filter(dish => dish.group === group).map(dish => <option key={dish.value} value={dish.value}>{dish.label}</option>)}</optgroup>)}
        </select>
      </Field>}
      <Field label={text('أقل قيمة للطلب', 'Minimum order')} optional error={problem('minOrderPiastres')} hint={text('فاضي = أي طلب', 'Empty: any order')}>
        {props => <MoneyInput value={draft.minOrder} onChange={set('minOrder')} label={text('أقل قيمة للطلب', 'Minimum order')} invalid={props['aria-invalid']} describedBy={props['aria-describedby']} />}
      </Field>
      <Field label={text('كام مرة لكل عضو', 'Times per member')} optional error={problem('maxPerMember')} hint={text('فاضي = من غير حد', 'Empty: no limit')}>
        <input className="input ltr" inputMode="numeric" value={draft.maxPerMember} onChange={event => set('maxPerMember')(event.target.value)} />
      </Field>
      {settings.data?.tiersEnabled && (tiers.data?.length ?? 0) > 0 && <Field label={text('لمستوى', 'For tier')} optional hint={text('الأعضاء في المستوى ده أو أعلى بس.', 'Only members at this tier or above.')}>
        <select className="select" value={draft.tierId} onChange={event => set('tierId')(event.target.value)}>
          <option value="">{text('كل الأعضاء', 'Every member')}</option>
          {tiers.data!.map(tier => <option key={tier.id} value={tier.id}>{format.name(tier.nameAr, tier.nameEn)}</option>)}
        </select>
      </Field>}
    </div>
    <Switch checked={draft.isActive} onChange={set('isActive')} label={text('متاحة للأعضاء', 'Available to members')} description={text('اقفلها عشان توقفها مؤقتًا من غير ما تمسحها.', 'Switch it off to pause it without removing it.')} />
  </Dialog>;
}
