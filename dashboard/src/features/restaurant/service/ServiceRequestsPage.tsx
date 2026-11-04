import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRingingIcon, CheckCircleIcon, ClockIcon, HourglassIcon, TimerIcon, UserIcon } from '@phosphor-icons/react';
import {
  OPEN_SERVICE_REQUEST_STATUSES, type OwnerServiceRequest, SERVICE_REQUEST_TRANSITIONS, SERVICE_REQUEST_TYPES, type ServiceRequestStatus, type ServiceRequestType,
} from '@bilhanah/contracts';
import { Button } from '../../../components/Button';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { PageHeader } from '../../../components/PageHeader';
import { Pagination } from '../../../components/Pagination';
import { PageSkeleton, Skeleton } from '../../../components/Skeleton';
import { useToast } from '../../../components/Toast';
import { serviceRequestsApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { formatDate } from '../../../lib/format';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { PageBranchPicker, usePageBranch } from '../../branches/BranchScope';
import { minutesSince } from '../orders/board';
import { elapsedLabel } from '../orders/labels';
import { useNow } from '../orders/OrderCard';
import { queryKeys, useTableAreasQuery } from '../queries';
import { SERVICE_STATUSES, SERVICE_TYPES } from './service-types';

const HISTORY_PAGE = 25;
/** An open request older than this is flagged as waiting too long. */
const LATE_MINUTES = 5;

type Filters = { type: ServiceRequestType | ''; status: ServiceRequestStatus | ''; areaId: string };

/** The next steps the staff can take on a request, in the order they usually happen. */
const STEPS: { to: ServiceRequestStatus; ar: string; en: string; variant: 'primary' | 'secondary' | 'ghost' }[] = [
  { to: 'ACKNOWLEDGED', ar: 'شُفته', en: 'Acknowledge', variant: 'secondary' },
  { to: 'IN_PROGRESS', ar: 'جاري', en: 'Start', variant: 'secondary' },
  { to: 'COMPLETED', ar: 'خلص', en: 'Complete', variant: 'primary' },
  { to: 'CANCELLED', ar: 'الغي', en: 'Cancel', variant: 'ghost' },
];

export function ServiceRequestsPage() {
  const page = usePageBranch();
  if (!page.branchId) return <PageSkeleton blocks={2} />;
  return <BranchService key={page.branchId} branchId={page.branchId} page={page} />;
}

/** "3 min", "1 h 4 min": a span of seconds as the staff read it. */
function useDuration() {
  const { text, number } = useLanguage();
  return (seconds: number | null) => {
    if (seconds === null) return '—';
    if (seconds < 60) return text(`${number(seconds)} ث`, `${seconds} s`);
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return text(`${number(minutes)} د`, `${minutes} min`);
    return text(`${number(Math.floor(minutes / 60))} س ${number(minutes % 60)} د`, `${Math.floor(minutes / 60)} h ${minutes % 60} min`);
  };
}

/**
 * Table service requests of one branch: what tables are waiting on (oldest first, with how long
 * they have waited), who is handling each, the steps to move them along, and the history with
 * the response and completion times.
 */
function BranchService({ branchId, page }: { branchId: string; page: ReturnType<typeof usePageBranch> }) {
  const { text, number } = useLanguage();
  usePageTitle('طلبات الخدمة', 'Service requests');
  const [view, setView] = useState<'active' | 'history'>('active');
  const [filters, setFilters] = useState<Filters>({ type: '', status: '', areaId: '' });
  const [historyPage, setHistoryPage] = useState(1);
  const areas = useTableAreasQuery(branchId).data ?? [];
  const duration = useDuration();

  const params = {
    branchId, view,
    ...(filters.type && { type: filters.type }),
    ...(filters.status && { status: filters.status }),
    ...(filters.areaId && { areaId: filters.areaId }),
    page: view === 'history' ? historyPage : 1,
    pageSize: view === 'history' ? HISTORY_PAGE : 100,
  };
  const list = useQuery({ queryKey: queryKeys.serviceRequestsList(branchId, params), queryFn: () => serviceRequestsApi.list(params), placeholderData: previous => previous });
  const stats = useQuery({ queryKey: queryKeys.serviceRequestStats(branchId, 7), queryFn: () => serviceRequestsApi.stats({ branchId, days: 7 }) });
  const staff = useQuery({ queryKey: queryKeys.serviceAssignees(branchId), queryFn: () => serviceRequestsApi.assignees(branchId) });

  const setFilter = (change: Partial<Filters>) => { setFilters(current => ({ ...current, ...change })); setHistoryPage(1); };
  const switchView = (next: 'active' | 'history') => { setView(next); setFilters(current => ({ ...current, status: '' })); setHistoryPage(1); };
  const statusOptions = view === 'active' ? OPEN_SERVICE_REQUEST_STATUSES : (['COMPLETED', 'CANCELLED'] as const);

  const metrics = [
    { key: 'open', icon: BellRingingIcon, value: stats.data ? number(stats.data.unresolved) : '—', label: text('مستنيين دلوقتي', 'Unresolved now') },
    { key: 'response', icon: TimerIcon, value: duration(stats.data?.averageResponseSeconds ?? null), label: text('متوسط وقت الرد', 'Average response time') },
    { key: 'completion', icon: HourglassIcon, value: duration(stats.data?.averageCompletionSeconds ?? null), label: text('متوسط وقت التنفيذ', 'Average completion time') },
    { key: 'done', icon: CheckCircleIcon, value: stats.data ? number(stats.data.completed) : '—', label: text('اتنفذ آخر ٧ أيام', 'Completed, last 7 days') },
  ];

  return <div className="page service-page">
    <PageHeader title={text('طلبات الخدمة', 'Service requests')}
      description={text('الزباين بيطلبوا الويتر أو الحساب أو أي حاجة من المنيو على الموبايل، والطلبات بتوصل هنا على طول.', 'Diners call a waiter, ask for the bill or anything else from the menu on their phone; requests arrive here live.')} />
    <PageBranchPicker page={page} />

    <ul className="tables-summary service-metrics" aria-label={text('مؤشرات الخدمة', 'Service metrics')}>
      {metrics.map(metric => <li key={metric.key} className={`tables-summary-card is-${metric.key}`} data-testid={`service-metric-${metric.key}`}>
        <span className="tables-summary-icon" aria-hidden="true"><metric.icon size={22} weight="fill" /></span>
        <span className="tables-summary-body"><strong>{metric.value}</strong></span>
        <small>{metric.label}</small>
      </li>)}
    </ul>

    <section className="card service-board" aria-labelledby="service-title">
      <div className="service-toolbar">
        <div className="tables-side-tabs service-tabs" role="tablist" aria-label={text('الطلبات', 'Requests')}>
          <button type="button" role="tab" aria-selected={view === 'active'} onClick={() => switchView('active')}>{text('مفتوحة', 'Open')}</button>
          <button type="button" role="tab" aria-selected={view === 'history'} onClick={() => switchView('history')}>{text('السجل', 'History')}</button>
        </div>
        <h2 id="service-title" className="visually-hidden">{text('الطلبات', 'Requests')}</h2>
        <div className="service-filters">
          <label className="visually-hidden" htmlFor="service-type">{text('النوع', 'Type')}</label>
          <select id="service-type" className="select" value={filters.type} onChange={event => setFilter({ type: event.target.value as ServiceRequestType | '' })}>
            <option value="">{text('كل الأنواع', 'All types')}</option>
            {SERVICE_REQUEST_TYPES.map(type => <option key={type} value={type}>{text(SERVICE_TYPES[type].ar, SERVICE_TYPES[type].en)}</option>)}
          </select>
          <label className="visually-hidden" htmlFor="service-status">{text('الحالة', 'Status')}</label>
          <select id="service-status" className="select" value={filters.status} onChange={event => setFilter({ status: event.target.value as ServiceRequestStatus | '' })}>
            <option value="">{text('كل الحالات', 'All statuses')}</option>
            {statusOptions.map(status => <option key={status} value={status}>{text(SERVICE_STATUSES[status].ar, SERVICE_STATUSES[status].en)}</option>)}
          </select>
          <label className="visually-hidden" htmlFor="service-area">{text('المنطقة', 'Area')}</label>
          <select id="service-area" className="select" value={filters.areaId} onChange={event => setFilter({ areaId: event.target.value })}>
            <option value="">{text('كل المناطق', 'All areas')}</option>
            {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
            {areas.length > 0 && <option value="none">{text('بدون منطقة', 'No area')}</option>}
          </select>
        </div>
      </div>

      {list.isPending && <div className="service-list">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} height={92} />)}</div>}
      {list.isError && <ErrorPanel error={list.error} onRetry={() => void list.refetch()} />}
      {list.data && (list.data.items.length === 0
        ? <p className="service-empty" data-testid="service-empty">{view === 'active'
          ? text('مفيش طلبات مستنية دلوقتي.', 'No requests are waiting right now.')
          : text('مفيش طلبات في السجل بالفلتر ده.', 'No requests in the history match these filters.')}</p>
        : view === 'active'
          ? <ul className="service-list">{list.data.items.map(request => <ServiceCard key={request.id} request={request} areaName={areas.find(area => area.id === request.areaId)?.name ?? null}
            staff={staff.data ?? []} />)}</ul>
          : <>
            <ServiceHistory requests={list.data.items} areaName={id => areas.find(area => area.id === id)?.name ?? null} />
            <Pagination page={historyPage} pageSize={HISTORY_PAGE} total={list.data.total} onChange={setHistoryPage} label={text('صفحات السجل', 'History pages')} />
          </>)}
    </section>
  </div>;
}

/** One open request: the table, what it asks for, how long it has waited, who has it, and its next steps. */
function ServiceCard({ request, areaName, staff }: { request: OwnerServiceRequest; areaName: string | null; staff: { id: string; name: string }[] }) {
  const { text, number } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const now = useNow(15_000);
  const type = SERVICE_TYPES[request.type];
  const waited = minutesSince(request.createdAt, now);
  const save = useMutation({
    mutationFn: (body: { status?: ServiceRequestStatus; assigneeId?: string | null }) => serviceRequestsApi.update(request.id, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests }),
    onError: error => toast.error(errorMessage(error, text)),
  });
  const allowed = SERVICE_REQUEST_TRANSITIONS[request.status];
  const status = SERVICE_STATUSES[request.status];
  return <li className={`service-card is-${request.status.toLowerCase()} ${waited >= LATE_MINUTES && request.status === 'PENDING' ? 'is-late' : ''}`}
    data-testid="service-request" data-table={request.tableLabel} data-type={request.type.toLowerCase()} data-status={request.status.toLowerCase()}>
    <span className="service-card-icon" aria-hidden="true"><type.icon size={24} weight="fill" /></span>
    <div className="service-card-body">
      <p className="service-card-title"><strong><bdi>{request.tableLabel}</bdi></strong>{areaName && <span className="service-card-area"><bdi>{areaName}</bdi></span>}</p>
      <p className="service-card-type">{text(type.ar, type.en)}</p>
      {request.note && <p className="service-card-note"><bdi>{request.note}</bdi></p>}
      <p className="service-card-meta">
        <span className={`service-status is-${request.status.toLowerCase()}`}>{text(status.ar, status.en)}</span>
        <span className="service-card-time"><ClockIcon size={13} aria-hidden="true" />{elapsedLabel(waited, text, number)}</span>
      </p>
    </div>
    <div className="service-card-actions">
      <label className="service-assign">
        <UserIcon size={15} aria-hidden="true" />
        <span className="visually-hidden">{text(`مين ماسك طلب ${request.tableLabel}`, `Who handles ${request.tableLabel}’s request`)}</span>
        <select className="select" value={request.assignee?.id ?? ''} disabled={save.isPending} onChange={event => save.mutate({ assigneeId: event.target.value || null })}>
          <option value="">{text('محدش ماسكه', 'Unassigned')}</option>
          {staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
      </label>
      <div className="service-steps">
        {STEPS.filter(step => allowed.includes(step.to)).map(step => <Button key={step.to} small variant={step.variant} disabled={save.isPending} onClick={() => save.mutate({ status: step.to })}
          aria-label={text(`${step.ar}: ${request.tableLabel}`, `${step.en}: ${request.tableLabel}`)}>{text(step.ar, step.en)}</Button>)}
      </div>
    </div>
  </li>;
}

/** Closed requests: when, which table, what, how it ended, who handled it, and how long it took. */
function ServiceHistory({ requests, areaName }: { requests: OwnerServiceRequest[]; areaName: (id: string | null) => string | null }) {
  const { text, language } = useLanguage();
  const duration = useDuration();
  const span = (from: string, to: string | null) => (to ? Math.round((Date.parse(to) - Date.parse(from)) / 1000) : null);
  return <div className="table-scroll">
    <table className="data-table service-history">
      <thead><tr>
        <th scope="col">{text('الوقت', 'Time')}</th>
        <th scope="col">{text('الترابيزة', 'Table')}</th>
        <th scope="col">{text('الطلب', 'Request')}</th>
        <th scope="col">{text('الحالة', 'Status')}</th>
        <th scope="col">{text('مين خلصه', 'Handled by')}</th>
        <th scope="col">{text('الرد', 'Response')}</th>
        <th scope="col">{text('التنفيذ', 'Completion')}</th>
      </tr></thead>
      <tbody>{requests.map(request => {
        const type = SERVICE_TYPES[request.type];
        const status = SERVICE_STATUSES[request.status];
        const area = areaName(request.areaId);
        return <tr key={request.id} data-testid="service-history-row" data-table={request.tableLabel}>
          <td>{formatDate(request.createdAt, language, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
          <td><bdi>{request.tableLabel}</bdi>{area && <small className="muted"> · <bdi>{area}</bdi></small>}</td>
          <td>{text(type.ar, type.en)}{request.note && <small className="muted service-history-note"><bdi>{request.note}</bdi></small>}</td>
          <td><span className={`service-status is-${request.status.toLowerCase()}`}>{text(status.ar, status.en)}</span>
            {request.cancelledByGuest && <small className="muted"> · {text('الزبون لغاه', 'by the guest')}</small>}</td>
          <td>{request.handledBy?.name ?? request.assignee?.name ?? '—'}</td>
          <td>{duration(span(request.createdAt, request.acknowledgedAt))}</td>
          <td>{duration(span(request.createdAt, request.completedAt))}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
