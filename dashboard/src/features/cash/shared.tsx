import { NavLink, Outlet } from 'react-router';
import { ChartBarIcon, ClockCounterClockwiseIcon, GearSixIcon, SealCheckIcon, WalletIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import {
  CASH_REVIEW_STATUS_LABELS,
  CASH_SHIFT_STATUS_LABELS,
  CASH_TRANSACTION_KIND_LABELS,
  type CashReviewStatus,
  type CashShiftStatus,
  type CashTransactionKind,
  type Permission,
} from '@bilhanah/contracts';
import { PageHeader } from '../../components/PageHeader';
import { egpToPiastres, formatPrice, piastresToInput } from '../../lib/format';
import { useLanguage } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';

export const cashKeys = {
  all: ['cash'] as const,
  me: ['cash', 'me'] as const,
  settings: ['cash', 'settings'] as const,
  registers: (branchId: string | null) => ['cash', 'registers', branchId] as const,
  shifts: (filters: object) => ['cash', 'shifts', filters] as const,
  shift: (id: string) => ['cash', 'shift', id] as const,
  pending: (branchId: string | null) => ['cash', 'pending', branchId] as const,
  report: (filters: object) => ['cash', 'report', filters] as const,
};

/** Any of these opens the section. */
export const CASH_PERMISSIONS: Permission[] = ['cash.operate', 'cash.view', 'cash.approve', 'cash.settings'];

export function useMoney() {
  const { language } = useLanguage();
  return (piastres: number | null | undefined) => (piastres === null || piastres === undefined ? '—' : formatPrice(piastres, language));
}

/** Parses an amount typed in pounds; null when empty or invalid. Allows a leading minus when `signed`. */
export function parseMoney(value: string, signed = false): number | null {
  const trimmed = value.trim().replace(/^[−–]/, '-');
  if (signed && trimmed.startsWith('-')) {
    const amount = egpToPiastres(trimmed.slice(1));
    return amount === null ? null : -amount;
  }
  return egpToPiastres(trimmed);
}

export const moneyInput = (piastres: number | null) => (piastres === null ? '' : piastres < 0 ? `-${piastresToInput(-piastres)}` : piastresToInput(piastres));

type Tone = 'success' | 'warning' | 'danger' | 'guava' | 'muted' | 'info';

export function ShiftStatusBadge({ status }: { status: CashShiftStatus }) {
  const { text } = useLanguage();
  const tone: Tone = status === 'OPEN' ? 'success' : status === 'CLOSING' ? 'warning' : 'muted';
  return <span className={`badge att-badge tone-${tone}`} data-status={status}>{text(...CASH_SHIFT_STATUS_LABELS[status])}</span>;
}

export function ReviewBadge({ status }: { status: CashReviewStatus | null }) {
  const { text } = useLanguage();
  if (!status) return <>—</>;
  const tone: Tone = status === 'PENDING' ? 'guava' : status === 'REJECTED' ? 'danger' : 'success';
  return <span className={`badge att-badge tone-${tone}`} data-review={status}>{text(...CASH_REVIEW_STATUS_LABELS[status])}</span>;
}

export function KindLabel({ kind }: { kind: CashTransactionKind }) {
  const { text } = useLanguage();
  return <>{text(...CASH_TRANSACTION_KIND_LABELS[kind])}</>;
}

/** Counted minus expected, coloured: a shortage in red, an overage in amber, balanced in green. */
export function Discrepancy({ piastres }: { piastres: number | null }) {
  const { text } = useLanguage();
  const money = useMoney();
  if (piastres === null) return <>—</>;
  const tone = piastres < 0 ? 'danger' : piastres > 0 ? 'warning' : 'success';
  const label = piastres < 0 ? text('عجز', 'Short') : piastres > 0 ? text('زيادة', 'Over') : text('مظبوط', 'Balanced');
  return <span className={`cash-diff tone-${tone}`} data-testid="cash-discrepancy">
    <strong className="ltr">{piastres > 0 ? '+' : ''}{money(piastres)}</strong> <small>{label}</small>
  </span>;
}

export function useDateTime() {
  const { language } = useLanguage();
  return (iso: string | null) => (iso ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—');
}

/** "12 m 05 s", "1 h 4 m". */
export function useSeconds() {
  const { text, number } = useLanguage();
  return (seconds: number | null) => {
    if (seconds === null) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h) return text(`${number(h)} س ${number(m)} د`, `${h} h ${m} m`);
    if (m) return text(`${number(m)} د ${number(s)} ث`, `${m} m ${String(s).padStart(2, '0')} s`);
    return text(`${number(s)} ث`, `${s} s`);
  };
}

const TABS: { to: string; end?: boolean; icon: Icon; ar: string; en: string; need: Permission[] }[] = [
  { to: '/cash', end: true, icon: WalletIcon, ar: 'درجي', en: 'My drawer', need: ['cash.operate'] },
  { to: '/cash/shifts', icon: ClockCounterClockwiseIcon, ar: 'سجل الشيفتات', en: 'Shift history', need: ['cash.operate', 'cash.view', 'cash.approve'] },
  { to: '/cash/review', icon: SealCheckIcon, ar: 'المراجعة', en: 'Review', need: ['cash.approve'] },
  { to: '/cash/reports', icon: ChartBarIcon, ar: 'التقارير', en: 'Reports', need: ['cash.view'] },
  { to: '/cash/settings', icon: GearSixIcon, ar: 'الخزن والقواعد', en: 'Registers & rules', need: ['cash.settings'] },
];

/** The cashier shift section: one header and its pages as tabs (those the viewer may open). */
export function CashLayout() {
  const { text } = useLanguage();
  const { can, to } = useWorkspace();
  return <div className="page attendance-page cash-page">
    <PageHeader title={text('شيفت الكاشير والخزنة', 'Cashier shifts')}
      description={text('افتح الشيفت برصيد البداية، تابع الكاش اللي داخل وخارج، واقفل بعدّ الدرج ومقارنته بالمتوقع.', 'Open a shift with the starting cash, follow every cash movement, and close by counting the drawer against what is expected.')} />
    <nav className="att-tabs" aria-label={text('أقسام الخزنة', 'Cash sections')}>
      {TABS.filter(tab => tab.need.some(can)).map(tab => <NavLink key={tab.to} to={to(tab.to)} end={tab.end} className="att-tab">
        <tab.icon size={18} weight="bold" aria-hidden="true" />{text(tab.ar, tab.en)}
      </NavLink>)}
    </nav>
    <Outlet />
  </div>;
}
