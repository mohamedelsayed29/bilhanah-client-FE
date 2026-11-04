import type { AccessStatus, PlanCode, RestaurantAccess } from '@bilhanah/contracts';
import { daysUntil } from '../../lib/format';
import { useLanguage } from '../../lib/language';

export const PLAN_NAMES: Record<PlanCode, [ar: string, en: string]> = {
  MENU: ['منيو', 'Menu'],
  ORDERS: ['منيو وطلبات', 'Menu & Orders'],
  ADVANCED: ['التجربة الكاملة', 'The Full Experience'],
};

const STATUS_NAMES: Record<AccessStatus, [ar: string, en: string]> = {
  TRIAL: ['تجربة مجانية', 'Free trial'],
  PAID: ['مشترك', 'Active'],
  INACTIVE: ['الاشتراك مش فعّال', 'Subscription inactive'],
  SUSPENDED: ['موقوف', 'Suspended'],
};

export const accessStatusName = (status: AccessStatus, text: (ar: string, en: string) => string) => text(...STATUS_NAMES[status]);

/** Days left in the trial or paid period, when there is one. */
export function accessDaysLeft(access: RestaurantAccess, now = Date.now()): number | null {
  const end = access.status === 'TRIAL' ? access.trialEndsAt : access.status === 'PAID' ? access.currentPeriodEndsAt : null;
  return end ? daysUntil(end, now) : null;
}

/** "Free trial · 30 days left", "Menu & Orders plan"… `short` drops the words a column header already says. */
export function useAccessLabel(access: RestaurantAccess, { short = false }: { short?: boolean } = {}): string {
  const { text, count } = useLanguage();
  const days = accessDaysLeft(access);
  switch (access.status) {
    case 'TRIAL':
      if (days === null) return text('تجربة مجانية', 'Free trial');
      return short
        ? text(`تجربة · ${count(days, 'day')}`, `Trial · ${count(days, 'day')}`)
        : text(`تجربة مجانية · فاضل ${count(days, 'day')}`, `Free trial · ${count(days, 'day')} left`);
    case 'PAID':
      return access.planCode ? text(`باقة ${PLAN_NAMES[access.planCode][0]}`, `${PLAN_NAMES[access.planCode][1]} plan`) : text('اشتراك فعّال', 'Active plan');
    case 'INACTIVE':
      return text('الاشتراك مش فعّال', 'Subscription inactive');
    case 'SUSPENDED':
      return text('موقوف', 'Suspended');
  }
}

export const accessTone = (status: AccessStatus) => (status === 'TRIAL' ? 'guava' : status === 'PAID' ? 'success' : status === 'INACTIVE' ? 'warning' : 'danger');

export function AccessBadge({ access, short = false }: { access: RestaurantAccess; short?: boolean }) {
  const label = useAccessLabel(access, { short });
  return <span className={`badge badge-${accessTone(access.status)}`}>{label}</span>;
}
