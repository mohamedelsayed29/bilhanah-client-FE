import { NavLink, Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarDotsIcon, ChartBarIcon, ClipboardTextIcon, DeviceTabletIcon, GearSixIcon, ListChecksIcon, SquaresFourIcon, UsersThreeIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { ATTENDANCE_METHOD_LABELS, ATTENDANCE_STATUS_LABELS, type AttendanceOverviewRow, type AttendanceSource, type AttendanceStatus, type Permission } from '@bilhanah/contracts';
import { PageHeader } from '../../components/PageHeader';
import { attendanceApi } from '../../lib/api/endpoints';
import { useLanguage } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';

export const attendanceKeys = {
  all: ['attendance'] as const,
  policies: ['attendance', 'policies'] as const,
  employees: ['attendance', 'employees'] as const,
  shifts: (from: string, to: string, branchId: string | null) => ['attendance', 'shifts', from, to, branchId] as const,
  overview: (date: string, branchId: string | null) => ['attendance', 'overview', date, branchId] as const,
  records: (filters: object) => ['attendance', 'records', filters] as const,
  summary: (from: string, to: string, branchId: string | null) => ['attendance', 'summary', from, to, branchId] as const,
  corrections: (status: string | null, branchId: string | null) => ['attendance', 'corrections', status, branchId] as const,
  kiosks: ['attendance', 'kiosks'] as const,
  me: ['attendance', 'me'] as const,
  myCorrections: ['attendance', 'me', 'corrections'] as const,
};

export function useEmployeesQuery(enabled = true) {
  return useQuery({ queryKey: attendanceKeys.employees, queryFn: attendanceApi.employees, enabled });
}

/** The local date of `at` ("2026-11-04"). */
export const isoDay = (at = new Date()) => `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
export const addDays = (day: string, days: number) => isoDay(new Date(new Date(`${day}T12:00:00`).getTime() + days * 86_400_000));

/** "8 h 05 m", or "45 m". */
export function useDuration() {
  const { text, number } = useLanguage();
  return (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return text(`${number(m)} د`, `${m} m`);
    return text(`${number(h)} س ${number(m)} د`, `${h} h ${String(m).padStart(2, '0')} m`);
  };
}

export function useClock() {
  const { language } = useLanguage();
  return (iso: string | null) => (iso ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '—');
}

type Tone = 'success' | 'warning' | 'danger' | 'guava' | 'muted' | 'info';
const STATE_TONE: Record<AttendanceOverviewRow['state'], Tone> = {
  PRESENT: 'success', OVERTIME: 'success', WORKING: 'info', LATE: 'warning', EARLY_LEAVE: 'warning', INCOMPLETE: 'danger', ABSENT: 'danger',
  ON_LEAVE: 'muted', PENDING_CORRECTION: 'guava', UPCOMING: 'muted', NOT_SCHEDULED: 'muted',
};

/** A status (or the overview's working / upcoming states) as a coloured badge. */
export function StatusBadge({ status }: { status: AttendanceOverviewRow['state'] }) {
  const { text } = useLanguage();
  const label = status === 'WORKING' ? text('شغال دلوقتي', 'Working now') : status === 'UPCOMING' ? text('لسه شيفته ما بدأش', 'Shift not started')
    : status === 'NOT_SCHEDULED' ? text('مفيش شيفت', 'Not scheduled') : text(...ATTENDANCE_STATUS_LABELS[status as AttendanceStatus]);
  return <span className={`badge att-badge tone-${STATE_TONE[status]}`} data-status={status}>{label}</span>;
}

export function MethodLabel({ method }: { method: AttendanceSource | null }) {
  const { text } = useLanguage();
  return method ? <>{text(...ATTENDANCE_METHOD_LABELS[method])}</> : <>—</>;
}

const TABS: { to: string; end?: boolean; icon: Icon; ar: string; en: string; need: Permission[] }[] = [
  { to: '/attendance', end: true, icon: SquaresFourIcon, ar: 'النهارده', en: 'Today', need: ['attendance.view'] },
  { to: '/attendance/records', icon: ListChecksIcon, ar: 'السجلات', en: 'Records', need: ['attendance.view'] },
  { to: '/attendance/shifts', icon: CalendarDotsIcon, ar: 'الشيفتات', en: 'Shifts', need: ['attendance.view'] },
  { to: '/attendance/employees', icon: UsersThreeIcon, ar: 'الموظفين', en: 'Employees', need: ['attendance.view'] },
  { to: '/attendance/corrections', icon: ClipboardTextIcon, ar: 'طلبات التصحيح', en: 'Corrections', need: ['attendance.view'] },
  { to: '/attendance/reports', icon: ChartBarIcon, ar: 'التقارير', en: 'Reports', need: ['attendance.view'] },
  { to: '/attendance/kiosks', icon: DeviceTabletIcon, ar: 'أجهزة الحضور', en: 'Devices', need: ['attendance.manage'] },
  { to: '/attendance/settings', icon: GearSixIcon, ar: 'الإعدادات', en: 'Settings', need: ['attendance.settings'] },
];

/** The attendance section: one header and its pages as tabs (those the viewer may open). */
export function AttendanceLayout() {
  const { text } = useLanguage();
  const { can, to } = useWorkspace();
  return <div className="page attendance-page">
    <PageHeader title={text('الحضور والانصراف', 'Attendance')}
      description={text('مين جه ومين غاب، الشيفتات، التصحيحات والتقارير، وطرق تسجيل الحضور في كل فرع.', 'Who came and who did not, shifts, corrections, reports, and how each branch checks in.')} />
    <nav className="att-tabs" aria-label={text('أقسام الحضور', 'Attendance sections')}>
      {TABS.filter(tab => tab.need.some(can)).map(tab => <NavLink key={tab.to} to={to(tab.to)} end={tab.end} className="att-tab">
        <tab.icon size={18} weight="bold" aria-hidden="true" />{text(tab.ar, tab.en)}
      </NavLink>)}
    </nav>
    <Outlet />
  </div>;
}
