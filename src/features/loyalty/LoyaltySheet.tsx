import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CoinsIcon, CrownIcon, GiftIcon, HourglassMediumIcon, XIcon } from '@phosphor-icons/react';
import type { LoyaltyMemberView, LoyaltyTransactionKind, PublicLoyaltyReward } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import { formatPrice } from '../restaurant-menu/menu-format';
import { loadDiner } from '../restaurant-menu/ordering/ordering-storage';
import { rewardName } from './CheckoutLoyalty';
import { ApiError, fetchMember, joinProgram, type ActiveProgram } from './loyalty-api';
import { savePass, usePass } from './loyalty-store';
import '../restaurant-menu/reviews/reviews.css';
import './loyalty.css';

/** The phone as the API accepts it, or null (Arabic-Indic digits allowed). */
const normalizePhone = (value: string) => {
  const phone = value.trim().replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) & 0xf)).replace(/[\s().-]/g, '');
  return /^\+?\d{7,15}$/.test(phone) ? phone : null;
};

const KINDS: Record<LoyaltyTransactionKind, [string, string]> = {
  EARN: ['نقاط من طلب', 'Earned'],
  EARN_REVERSAL: ['اتسحبت (طلب مسترد)', 'Taken back (refund)'],
  REDEEM: ['استبدلت مكافأة', 'Reward'],
  REDEEM_RETURN: ['رجعت (طلب اتلغى)', 'Returned (cancelled)'],
  EXPIRE: ['انتهت صلاحيتها', 'Expired'],
  ADJUST: ['من المطعم', 'From the restaurant'],
};

/** The member's page: balance, tier, rewards and history; without a card, how the program works and joining. */
export function LoyaltySheet({ subdomain, restaurantName, program, onClose }: { subdomain: string; restaurantName: string; program: ActiveProgram; onClose: () => void }) {
  const { language, text, number } = useLanguage();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const pass = usePass(subdomain);
  const [view, setView] = useState<LoyaltyMemberView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  useEffect(() => {
    setView(null);
    setFailed(false);
    if (!pass) return;
    const controller = new AbortController();
    fetchMember(subdomain, pass, controller.signal).then(setView).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.code === 'LOYALTY_PASS_INVALID') savePass(subdomain, null);
      else setFailed(true);
    });
    return () => controller.abort();
  }, [subdomain, pass]);
  const close = () => dialog.current?.close();
  const name = (language === 'en' ? program.nameEn || program.nameAr : program.nameAr || program.nameEn) || text('برنامج النقاط', 'Points program');
  const price = (piastres: number) => `${formatPrice(piastres, language)} ${text('ج.م', 'EGP')}`;

  return <dialog ref={dialog} className="review-sheet loyalty-sheet" aria-labelledby={`${id}-title`} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) close(); }} data-testid="loyalty-sheet">
    <div className="review-sheet-body">
      <header className="review-sheet-header">
        <h2 id={`${id}-title`}>{name}<small className="reviews-sheet-place"> · <bdi>{restaurantName}</bdi></small></h2>
        <button type="button" className="review-icon-button" onClick={close} aria-label={text('إغلاق', 'Close')}><XIcon size={20} /></button>
      </header>
      <div className="review-sheet-content loyalty-content">
        {pass && !view && !failed && <div className="loyalty-skeleton" aria-busy="true"><span /><span /></div>}
        {failed && <p className="loyalty-error" role="alert">{text('مقدرناش نجيب نقاطك. اتأكد من النت وجرّب تاني.', 'We could not load your points. Check your connection and try again.')}</p>}
        {view && <MemberCard view={view} />}
        {!pass && <HowItWorks program={program} price={price} />}
        {!pass && <JoinForm subdomain={subdomain} />}
        <Rewards program={program} view={view} price={price} />
        {view && <History view={view} />}
        <p className="loyalty-fine">{text(
          `النقاط بتتحسب على الطلبات اللي بتكمل، ومن أي فرع.${program.expiryDays ? ` الرصيد بينتهي لو مطلبتش ${number(program.expiryDays)} يوم.` : ''} كارت العضوية محفوظ على الموبايل ده؛ لو غيّرته اطلب كارت جديد من المطعم.`,
          `Points are earned on completed orders, at any branch.${program.expiryDays ? ` The balance expires after ${program.expiryDays} days without an order.` : ''} Your member card is saved on this phone; if you change phones, ask the restaurant for a new one.`,
        )}</p>
      </div>
    </div>
  </dialog>;
}

function MemberCard({ view }: { view: LoyaltyMemberView }) {
  const { language, text, number } = useLanguage();
  const { member } = view;
  const tierName = (tier: { nameAr: string; nameEn: string | null }) => (language === 'en' ? tier.nameEn || tier.nameAr : tier.nameAr);
  const from = member.tier?.minLifetimePoints ?? 0;
  const progress = member.nextTier ? Math.min(100, ((member.lifetimePoints - from) / Math.max(1, member.nextTier.minLifetimePoints - from)) * 100) : 100;
  const date = new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' });
  return <section className="loyalty-card" aria-labelledby="loyalty-card-title" data-testid="loyalty-card">
    <div className="loyalty-card-top">
      <h3 id="loyalty-card-title"><bdi>{member.name}</bdi> <small className="ltr">{member.phone}</small></h3>
      {member.tier && <span className="loyalty-tier"><CrownIcon size={14} weight="fill" aria-hidden="true" />{tierName(member.tier)}</span>}
    </div>
    <p className="loyalty-card-balance"><strong data-testid="loyalty-sheet-balance">{number(member.balance)}</strong><span>{text('نقطة', 'points')}</span></p>
    {view.pendingPoints > 0 && <p className="loyalty-card-note">{text(`+${number(view.pendingPoints)} نقطة جاية لما طلباتك تكمل`, `+${view.pendingPoints} points coming once your orders complete`)}</p>}
    {member.nextTier && <div className="loyalty-progress">
      <span className="loyalty-progress-bar" aria-hidden="true"><span style={{ inlineSize: `${progress}%` }} /></span>
      <small>{text(`فاضلك ${number(member.nextTier.pointsToGo)} نقطة وتوصل لـ «${tierName(member.nextTier)}»`, `${member.nextTier.pointsToGo} points to “${tierName(member.nextTier)}”`)}</small>
    </div>}
    {member.expiresAt && <p className="loyalty-card-note"><HourglassMediumIcon size={14} aria-hidden="true" />{text(`الرصيد بينتهي ${date.format(new Date(member.expiresAt))} لو مفيش طلب`, `Expires ${date.format(new Date(member.expiresAt))} without an order`)}</p>}
  </section>;
}

function HowItWorks({ program, price }: { program: ActiveProgram; price: (piastres: number) => string }) {
  const { text, number } = useLanguage();
  return <section className="loyalty-how" aria-label={text('إزاي بتكسب', 'How it works')}>
    <p><CoinsIcon size={20} weight="fill" aria-hidden="true" /><span>{text(`كل ${price(program.spendUnitPiastres)} = ${number(program.pointsPerUnit)} نقطة`, `Every ${price(program.spendUnitPiastres)} = ${program.pointsPerUnit} point${program.pointsPerUnit === 1 ? '' : 's'}`)}</span></p>
    <p><GiftIcon size={20} weight="fill" aria-hidden="true" /><span>{text('استبدل نقاطك بخصم أو صنف مجاني وقت الطلب', 'Trade your points for a discount or a free dish at checkout')}</span></p>
  </section>;
}

function JoinForm({ subdomain }: { subdomain: string }) {
  const { text } = useLanguage();
  const id = useId();
  const [diner] = useState(loadDiner);
  const [name, setName] = useState(diner.name);
  const [phone, setPhone] = useState(diner.phone);
  const [state, setState] = useState<'idle' | 'sending' | 'exists' | 'failed' | 'invalid'>('idle');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizePhone(phone);
    if (name.trim().length < 2 || !normalized) { setState('invalid'); return; }
    setState('sending');
    try {
      const joined = await joinProgram(subdomain, name.trim(), normalized);
      savePass(subdomain, joined.pass);
    } catch (error) {
      setState(error instanceof ApiError && error.code === 'LOYALTY_MEMBER_EXISTS' ? 'exists' : 'failed');
    }
  }
  return <form className="loyalty-join" onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>{text('اشترك مجانًا', 'Join for free')}</h3>
    <p className="muted">{text('أو اطلب برقم موبايلك وهتبقى عضو تلقائي.', 'Or just order with your mobile number and you are in.')}</p>
    <label htmlFor={`${id}-name`}>{text('اسمك', 'Your name')}</label>
    <input id={`${id}-name`} value={name} onChange={event => setName(event.target.value)} maxLength={60} autoComplete="name" />
    <label htmlFor={`${id}-phone`}>{text('رقم موبايلك', 'Mobile number')}</label>
    <input id={`${id}-phone`} type="tel" dir="ltr" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} maxLength={20} autoComplete="tel" />
    {state === 'invalid' && <p className="loyalty-error" role="alert">{text('اكتب اسمك ورقم موبايل صحيح.', 'Enter your name and a valid mobile number.')}</p>}
    {state === 'exists' && <p className="loyalty-error" role="alert">{text('الرقم ده مشترك بالفعل. اطلب من المطعم كارت عضويتك عشان تشوف نقاطك هنا.', 'This number is already a member. Ask the restaurant for your member card to see your points here.')}</p>}
    {state === 'failed' && <p className="loyalty-error" role="alert">{text('مقدرناش نسجلك دلوقتي. جرّب تاني.', 'We could not sign you up right now. Try again.')}</p>}
    <button type="submit" className="order-button" disabled={state === 'sending'}>{state === 'sending' ? text('بنسجلك…', 'Joining…') : text('اشترك', 'Join')}</button>
  </form>;
}

function Rewards({ program, view, price }: { program: ActiveProgram; view: LoyaltyMemberView | null; price: (piastres: number) => string }) {
  const { language, text, number } = useLanguage();
  const rewards: (PublicLoyaltyReward & { available?: boolean })[] = view?.rewards ?? program.rewards;
  if (!rewards.length) return null;
  const value = (reward: PublicLoyaltyReward) => {
    if (reward.type === 'FIXED_DISCOUNT') return text(`خصم ${price(reward.amountPiastres ?? 0)}`, `${price(reward.amountPiastres ?? 0)} off`);
    if (reward.type === 'PERCENT_DISCOUNT') return text(`خصم ${number(reward.percent ?? 0)}٪`, `${reward.percent ?? 0}% off`);
    const dish = reward.menuItem ? (language === 'en' ? reward.menuItem.nameEn || reward.menuItem.nameAr : reward.menuItem.nameAr) : '';
    return reward.type === 'FREE_ADDON' ? text(`${dish} مجانًا مع طلبك`, `Free ${dish} with your order`) : text(`${dish} مجانًا`, `Free ${dish}`);
  };
  return <section className="loyalty-reward-list" aria-labelledby="loyalty-rewards-title">
    <h3 id="loyalty-rewards-title">{text('المكافآت', 'Rewards')}</h3>
    <ul>{rewards.map(reward => <li key={reward.id} className={reward.available ? 'is-available' : ''} data-testid="loyalty-sheet-reward">
      <GiftIcon size={20} aria-hidden="true" />
      <span><strong><bdi>{rewardName(reward, language)}</bdi></strong><small>{value(reward)}{reward.minOrderPiastres > 0 && text(` · لطلب من ${price(reward.minOrderPiastres)}`, ` · orders from ${price(reward.minOrderPiastres)}`)}</small></span>
      <span className="loyalty-reward-cost">{number(reward.pointsCost)}<small>{text('نقطة', 'pts')}</small></span>
    </li>)}</ul>
    {view?.rewards.some(reward => reward.available) && <p className="loyalty-card-note">{text('اختار المكافأة وانت بتأكد الطلب.', 'Pick the reward when you check out.')}</p>}
  </section>;
}

function History({ view }: { view: LoyaltyMemberView }) {
  const { language, text, number, digits } = useLanguage();
  const date = new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' });
  if (!view.history.length) return null;
  return <section className="loyalty-history" aria-labelledby="loyalty-history-title">
    <h3 id="loyalty-history-title">{text('سجل النقاط', 'Points history')}</h3>
    <ul>{view.history.slice(0, 30).map(entry => <li key={entry.id}>
      <span><strong>{text(...KINDS[entry.kind])}</strong>
        <small>{entry.order ? text(`طلب رقم ${digits(entry.order.number)} · ${date.format(new Date(entry.createdAt))}`, `Order #${entry.order.number} · ${date.format(new Date(entry.createdAt))}`) : date.format(new Date(entry.createdAt))}{entry.rewardName && <> · <bdi>{entry.rewardName}</bdi></>}</small></span>
      <span className={`loyalty-history-points ${entry.points > 0 ? 'is-up' : 'is-down'}`}><bdi>{entry.points > 0 ? '+' : '−'}{number(Math.abs(entry.points))}</bdi></span>
    </li>)}</ul>
  </section>;
}
