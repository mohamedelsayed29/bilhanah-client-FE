import { useId, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CalendarBlankIcon, CaretLeftIcon, CaretRightIcon, DotsThreeVerticalIcon, MagnifyingGlassIcon, PlusIcon, UserIcon,
} from '@phosphor-icons/react';
import type { Reservation, RestaurantTable, TableArea } from '@bilhanah/contracts';
import { ActionMenu, type ActionMenuItem } from '../../../components/ActionMenu';
import { Button } from '../../../components/Button';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { Skeleton } from '../../../components/Skeleton';
import { formatDate } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { statusOption, TABLE_STATUSES, type TableStatus } from './floor-status';
import { localDay, reservationStatusOption } from './ReservationDialog';
import { tableLocationOption } from './TableDialogs';

/** A status as a coloured pill: the same colours as on the floor plan. */
export function StatusPill({ status }: { status: TableStatus }) {
  const { text } = useLanguage();
  const option = statusOption(status);
  return <span className={`status-pill is-${status.toLowerCase()}`}><span aria-hidden="true" />{text(option.ar, option.en)}</span>;
}

type ReservationsState = { data: Reservation[] | undefined; isPending: boolean; isError: boolean; error: unknown; refetch: () => void };

/**
 * The panel beside the floor plan: every table (search, status filter, quick actions) and the
 * day's reservations, as two tabs.
 */
export function TablesSidePanel({ tables, total, areas, statusOf, selectedId, onSelect, tableActions, reservations, day, onDay, onAddReservation, onOpenReservation, reservationActions }: {
  /** The tables the area and location filters leave. */
  tables: RestaurantTable[];
  /** Every table of the branch, for the tab's count. */
  total: number;
  areas: TableArea[];
  statusOf: (table: RestaurantTable) => TableStatus;
  selectedId: string | null;
  onSelect: (tableId: string) => void;
  tableActions: (table: RestaurantTable) => ActionMenuItem[];
  /** Null for viewers without reservations.view: the tab is left out. */
  reservations: ReservationsState | null;
  day: string;
  onDay: (day: string) => void;
  /** Omitted without reservations.manage. */
  onAddReservation?: () => void;
  onOpenReservation: (reservation: Reservation) => void;
  reservationActions: (reservation: Reservation) => ActionMenuItem[];
}) {
  const { text, number, count, language } = useLanguage();
  const [tab, setTab] = useState<'tables' | 'reservations'>('tables');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TableStatus | 'ALL'>('ALL');
  const ids = { tables: useId(), reservations: useId() };

  const query = search.trim().toLowerCase();
  const listed = tables.filter(table => (status === 'ALL' || statusOf(table) === status) && (!query || table.label.toLowerCase().includes(query)));
  // Under their areas, in the areas' order, then the ones in no area; one flat list without areas.
  const groups = areas.length === 0
    ? [{ key: 'all', title: null as string | null, tables: listed }]
    : [...areas.map(area => ({ key: area.id, title: area.name, tables: listed.filter(table => table.areaId === area.id) })),
      { key: 'none', title: text('بدون منطقة', 'No area'), tables: listed.filter(table => table.areaId === null) }].filter(group => group.tables.length > 0);
  const upcoming = (reservations?.data ?? []).filter(entry => entry.status === 'PENDING' || entry.status === 'CONFIRMED').length;
  const shiftDay = (days: number) => {
    const date = new Date(`${day}T12:00:00`);
    date.setDate(date.getDate() + days);
    onDay(localDay(date));
  };
  const today = localDay();
  const dayLabel = day === today ? text('النهارده', 'Today') : formatDate(`${day}T12:00:00`, language, { weekday: 'short', day: 'numeric', month: 'short' });

  return <aside className="card tables-side" aria-label={text('الطاولات والحجوزات', 'Tables and reservations')}>
    <div className="tables-side-tabs" role="tablist" aria-label={text('اللوحة', 'Panel')}>
      <button type="button" role="tab" id={`${ids.tables}-tab`} aria-controls={ids.tables} aria-selected={tab === 'tables'} onClick={() => setTab('tables')}>
        {text('الطاولات', 'Tables')}<span className="tab-count">{number(total)}</span>
      </button>
      {reservations && <button type="button" role="tab" id={`${ids.reservations}-tab`} aria-controls={ids.reservations} aria-selected={tab === 'reservations'} onClick={() => setTab('reservations')}>
        {text('الحجوزات', 'Reservations')}<span className="tab-count">{number(upcoming)}</span>
      </button>}
    </div>

    {tab === 'tables' && <div role="tabpanel" id={ids.tables} aria-labelledby={`${ids.tables}-tab`} className="tables-side-body">
      <div className="tables-side-tools">
        <label className="search-field">
          <MagnifyingGlassIcon size={17} aria-hidden="true" />
          <span className="visually-hidden">{text('دوّر على طاولة', 'Search tables')}</span>
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={text('دوّر بالاسم أو الرقم…', 'Search by name or number…')} />
        </label>
        <label className="visually-hidden" htmlFor={`${ids.tables}-status`}>{text('الحالة', 'Status')}</label>
        <select id={`${ids.tables}-status`} className="select tables-side-status" value={status} onChange={event => setStatus(event.target.value as TableStatus | 'ALL')}>
          <option value="ALL">{text('كل الحالات', 'All statuses')}</option>
          {TABLE_STATUSES.map(option => <option key={option.value} value={option.value}>{text(option.ar, option.en)}</option>)}
        </select>
      </div>
      <p className="tables-side-summary" data-testid="tables-count">{count(listed.length, 'table')}</p>
      {listed.length === 0
        ? <p className="tables-side-empty">{text('مفيش طاولات بالبحث ده.', 'No tables match.')}</p>
        : groups.map(group => <section key={group.key} className="tables-side-group" data-testid="table-group" data-area={group.key === 'none' ? '' : group.title ?? ''}>
          {group.title !== null && <h3 className="tables-side-group-title"><bdi>{group.title}</bdi><span>{number(group.tables.length)}</span></h3>}
          <ul className="tables-side-list">
          {group.tables.map(table => {
            const area = areas.find(entry => entry.id === table.areaId);
            const location = tableLocationOption(table.location);
            const selected = table.id === selectedId;
            return <li key={table.id} className={`tables-side-row ${selected ? 'is-selected' : ''}`} data-testid="table-item" data-label={table.label}>
              <button type="button" className="tables-side-pick" onClick={() => onSelect(table.id)} aria-pressed={selected}>
                <span className="tables-side-qr" aria-hidden="true"><QRCodeSVG value={table.qrUrl} size={34} level="L" marginSize={0} /></span>
                <span className="tables-side-name">
                  <strong><bdi>{table.label}</bdi></strong>
                  <small><bdi>{area?.name ?? text(location.ar, location.en)}</bdi></small>
                </span>
                <StatusPill status={statusOf(table)} />
                <span className="tables-side-seats" title={count(table.seats, 'seat')}><UserIcon size={14} aria-hidden="true" />{number(table.seats)}<span className="visually-hidden"> {text('أفراد', 'seats')}</span></span>
              </button>
              {tableActions(table).length > 0 && <ActionMenu label={text(`إجراءات ${table.label}`, `Actions for ${table.label}`)} trigger={<DotsThreeVerticalIcon size={18} weight="bold" />} items={tableActions(table)} />}
            </li>;
          })}
          </ul>
        </section>)}
    </div>}

    {tab === 'reservations' && reservations && <div role="tabpanel" id={ids.reservations} aria-labelledby={`${ids.reservations}-tab`} className="tables-side-body">
      <div className="reservations-day">
        <button type="button" className="icon-button" onClick={() => shiftDay(-1)} aria-label={text('اليوم اللي قبله', 'Previous day')}><CaretRightIcon size={16} className="directional" /></button>
        <strong><CalendarBlankIcon size={16} aria-hidden="true" />{dayLabel}</strong>
        <button type="button" className="icon-button" onClick={() => shiftDay(1)} aria-label={text('اليوم اللي بعده', 'Next day')}><CaretLeftIcon size={16} className="directional" /></button>
        {day !== today && <button type="button" className="link-action" onClick={() => onDay(today)}>{text('النهارده', 'Today')}</button>}
      </div>
      {onAddReservation && <Button small block onClick={onAddReservation} icon={<PlusIcon size={16} aria-hidden="true" />}>{text('حجز جديد', 'New reservation')}</Button>}
      {reservations.isPending && <div className="tables-side-list">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} height={58} />)}</div>}
      {reservations.isError && <ErrorPanel error={reservations.error} onRetry={reservations.refetch} />}
      {reservations.data && (reservations.data.length === 0
        ? <p className="tables-side-empty">{text('مفيش حجوزات في اليوم ده.', 'No reservations on this day.')}</p>
        : <ul className="tables-side-list">
          {reservations.data.map(entry => {
            const option = reservationStatusOption(entry.status);
            return <li key={entry.id} className={`tables-side-row reservation-row is-${entry.status.toLowerCase()}`} data-testid="reservation-item" data-name={entry.customerName}>
              <button type="button" className="tables-side-pick" onClick={() => onOpenReservation(entry)}>
                <time className="reservation-time" dateTime={entry.reservedAt}>{formatDate(entry.reservedAt, language, { hour: 'numeric', minute: '2-digit' })}</time>
                <span className="tables-side-name">
                  <strong><bdi>{entry.customerName}</bdi></strong>
                  <small>{entry.tableLabel ? <bdi>{entry.tableLabel}</bdi> : text('من غير ترابيزة', 'No table')} · {text(`${number(entry.guests)} أفراد`, `${entry.guests} guests`)}</small>
                </span>
                <span className={`reservation-pill is-${entry.status.toLowerCase()}`}>{text(option.ar, option.en)}</span>
              </button>
              {reservationActions(entry).length > 0 && <ActionMenu label={text(`إجراءات حجز ${entry.customerName}`, `Actions for ${entry.customerName}’s reservation`)} trigger={<DotsThreeVerticalIcon size={18} weight="bold" />} items={reservationActions(entry)} />}
            </li>;
          })}
        </ul>)}
    </div>}
  </aside>;
}
