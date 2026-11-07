import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowClockwiseIcon, ArrowDownIcon, ArrowUpIcon, CalendarBlankIcon, ChartBarIcon, CheckCircleIcon, CoinsIcon, EyeIcon, FileCsvIcon, FilePdfIcon,
  FunnelSimpleIcon, InfoIcon, ReceiptIcon, StorefrontIcon, TagIcon, WalletIcon, XCircleIcon, XIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { REPORT_TYPES, type ReportData, type ReportQuery, type ReportRow, type ReportType } from '@bilhanah/contracts';
import { apiClient } from '../../lib/api';
import { useLanguage, usePageTitle } from '../../lib/language';
import { PageHeader } from '../../components/PageHeader';
import { Dialog } from '../../components/Dialog';
import { Pagination } from '../../components/Pagination';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useWorkspace } from '../branches/workspace';
import { useBranchScope } from '../branches/BranchScope';
import { ReportsOverview } from './ReportsOverview';
import './reports.css';

export type PeriodKey = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

/** The period's first and last local dates (the restaurant's calendar). */
export function reportPeriod(period: string, timezone: string, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const end = new Date(`${today}T00:00:00Z`), start = new Date(end);
  if (period === 'weekly') start.setUTCDate(start.getUTCDate() - 6);
  if (period === 'monthly') start.setUTCDate(1);
  if (period === 'quarterly') { start.setUTCDate(1); start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3); }
  if (period === 'yearly') { start.setUTCDate(1); start.setUTCMonth(0); }
  return { from: start.toISOString().slice(0, 10), to: today };
}

const PERIODS: [PeriodKey, string, string][] = [['daily', 'النهارده', 'Today'], ['weekly', 'آخر ٧ أيام', 'Last 7 days'], ['monthly', 'الشهر ده', 'This month'], ['quarterly', 'الربع ده', 'This quarter'], ['yearly', 'السنة دي', 'This year'], ['custom', 'فترة مخصصة', 'Custom']];
const TYPE_LABELS: Record<ReportType, [string, string]> = { overview: ['يوم بيوم', 'By day'], sales: ['المبيعات', 'Sales'], orders: ['الطلبات', 'Orders'], products: ['الأصناف', 'Products'], categories: ['الأقسام', 'Categories'], branches: ['الفروع', 'Branches'], payments: ['المدفوعات', 'Payments'] };
const STATUS_LABELS: Record<string, [string, string]> = { PLACED: ['جديد', 'Placed'], ACCEPTED: ['مقبول', 'Accepted'], PREPARING: ['قيد التجهيز', 'Preparing'], READY: ['جاهز', 'Ready'], COMPLETED: ['مكتمل', 'Completed'], CANCELLED: ['ملغي', 'Cancelled'], REJECTED: ['مرفوض', 'Rejected'] };
const PAYMENT_LABELS: Record<string, [string, string]> = { CASH: ['نقدي', 'Cash'], CARD: ['بطاقة', 'Card'], WALLET: ['محفظة', 'Wallet'], OTHER: ['أخرى', 'Other'], UNPAID: ['غير مدفوع', 'Unpaid'] };
const SORTS: [ReportQuery['sort'], string, string][] = [['net', 'صافي المبيعات', 'Net sales'], ['gross', 'الإجمالي', 'Gross sales'], ['units', 'الوحدات', 'Units'], ['orders', 'الطلبات', 'Orders'], ['name', 'الاسم', 'Name'], ['date', 'التاريخ', 'Date']];
const params = (query: ReportQuery) => new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)])).toString();
const DEFAULT_TZ = 'Africa/Cairo';

/**
 * Reports: one bar sets the period and filters for everything on the page; then the headline
 * figures, the trend, where sales came from, and the detailed report to sort, page and download.
 */
export function ReportsPage() {
  const { text, language } = useLanguage();
  usePageTitle('التقارير', 'Reports');
  const workspace = useWorkspace(), scope = useBranchScope();
  const queryClient = useQueryClient();
  const toast = useToast();
  const allowed = workspace.can('analytics.financial') && workspace.can('analytics.view');
  const [period, setPeriod] = useState<PeriodKey>('monthly');
  const [filters, setFilters] = useState<ReportQuery>(() => ({ ...reportPeriod('monthly', DEFAULT_TZ), type: 'overview', language, page: 1, pageSize: 20, sort: 'net', direction: 'desc' }));
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const branchId = scope.selected === 'all' ? undefined : scope.selected;
  const query = { ...filters, language, branchId };
  const result = useQuery({ queryKey: ['reports', query], queryFn: ({ signal }) => apiClient.request<ReportData>(`/v1/reports?${params(query)}`, { signal }), enabled: allowed, placeholderData: keepPreviousData });
  const data = result.data;
  const timezone = data?.restaurant.timezone ?? DEFAULT_TZ;
  // The restaurant's calendar decides "today" once it is known.
  useEffect(() => {
    if (!data || period === 'custom') return;
    const range = reportPeriod(period, data.restaurant.timezone);
    setFilters(current => (current.from === range.from && current.to === range.to ? current : { ...current, ...range, page: 1 }));
  }, [data?.restaurant.timezone, period]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const update = (patch: Partial<ReportQuery>) => setFilters(current => ({ ...current, ...patch, page: 1 }));
  const money = (value: number) => new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: data?.restaurant.currency ?? 'EGP', maximumFractionDigits: 2 }).format(value / 100);

  async function exportReport(format: 'pdf' | 'csv' | 'html') {
    if (!data || busy || result.isFetching) return;
    setBusy(format);
    try {
      const blob = await apiClient.requestBlob(`/v1/reports/export?${params(query)}&format=${format}`);
      const url = URL.createObjectURL(blob);
      if (format === 'html') setPreview(url);
      else {
        const link = document.createElement('a');
        link.href = url; link.download = `bilhanah-${query.type}-${query.from}-${query.to}.${format}`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        toast.success(text('التقرير اتنزّل.', 'Your report was downloaded.'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text('تعذر تنزيل التقرير. حاول تاني.', 'Could not download the report. Try again.'));
    } finally { setBusy(null); }
  }

  if (!allowed) return <div className="page"><PageHeader title={text('التقارير', 'Reports')} /><div className="card empty-state">{text('عرض وتنزيل التقارير يحتاج صلاحية الإحصائيات المالية.', 'Viewing and exporting reports requires financial analytics permission.')}</div></div>;
  const exportDisabled = !data || Boolean(busy) || result.isFetching || result.isError;
  return <div className="page reports-page">
    <PageHeader title={text('التقارير', 'Reports')} description={text('كل أرقام مطعمك في مكان واحد: اختار الفترة، راجع الأداء، ونزّل التقرير.', 'Your restaurant in numbers: pick a period, review performance, and download the report.')}
      actions={<div className="rp-actions">
        <button type="button" className="button button-secondary rp-icon-button" onClick={() => { void result.refetch(); void queryClient.invalidateQueries({ queryKey: ['report-overview'] }); }} disabled={result.isFetching}
          aria-label={text('تحديث', 'Refresh')} title={text('تحديث', 'Refresh')}><ArrowClockwiseIcon size={18} className={result.isFetching ? 'rp-spin' : ''} aria-hidden="true" /></button>
        <button type="button" className="button button-secondary" disabled={exportDisabled} onClick={() => void exportReport('html')}><EyeIcon size={18} aria-hidden="true" />{text('معاينة', 'Preview')}</button>
        <button type="button" className="button button-secondary" disabled={exportDisabled} onClick={() => void exportReport('csv')}><FileCsvIcon size={18} aria-hidden="true" />{busy === 'csv' ? text('بنجهز…', 'Preparing…') : 'CSV'}</button>
        <button type="button" className="button button-primary" disabled={exportDisabled} onClick={() => void exportReport('pdf')}><FilePdfIcon size={18} aria-hidden="true" />{busy === 'pdf' ? text('بنجهز…', 'Preparing…') : text('تنزيل PDF', 'Download PDF')}</button>
      </div>} />

    <Toolbar period={period} filters={filters} data={data} timezone={timezone} branchName={scope.branch?.name ?? null}
      onPeriod={value => { setPeriod(value); if (value !== 'custom') update(reportPeriod(value, timezone)); }}
      onRange={patch => { setPeriod('custom'); update(patch); }} onFilters={update}
      onReset={() => { setPeriod('monthly'); update({ ...reportPeriod('monthly', timezone), categoryId: undefined, productId: undefined, status: undefined, paymentMethod: undefined }); }} />

    {result.isError && !data && <ErrorPanel error={result.error} onRetry={() => void result.refetch()} />}
    {result.isPending && <div className="rp-kpis">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height={128} radius={20} />)}</div>}
    {data && <div className={`rp-body ${result.isPlaceholderData ? 'is-refreshing' : ''}`} aria-busy={result.isFetching}>
      <Kpis data={data} money={money} />
      <ReportsOverview filters={query} data={data} enabled={allowed} />
      {data.summary.orders === 0
        ? <div className="card rp-empty"><ChartBarIcon size={36} aria-hidden="true" /><h2>{text('مفيش حركة في الفترة دي', 'No activity in this period')}</h2><p>{text('جرّب فترة أو فلاتر تانية. تقدر برضه تنزّل التقرير الفاضي.', 'Try another period or filters. You can still download the empty report.')}</p></div>
        : <Breakdowns data={data} money={money} multiBranch={scope.multi && !branchId} />}
      <Details data={data} filters={filters} money={money} onFilters={update} onPage={page => setFilters(current => ({ ...current, page }))} />
      <footer className="rp-footer">
        <details className="rp-rules"><summary><InfoIcon size={16} aria-hidden="true" />{text('إزاي الأرقام بتتحسب؟', 'How are the figures calculated?')}</summary>
          <p>{text('المبيعات بتستبعد الطلبات والأصناف الملغية والمرفوضة. الصافي = الإجمالي ناقص خصومات مكافآت الولاء والاسترجاع النقدي المسجل. متوسط الطلب = الصافي ÷ الطلبات غير الملغية. استرجاع البطاقات مش متسجل في السيستم.', 'Sales exclude cancelled and rejected orders and dishes. Net = gross minus loyalty reward discounts and recorded cash refunds. Average order = net ÷ orders not cancelled. Card refunds are not recorded.')}</p>
        </details>
        <span>{text('آخر تحديث', 'Last updated')}: {new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: data.restaurant.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt))}</span>
      </footer>
    </div>}
    {preview && <Dialog open title={text('معاينة التقرير', 'Report preview')} size="wide" onClose={() => setPreview(null)}
      footer={<button type="button" className="button button-primary" disabled={Boolean(busy)} onClick={() => void exportReport('pdf')}><FilePdfIcon size={18} aria-hidden="true" />{text('تنزيل PDF', 'Download PDF')}</button>}>
      <iframe title={text('معاينة التقرير', 'Report preview')} src={preview} sandbox="" className="reports-preview" />
    </Dialog>}
  </div>;
}

/** The period chips, the range, and the optional filters with their active chips. */
function Toolbar({ period, filters, data, timezone, branchName, onPeriod, onRange, onFilters, onReset }: {
  period: PeriodKey; filters: ReportQuery; data: ReportData | undefined; timezone: string; branchName: string | null;
  onPeriod: (period: PeriodKey) => void; onRange: (patch: Partial<ReportQuery>) => void; onFilters: (patch: Partial<ReportQuery>) => void; onReset: () => void;
}) {
  const { text, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const locale = language === 'ar' ? 'ar-EG' : 'en-GB';
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));
  const name = (option: { name: string; nameEn: string | null }) => (language === 'ar' ? option.name : option.nameEn || option.name);
  const category = data?.options.categories.find(entry => entry.id === filters.categoryId);
  const product = data?.options.products.find(entry => entry.id === filters.productId);
  const chips = [
    category && { key: 'category', label: name(category), clear: () => onFilters({ categoryId: undefined, productId: undefined }) },
    product && { key: 'product', label: name(product), clear: () => onFilters({ productId: undefined }) },
    filters.status && { key: 'status', label: text(...STATUS_LABELS[filters.status]!), clear: () => onFilters({ status: undefined }) },
    filters.paymentMethod && { key: 'payment', label: text(...PAYMENT_LABELS[filters.paymentMethod]!), clear: () => onFilters({ paymentMethod: undefined }) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];
  const changed = chips.length > 0 || period !== 'monthly';
  return <section className="card rp-toolbar" aria-label={text('الفترة والفلاتر', 'Period and filters')}>
    <div className="rp-toolbar-row">
      <div className="rp-periods" role="group" aria-label={text('الفترة', 'Period')}>
        {PERIODS.map(([key, ar, en]) => <button key={key} type="button" className={period === key ? 'active' : ''} aria-pressed={period === key} onClick={() => onPeriod(key)}>{text(ar, en)}</button>)}
      </div>
      <button type="button" className={`button button-secondary rp-filter-toggle ${open ? 'is-open' : ''}`} aria-expanded={open} aria-controls="rp-filters" onClick={() => setOpen(value => !value)}>
        <FunnelSimpleIcon size={18} aria-hidden="true" />{text('فلاتر', 'Filters')}{chips.length > 0 && <span className="rp-badge">{chips.length}</span>}
      </button>
    </div>
    <div className="rp-context">
      {period === 'custom'
        ? <div className="rp-range">
          <label><span>{text('من', 'From')}</span><input type="date" value={filters.from} max={filters.to} onChange={event => event.target.value && onRange({ from: event.target.value })} /></label>
          <span aria-hidden="true">—</span>
          <label><span>{text('إلى', 'To')}</span><input type="date" value={filters.to} min={filters.from} onChange={event => event.target.value && onRange({ to: event.target.value })} /></label>
        </div>
        : <span className="rp-context-item"><CalendarBlankIcon size={16} aria-hidden="true" /><bdi>{filters.from === filters.to ? day(filters.from) : `${day(filters.from)} — ${day(filters.to)}`}</bdi></span>}
      <span className="rp-context-item"><StorefrontIcon size={16} aria-hidden="true" /><bdi>{branchName ?? text('كل الفروع', 'All branches')}</bdi></span>
      <span className="rp-context-item rp-muted">{timezone}</span>
      {chips.map(chip => <button key={chip.key} type="button" className="rp-chip" onClick={chip.clear} aria-label={text(`شيل فلتر ${chip.label}`, `Remove filter ${chip.label}`)}><bdi>{chip.label}</bdi><XIcon size={12} weight="bold" aria-hidden="true" /></button>)}
      {changed && <button type="button" className="rp-reset" onClick={onReset}>{text('رجّع الافتراضي', 'Reset')}</button>}
    </div>
    {open && <div className="rp-filters" id="rp-filters">
      <label>{text('القسم', 'Category')}<select className="select" value={filters.categoryId ?? ''} onChange={event => onFilters({ categoryId: event.target.value || undefined, productId: undefined })}>
        <option value="">{text('كل الأقسام', 'All categories')}</option>{data?.options.categories.map(option => <option key={option.id} value={option.id}>{name(option)}</option>)}</select></label>
      <label>{text('الصنف', 'Product')}<select className="select" value={filters.productId ?? ''} onChange={event => onFilters({ productId: event.target.value || undefined })}>
        <option value="">{text('كل الأصناف', 'All products')}</option>{data?.options.products.filter(option => !filters.categoryId || option.categoryId === filters.categoryId).map(option => <option key={option.id} value={option.id}>{name(option)}</option>)}</select></label>
      <label>{text('حالة الطلب', 'Order status')}<select className="select" value={filters.status ?? ''} onChange={event => onFilters({ status: (event.target.value || undefined) as ReportQuery['status'] })}>
        <option value="">{text('كل الحالات', 'All statuses')}</option>{Object.entries(STATUS_LABELS).map(([key, value]) => <option key={key} value={key}>{text(...value)}</option>)}</select></label>
      <label>{text('طريقة الدفع', 'Payment method')}<select className="select" value={filters.paymentMethod ?? ''} onChange={event => onFilters({ paymentMethod: (event.target.value || undefined) as ReportQuery['paymentMethod'] })}>
        <option value="">{text('كل الطرق', 'All methods')}</option>{Object.entries(PAYMENT_LABELS).map(([key, value]) => <option key={key} value={key}>{text(...value)}</option>)}</select></label>
    </div>}
  </section>;
}

function Kpis({ data, money }: { data: ReportData; money: (value: number) => string }) {
  const { text, number } = useLanguage();
  const { summary } = data;
  const share = (value: number, of: number) => (of ? number(value / of, { style: 'percent', maximumFractionDigits: 0 }) : '—');
  const cards: { key: string; icon: Icon; tone: string; label: string; value: string; note: string; featured?: boolean }[] = [
    { key: 'net', icon: CoinsIcon, tone: 'coral', label: text('صافي المبيعات', 'Net sales'), value: money(summary.net), note: text(`من إجمالي ${money(summary.gross)}`, `Of ${money(summary.gross)} gross`), featured: true },
    { key: 'orders', icon: ReceiptIcon, tone: 'green', label: text('الطلبات', 'Orders'), value: number(summary.orders), note: text(`${number(summary.pending)} قيد التنفيذ`, `${summary.pending} in progress`) },
    { key: 'average', icon: WalletIcon, tone: 'yellow', label: text('متوسط الطلب', 'Average order'), value: money(summary.average), note: text('الصافي ÷ الطلبات غير الملغية', 'Net ÷ orders not cancelled') },
    { key: 'completed', icon: CheckCircleIcon, tone: 'teal', label: text('طلبات مكتملة', 'Completed'), value: number(summary.completed), note: text(`${share(summary.completed, summary.orders)} من الطلبات`, `${share(summary.completed, summary.orders)} of orders`) },
  ];
  const deductions = [
    { key: 'gross', icon: ChartBarIcon, label: text('إجمالي المبيعات', 'Gross sales'), value: money(summary.gross) },
    { key: 'discounts', icon: TagIcon, label: text('خصومات الولاء', 'Loyalty discounts'), value: money(summary.discounts) },
    { key: 'refunds', icon: ArrowClockwiseIcon, label: text('استرجاع نقدي', 'Cash refunds'), value: money(summary.refunds), hint: summary.refundedOrders ? text(`${number(summary.refundedOrders)} طلب`, `${summary.refundedOrders} orders`) : undefined },
    { key: 'cancelled', icon: XCircleIcon, label: text('ملغي / مرفوض', 'Cancelled / rejected'), value: number(summary.cancelled), hint: share(summary.cancelled, summary.orders) },
  ];
  return <section aria-label={text('الأرقام الأساسية', 'Headline figures')}>
    <div className="rp-kpis">{cards.map(card => <div key={card.key} className={`card rp-kpi ${card.featured ? 'is-featured' : ''}`} data-testid={`rp-kpi-${card.key}`}>
      <span className={`rp-kpi-icon tone-${card.tone}`} aria-hidden="true"><card.icon size={20} weight="bold" /></span>
      <span className="rp-kpi-label">{card.label}</span>
      <strong className="rp-kpi-value">{card.value}</strong>
      <small>{card.note}</small>
    </div>)}</div>
    <dl className="card rp-strip">{deductions.map(entry => <div key={entry.key}>
      <dt><entry.icon size={16} aria-hidden="true" />{entry.label}</dt>
      <dd>{entry.value}{entry.hint && <small>{entry.hint}</small>}</dd>
    </div>)}</dl>
  </section>;
}

/** Where sales came from: categories, payment methods, top products, and branches when there are several. */
function Breakdowns({ data, money, multiBranch }: { data: ReportData; money: (value: number) => string; multiBranch: boolean }) {
  const { text, language, number } = useLanguage();
  const name = (row: ReportRow) => (PAYMENT_LABELS[row.name] ? text(...PAYMENT_LABELS[row.name]!) : language === 'ar' ? row.name : row.nameEn || row.name);
  const panels: { key: string; title: string; rows: ReportRow[]; tone: string }[] = [
    { key: 'products', title: text('أعلى الأصناف', 'Top products'), rows: data.topProducts, tone: 'coral' },
    { key: 'categories', title: text('المبيعات حسب القسم', 'Sales by category'), rows: data.categories, tone: 'green' },
    { key: 'payments', title: text('طرق الدفع', 'Payment methods'), rows: data.payments, tone: 'yellow' },
    ...(multiBranch ? [{ key: 'branches', title: text('المبيعات حسب الفرع', 'Sales by branch'), rows: data.branches, tone: 'teal' }] : []),
  ];
  return <div className="rp-breakdowns">{panels.map(panel => <section key={panel.key} className={`card rp-panel tone-${panel.tone}`} aria-labelledby={`rp-panel-${panel.key}`}>
    <h2 id={`rp-panel-${panel.key}`}>{panel.title}</h2>
    {panel.rows.length === 0 ? <p className="rp-muted">{text('مفيش بيانات.', 'No data.')}</p> : <ol className="rp-ranking">{panel.rows.slice(0, 5).map((row, index) => <li key={row.id}>
      <span className="rp-rank">{number(index + 1)}</span>
      <span className="rp-rank-body">
        <span className="rp-rank-line"><bdi className="rp-rank-name">{name(row)}</bdi><strong>{money(row.net)}</strong></span>
        <span className="rp-rank-meta"><span className="rp-track" aria-hidden="true"><span style={{ width: `${Math.max(2, Math.min(100, row.contribution))}%` }} /></span>
          <small>{number(Math.round(row.contribution))}%{panel.key === 'products' ? ` · ${text(`${number(row.units)} وحدة`, `${row.units} units`)}` : ` · ${text(`${number(row.orders)} طلب`, `${row.orders} orders`)}`}</small></span>
      </span>
    </li>)}</ol>}
  </section>)}</div>;
}

/** The detailed report: what it is about (tabs), sorting, the table and its pages. Downloads follow it. */
function Details({ data, filters, money, onFilters, onPage }: { data: ReportData; filters: ReportQuery; money: (value: number) => string; onFilters: (patch: Partial<ReportQuery>) => void; onPage: (page: number) => void }) {
  const { text, language, number } = useLanguage();
  const name = (row: ReportRow) => (PAYMENT_LABELS[row.name] ? text(...PAYMENT_LABELS[row.name]!) : language === 'ar' ? row.name : row.nameEn || row.name);
  const orders = filters.type === 'orders';
  const last = filters.type === 'branches' ? text('متوسط الطلب', 'Average order') : filters.type === 'categories' ? text('عدد الأصناف', 'Products') : text('استرجاع', 'Refunds');
  const Direction = filters.direction === 'desc' ? ArrowDownIcon : ArrowUpIcon;
  const columns = useMemo(() => [text('البيان', 'Name'), text('القسم', 'Category'), text('الطلبات', 'Orders'), text('الوحدات', 'Units'), text('الإجمالي', 'Gross'), text('الصافي', 'Net'), text('المساهمة', 'Share'), last], [text, last]);
  return <section className="card rp-details" aria-labelledby="rp-details-title">
    <header className="rp-details-head">
      <div><h2 id="rp-details-title">{text('التقرير التفصيلي', 'Detailed report')}</h2>
        <p className="rp-muted">{text(`${number(data.total)} سجل · التنزيل بيشمل كل السجلات مش الصفحة دي بس`, `${data.total} rows · Downloads include every row, not just this page`)}</p></div>
      {!orders && <div className="rp-sort">
        <label className="visually-hidden" htmlFor="rp-sort">{text('ترتيب حسب', 'Sort by')}</label>
        <select id="rp-sort" className="select" value={filters.sort} onChange={event => onFilters({ sort: event.target.value as ReportQuery['sort'] })}>
          {SORTS.map(([value, ar, en]) => <option key={value} value={value}>{text(`ترتيب: ${ar}`, `Sort: ${en}`)}</option>)}
        </select>
        <button type="button" className="button button-secondary rp-icon-button" onClick={() => onFilters({ direction: filters.direction === 'asc' ? 'desc' : 'asc' })}
          aria-label={filters.direction === 'desc' ? text('تنازلي', 'Descending') : text('تصاعدي', 'Ascending')} title={filters.direction === 'desc' ? text('تنازلي', 'Descending') : text('تصاعدي', 'Ascending')}><Direction size={16} aria-hidden="true" /></button>
      </div>}
    </header>
    <div className="rp-types" role="tablist" aria-label={text('نوع التقرير', 'Report type')}>
      {REPORT_TYPES.map(type => <button key={type} type="button" role="tab" aria-selected={filters.type === type} className={filters.type === type ? 'active' : ''} onClick={() => onFilters({ type })}>{text(...TYPE_LABELS[type])}</button>)}
    </div>
    {orders && <p className="rp-muted rp-note">{text('الطلبات مترتبة من الأحدث.', 'Orders are listed newest first.')}</p>}
    <div className="table-scroll reports-table" tabIndex={0} role="region" aria-label={text('بيانات التقرير، اسحب لرؤية كل الأعمدة', 'Report data, scroll to see every column')}>
      <table className="data-table"><thead><tr>{columns.map((column, index) => <th key={column} className={index >= 2 ? 'num' : undefined}>{column}</th>)}</tr></thead>
        <tbody>{data.rows.length === 0 ? <tr><td colSpan={8} className="rp-muted">{text('مفيش سجلات.', 'No rows.')}</td></tr> : data.rows.map(row => <tr key={row.id}>
          <td><strong><bdi>{name(row)}</bdi></strong>{row.status && <small>{text(...STATUS_LABELS[row.status]!)} · {text(...PAYMENT_LABELS[row.paymentMethod ?? 'UNPAID']!)}</small>}</td>
          <td>{(language === 'ar' ? row.category : row.categoryEn || row.category) ?? '—'}</td>
          <td className="num">{number(row.orders)}</td><td className="num">{number(row.units)}</td>
          <td className="num">{money(row.gross)}</td><td className="num"><strong>{money(row.net)}</strong></td>
          <td className="num">{number(Math.round(row.contribution * 10) / 10)}%</td>
          <td className="num">{filters.type === 'branches' ? money(row.average) : filters.type === 'categories' ? number(row.products) : money(row.refunds)}</td>
        </tr>)}</tbody></table>
    </div>
    <Pagination page={filters.page} pageSize={filters.pageSize} total={data.total} label={text('صفحات التقرير', 'Report pages')} onChange={onPage} />
  </section>;
}
