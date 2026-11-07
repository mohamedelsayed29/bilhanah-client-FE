import { useEffect, useMemo, useState } from 'react';
import { CoinsIcon, GiftIcon } from '@phosphor-icons/react';
import type { LoyaltyIneligibleReason, LoyaltyQuote, PublicLoyaltyReward } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import { formatPrice } from '../restaurant-menu/menu-format';
import { fetchQuote, type ActiveProgram, type QuoteInput } from './loyalty-api';

const REASONS: Record<LoyaltyIneligibleReason, [string, string]> = {
  NOT_ENOUGH_POINTS: ['نقاطك مش كفاية', 'Not enough points'],
  BELOW_MIN_REDEEM: ['محتاج تجمع نقاط أكتر الأول', 'Collect more points first'],
  BELOW_MIN_ORDER: ['الطلب أقل من المطلوب', 'Order below the minimum'],
  ITEM_NOT_IN_ORDER: ['ضيف الصنف لطلبك الأول', 'Add the dish to your order first'],
  ADDON_NEEDS_ORDER: ['محتاجة صنف تاني في الطلب', 'Needs another dish in the order'],
  LIMIT_REACHED: ['استخدمتها قبل كده', 'Already used'],
  TIER_REQUIRED: ['لمستوى أعلى', 'For a higher tier'],
  ORDER_TYPE: ['مش متاحة للنوع ده من الطلب', 'Not for this kind of order'],
  INACTIVE: ['مش متاحة دلوقتي', 'Not available now'],
};

export const rewardName = (reward: Pick<PublicLoyaltyReward, 'nameAr' | 'nameEn'>, language: 'ar' | 'en') => (language === 'en' ? reward.nameEn || reward.nameAr : reward.nameAr);

/**
 * Loyalty at checkout: the points this order will earn, and, with a member card, the balance and
 * the rewards it can use. Everything is priced by the server (the quote); the chosen reward is
 * checked again when the order is placed.
 */
export function CheckoutLoyalty({ subdomain, program, input, pass, hasPhone, rewardId, onReward, onQuote }: {
  subdomain: string;
  program: ActiveProgram;
  input: Omit<QuoteInput, 'pass' | 'rewardId'>;
  pass: string | null;
  /** The diner gave a phone (or has a card): the order will count for them. */
  hasPhone: boolean;
  rewardId: string | null;
  onReward: (rewardId: string | null) => void;
  onQuote: (quote: LoyaltyQuote | null) => void;
}) {
  const { language, text, number } = useLanguage();
  const [quote, setQuote] = useState<LoyaltyQuote | null>(null);
  const request = useMemo(() => JSON.stringify({ ...input, ...(pass && { pass }), ...(pass && rewardId && { rewardId }) }), [input, pass, rewardId]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchQuote(subdomain, JSON.parse(request) as QuoteInput, controller.signal)
        .then(next => { setQuote(next); onQuote(next); })
        .catch(() => { if (!controller.signal.aborted) { setQuote(null); onQuote(null); } });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [subdomain, request, onQuote]);

  // A reward that stopped fitting the order (a dish removed) is let go.
  useEffect(() => { if (rewardId && quote?.reward && !quote.reward.available) onReward(null); }, [quote, rewardId, onReward]);

  if (!program.orderTypes.includes(input.type)) return null;
  const price = (piastres: number) => `${formatPrice(piastres, language)} ${text('ج.م', 'EGP')}`;
  const name = program.nameAr || program.nameEn ? (language === 'en' ? program.nameEn || program.nameAr : program.nameAr || program.nameEn) : text('نقاط الولاء', 'Loyalty points');
  const points = quote?.pointsToEarn ?? 0;
  const options = quote?.rewards ?? [];
  const usable = program.rewards.filter(reward => options.some(option => option.id === reward.id));
  return <section className="checkout-loyalty" aria-labelledby="checkout-loyalty-title" data-testid="checkout-loyalty">
    <h3 id="checkout-loyalty-title"><CoinsIcon size={18} weight="fill" aria-hidden="true" />{name}</h3>
    {points > 0 && <p className="loyalty-earn" data-testid="loyalty-earn">
      {hasPhone
        ? text(`هتكسب ${number(points)} نقطة لما الطلب يكمل`, `You’ll earn ${points} points when this order is completed`)
        : text(`اكتب رقم موبايلك وهتكسب ${number(points)} نقطة على الطلب ده`, `Add your mobile number to earn ${points} points on this order`)}
    </p>}
    {points === 0 && quote && program.minOrderPiastres > quote.totalPiastres && <p className="loyalty-earn muted">{text(`الطلبات من ${price(program.minOrderPiastres)} بتكسب نقاط`, `Orders from ${price(program.minOrderPiastres)} earn points`)}</p>}
    {pass && quote?.balance !== null && quote?.balance !== undefined && <>
      <p className="loyalty-balance">{text('رصيدك', 'Your balance')}: <strong data-testid="loyalty-balance">{text(`${number(quote.balance)} نقطة`, `${quote.balance} points`)}</strong></p>
      {usable.length > 0 && <fieldset className="loyalty-rewards">
        <legend>{text('استبدل مكافأة', 'Use a reward')}</legend>
        <label className={`loyalty-reward ${rewardId === null ? 'is-checked' : ''}`}>
          <input type="radio" name="loyalty-reward" checked={rewardId === null} onChange={() => onReward(null)} />
          <span>{text('من غير مكافأة', 'No reward')}</span>
        </label>
        {usable.map(reward => {
          const option = options.find(entry => entry.id === reward.id)!;
          return <label key={reward.id} className={`loyalty-reward ${rewardId === reward.id ? 'is-checked' : ''} ${option.available ? '' : 'is-disabled'}`} data-testid="loyalty-reward">
            <input type="radio" name="loyalty-reward" disabled={!option.available} checked={rewardId === reward.id} onChange={() => onReward(reward.id)} />
            <GiftIcon size={18} aria-hidden="true" />
            <span className="loyalty-reward-name"><bdi>{rewardName(reward, language)}</bdi>
              <small>{option.available ? text(`${number(reward.pointsCost)} نقطة · −${price(option.discountPiastres)}`, `${reward.pointsCost} points · −${price(option.discountPiastres)}`) : text(...REASONS[option.reason ?? 'INACTIVE'])}</small>
            </span>
          </label>;
        })}
      </fieldset>}
    </>}
  </section>;
}
