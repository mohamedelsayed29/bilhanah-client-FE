import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LOYALTY_ERROR_CODES, LOYALTY_REWARD_LABELS, LOYALTY_TRANSACTION_LABELS,
  type LoyaltyIneligibleReason, type LoyaltyReward, type LoyaltyTransactionKind, type Permission,
} from '@bilhanah/contracts';
import { isApiError } from '../../lib/api';
import { loyaltyApi } from '../../lib/api/endpoints';
import { formatDate, formatPrice, formatRelative } from '../../lib/format';
import { useLanguage } from '../../lib/language';

export const loyaltyKeys = {
  all: ['loyalty'] as const,
  settings: ['loyalty', 'settings'] as const,
  tiers: ['loyalty', 'tiers'] as const,
  rewards: ['loyalty', 'rewards'] as const,
  members: (params: object) => ['loyalty', 'members', params] as const,
  member: (memberId: string) => ['loyalty', 'member', memberId] as const,
  analytics: (days: number) => ['loyalty', 'analytics', days] as const,
};

export type LoyaltyTabKey = 'overview' | 'members' | 'rewards' | 'settings';

/** The section's tabs in order; `need`: any one of them (the routes check the same). */
export const LOYALTY_TABS: { key: LoyaltyTabKey; path: string; need: Permission[] }[] = [
  { key: 'overview', path: '/loyalty/overview', need: ['loyalty.view'] },
  { key: 'members', path: '/loyalty/members', need: ['loyalty.view'] },
  { key: 'rewards', path: '/loyalty/rewards', need: ['loyalty.view', 'loyalty.settings'] },
  { key: 'settings', path: '/loyalty/settings', need: ['loyalty.settings'] },
];

const retry = (count: number, error: unknown) => !isApiError(error, LOYALTY_ERROR_CODES.LOYALTY_UNAVAILABLE) && count < 2;

export function useLoyaltySettings() {
  return useQuery({ queryKey: loyaltyKeys.settings, queryFn: loyaltyApi.settings, staleTime: 60_000, retry });
}

export function useLoyaltyRewards() {
  return useQuery({ queryKey: loyaltyKeys.rewards, queryFn: loyaltyApi.rewards, staleTime: 30_000, retry });
}

export function useLoyaltyTiers() {
  return useQuery({ queryKey: loyaltyKeys.tiers, queryFn: loyaltyApi.tiers, staleTime: 60_000, retry });
}

/** Points, money, dates and names as the interface language writes them. */
export function useLoyaltyFormat() {
  const { language, text, number } = useLanguage();
  return useMemo(() => ({
    language,
    points: (value: number) => text(`${number(value)} نقطة`, `${number(value)} ${Math.abs(value) === 1 ? 'point' : 'points'}`),
    signed: (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value))}`,
    money: (piastres: number) => formatPrice(piastres, language),
    percent: (share: number | null) => (share === null ? '—' : number(share, { style: 'percent', maximumFractionDigits: 1 })),
    date: (iso: string | null | undefined) => (iso ? formatDate(iso, language) : '—'),
    dateTime: (iso: string | null | undefined) => (iso ? formatDate(iso, language, { dateStyle: 'medium', timeStyle: 'short' }) : '—'),
    relative: (iso: string) => formatRelative(iso, language),
    name: (nameAr: string | null | undefined, nameEn: string | null | undefined) => (language === 'en' ? nameEn || nameAr || '' : nameAr || nameEn || ''),
    kind: (kind: LoyaltyTransactionKind) => text(...LOYALTY_TRANSACTION_LABELS[kind]),
    rewardType: (type: LoyaltyReward['type']) => text(...LOYALTY_REWARD_LABELS[type]),
  }), [language, text, number]);
}

/** What a reward gives, in one line ("20 EGP off", "15% off, up to 50 EGP", "Free: Tea"). */
export function useRewardValue() {
  const { text, number } = useLanguage();
  const format = useLoyaltyFormat();
  return (reward: Pick<LoyaltyReward, 'type' | 'amountPiastres' | 'percent' | 'maxDiscountPiastres' | 'menuItem'>) => {
    if (reward.type === 'FIXED_DISCOUNT') return text(`خصم ${format.money(reward.amountPiastres ?? 0)}`, `${format.money(reward.amountPiastres ?? 0)} off`);
    if (reward.type === 'PERCENT_DISCOUNT') {
      const cap = reward.maxDiscountPiastres ? text(`، بحد أقصى ${format.money(reward.maxDiscountPiastres)}`, `, up to ${format.money(reward.maxDiscountPiastres)}`) : '';
      return text(`خصم ${number(reward.percent ?? 0)}٪${cap}`, `${reward.percent ?? 0}% off${cap}`);
    }
    const dish = reward.menuItem
      ? `${format.name(reward.menuItem.nameAr, reward.menuItem.nameEn)}${reward.menuItem.variantNameAr ? ` (${format.name(reward.menuItem.variantNameAr, reward.menuItem.variantNameEn)})` : ''}`
      : text('صنف اتمسح من المنيو', 'a dish removed from the menu');
    return reward.type === 'FREE_ADDON' ? text(`إضافة مجانية: ${dish}`, `Free add-on: ${dish}`) : text(`مجانًا: ${dish}`, `Free: ${dish}`);
  };
}

export const INELIGIBLE_LABELS: Record<LoyaltyIneligibleReason, [string, string]> = {
  NOT_ENOUGH_POINTS: ['النقاط مش كفاية', 'Not enough points'],
  BELOW_MIN_REDEEM: ['تحت الحد الأدنى للاستبدال', 'Below the minimum to redeem'],
  BELOW_MIN_ORDER: ['الطلب أقل من الحد الأدنى', 'Order below the minimum'],
  ITEM_NOT_IN_ORDER: ['الصنف مش في الطلب', 'The dish is not in the order'],
  ADDON_NEEDS_ORDER: ['الإضافة محتاجة صنف تاني', 'The add-on needs another dish'],
  LIMIT_REACHED: ['استخدمها أقصى عدد مرات', 'Used the maximum times'],
  TIER_REQUIRED: ['لمستوى أعلى', 'For a higher tier'],
  ORDER_TYPE: ['مش متاحة لنوع الطلب ده', 'Not for this order type'],
  INACTIVE: ['متوقفة', 'Paused'],
};

/** Ledger kinds that add points look positive, the rest neutral or negative. */
export const KIND_TONES: Record<LoyaltyTransactionKind, string> = {
  EARN: 'badge-success', REDEEM: 'badge-info', REDEEM_RETURN: 'badge-muted', EARN_REVERSAL: 'badge-warning', EXPIRE: 'badge-muted', ADJUST: 'badge-guava',
};
