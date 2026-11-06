import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowCounterClockwiseIcon, ArrowsClockwiseIcon, ArrowsMergeIcon, ArrowsSplitIcon, BroomIcon, ChartBarIcon, CalendarCheckIcon, CalendarPlusIcon, CheckCircleIcon, ForkKnifeIcon, ListNumbersIcon, MapPinAreaIcon, PencilSimpleIcon,
  PlusIcon, PowerIcon, PrinterIcon, ProhibitIcon, QrCodeIcon, ReceiptIcon, TableIcon, TrashIcon, UserCheckIcon, XCircleIcon,
} from '@phosphor-icons/react';
import { type ManualTableStatus, ORDER_ERROR_CODES, ORDER_LIMITS, TABLE_STATUS_TRANSITIONS, type Reservation, type ReservationStatus, type RestaurantTable, type TableArea, type TableAttribute, type TableOccupancy, type TableLocation } from '@bilhanah/contracts';
import type { ActionMenuItem } from '../../../components/ActionMenu';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { PageHeader } from '../../../components/PageHeader';
import { PageSkeleton } from '../../../components/Skeleton';
import { useToast } from '../../../components/Toast';
import { isApiError } from '../../../lib/api';
import { ordersApi, reservationsApi, tableGroupsApi, tablesApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { fill, useCopy } from '../../../lib/copy';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { PageBranchPicker, usePageBranch } from '../../branches/BranchScope';
import { useBranchList, useOwnerBranch, useWorkspace } from '../../branches/workspace';
import { queryKeys, useReservationsQuery, useTableAreasQuery, useTablesQuery } from '../queries';
import { FloorCanvas, type FloorMoveChange, type FloorShape } from './FloorCanvas';
import { TABLE_STATUSES, type TableGroupInfo, tableGroups, type TableStatus, tableStatus } from './floor-status';
import { MergeTablesDialog } from './MergeTablesDialog';
import { localDay, ReservationDialog } from './ReservationDialog';
import { DeleteTableAreaDialog, ManageAreasDialog, TableAreaDialog } from './TableAreaDialogs';
import { AddRangeDialog, AddTableDialog, TABLE_ATTRIBUTE_OPTIONS, TABLE_LOCATION_OPTIONS, TableEditDialog } from './TableDialogs';
import { TableDetails, TableQrDialog } from './TableDetails';
import { TableBillDialog, useFloorQuery } from './TablesFloor';
import { tableFilePrefix } from './qr-download';

export { tableFilePrefix };
import { TablesSidePanel } from './TablesSidePanel';

const replaceTable = (tables: RestaurantTable[] | undefined, table: RestaurantTable) => tables?.map(entry => (entry.id === table.id ? table : entry));

function useTableMutations(branchId: string, areas: TableArea[]) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { text } = useLanguage();
  const key = queryKeys.branchTables(branchId);
  const onError = (error: unknown) => {
    toast.error(errorMessage(error, text));
    if (isApiError(error, ORDER_ERROR_CODES.TABLE_NOT_FOUND)) void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
  };
  /** Optimistic: the table switches (or moves on the plan) at once, and goes back if the save fails. */
  const optimistic = (table: RestaurantTable, change: Partial<RestaurantTable>) => {
    queryClient.setQueryData<RestaurantTable[]>(key, tables => replaceTable(tables, { ...table, ...change }));
    return { previous: table };
  };
  const rollback = (error: unknown, context: { previous: RestaurantTable } | undefined) => {
    if (context) queryClient.setQueryData<RestaurantTable[]>(key, tables => replaceTable(tables, context.previous));
    onError(error);
  };
  const setActive = useMutation({
    mutationFn: ({ table, isActive }: { table: RestaurantTable; isActive: boolean }) => tablesApi.update(table.id, { isActive }),
    onMutate: ({ table, isActive }) => optimistic(table, { isActive }),
    onError: (error, _vars, context) => rollback(error, context),
    onSuccess: table => {
      queryClient.setQueryData<RestaurantTable[]>(key, tables => replaceTable(tables, table));
      void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
      toast.success(table.isActive ? text(`«${table.label}» شغالة`, `“${table.label}” is active`) : text(`«${table.label}» اتقفلت`, `“${table.label}” is turned off`));
    },
  });
  /** A drop on the floor plan: a new spot, and another area (or location) when it landed in one. */
  const move = useMutation({
    mutationFn: ({ table, ...body }: { table: RestaurantTable; floorX: number | null; floorY: number | null } & FloorMoveChange) => tablesApi.update(table.id, body),
    onMutate: ({ table, floorX, floorY, areaId, location }) => {
      const area = areaId ? areas.find(entry => entry.id === areaId) : undefined;
      return optimistic(table, { floorX, floorY, ...(areaId !== undefined && { areaId }), ...(area ? { location: area.location } : location && { location }) });
    },
    onError: (error, _vars, context) => rollback(error, context),
    onSuccess: (table, { table: before }) => {
      queryClient.setQueryData<RestaurantTable[]>(key, tables => replaceTable(tables, table));
      if (table.areaId === before.areaId) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.branchTableAreas(branchId) });
      const area = areas.find(entry => entry.id === table.areaId);
      toast.success(area ? text(`«${table.label}» اتنقلت لـ«${area.name}»`, `“${table.label}” moved to ${area.name}`) : text(`«${table.label}» بقت من غير منطقة`, `“${table.label}” is in no area now`));
    },
  });
  /** A turn or resize on the floor plan. */
  const shape = useMutation({
    mutationFn: ({ table, ...body }: { table: RestaurantTable } & FloorShape) => tablesApi.update(table.id, body),
    onMutate: ({ table, ...body }) => optimistic(table, body),
    onError: (error, _vars, context) => rollback(error, context),
    onSuccess: table => queryClient.setQueryData<RestaurantTable[]>(key, tables => replaceTable(tables, table)),
  });
  const regenerate = useMutation({
    mutationFn: (table: RestaurantTable) => tablesApi.regenerateCode(table.id),
    onSuccess: table => {
      queryClient.setQueryData<RestaurantTable[]>(key, tables => replaceTable(tables, table));
      toast.success(text(`كود جديد لـ«${table.label}». اطبعه تاني.`, `New code for “${table.label}”. Print it again.`));
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (table: RestaurantTable) => tablesApi.remove(table.id),
    onSuccess: (_data, table) => {
      queryClient.setQueryData<RestaurantTable[]>(key, tables => tables?.filter(entry => entry.id !== table.id));
      void queryClient.invalidateQueries({ queryKey: queryKeys.branchTableAreas(branchId) });
      toast.success(text(`مسحنا «${table.label}»`, `“${table.label}” deleted`));
    },
    onError,
  });
  return { setActive, move, shape, regenerate, remove };
}

export function TablesPage() {
  const page = usePageBranch();
  if (!page.branchId) return <PageSkeleton blocks={2} />;
  return <BranchTables key={page.branchId} branchId={page.branchId} page={page} />;
}


type AreaFilter = 'ALL' | 'NONE' | string;

/**
 * Tables management: a summary of the floor, the floor plan itself (filter by area and indoor or
 * outdoor, zoom, drag tables into place, pick one to see its details), and a side panel with every
 * table and the day's reservations.
 */
function BranchTables({ branchId, page }: { branchId: string; page: ReturnType<typeof usePageBranch> }) {
  const { text, count, number } = useLanguage();
  const t = useCopy();
  usePageTitle('الطاولات', 'Tables');
  const toast = useToast();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const branch = useOwnerBranch(branchId);
  const multi = useBranchList().branches.filter(entry => entry.isActive).length > 1;
  const tables = useTablesQuery(branchId);
  const ordering = branch?.ordering ?? { included: false, enabled: false, acceptsDineIn: false, acceptsPickup: false, paused: false };
  const floor = useFloorQuery(branchId, ordering.included);
  const areasQuery = useTableAreasQuery(branchId);
  const areas = areasQuery.data ?? [];
  const mutations = useTableMutations(branchId, areas);
  const [day, setDay] = useState(localDay);
  // What the viewer may do here (the API checks the same): arrange tables, take bookings, settle bills.
  const manage = workspace.can('tables.manage');
  const changeStatus = workspace.can('tables.status');
  const seeBookings = workspace.can('reservations.view');
  const book = workspace.can('reservations.manage');
  const seeBills = workspace.can('payments.view');
  const reservations = useReservationsQuery(branchId, day, seeBookings);

  const [adding, setAdding] = useState<'one' | 'range' | null>(null);
  const [addTo, setAddTo] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'code' | 'delete'; table: RestaurantTable } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [billId, setBillId] = useState<string | null>(null);
  const [merging, setMerging] = useState<{ initial: string | null } | null>(null);
  const [separating, setSeparating] = useState<TableGroupInfo | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('ALL');
  const [where, setWhere] = useState<TableLocation | 'ALL'>('ALL');
  const [feature, setFeature] = useState<TableAttribute | 'ALL'>('ALL');
  const [managingAreas, setManagingAreas] = useState(false);
  const [editingArea, setEditingArea] = useState<TableArea | 'new' | null>(null);
  const [deletingArea, setDeletingArea] = useState<TableArea | null>(null);
  const [booking, setBooking] = useState<{ reservation: Reservation | null; tableId: string | null; seat?: boolean } | null>(null);

  // Separating merged tables: each one on its own again, with its orders and history.
  const separate = useMutation({
    mutationFn: (group: TableGroupInfo) => tableGroupsApi.dissolve(group.id),
    onSuccess: (_data, group) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
      toast.success(text(`اتفصلت ${group.name}`, `${group.name} separated`));
      setSeparating(null);
    },
    onError: error => { toast.error(errorMessage(error, text)); setSeparating(null); },
  });

  // Staff change a table's status by hand (tables.status): cleaning, available again, switched off or on.
  const setTableStatus = useMutation({
    mutationFn: ({ table, status }: { table: RestaurantTable; status: ManualTableStatus }) => ordersApi.setTableStatus(table.id, status),
    onSuccess: (rows, { table, status }) => {
      queryClient.setQueryData(queryKeys.floor(branchId), rows);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
      toast.success({
        AVAILABLE: text(`«${table.label}» متاحة`, `“${table.label}” is available`),
        CLEANING: text(`«${table.label}» بتتنضف`, `“${table.label}” is being cleaned`),
        UNAVAILABLE: text(`«${table.label}» اتقفلت`, `“${table.label}” is turned off`),
      }[status]);
    },
    onError: error => toast.error(errorMessage(error, text)),
  });

  const setReservationStatus = useMutation({
    mutationFn: ({ reservation, status }: { reservation: Reservation; status: ReservationStatus }) => reservationsApi.update(reservation.id, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reservations });
      void queryClient.invalidateQueries({ queryKey: queryKeys.floors });
    },
    onError: error => toast.error(errorMessage(error, text)),
  });

  const owner = workspace.role === 'OWNER';
  const orderingPath = owner && !multi ? '/settings/ordering' : workspace.branchSettings(branchId);
  const printPath = `${workspace.to('/tables/print')}${page.needsPicker ? `?branch=${branchId}` : ''}`;

  if (tables.isPending) return <PageSkeleton blocks={3} />;
  if (tables.isError) return <div className="page"><ErrorPanel error={tables.error} onRetry={() => void tables.refetch()} /></div>;
  const list = tables.data;
  const full = list.length >= ORDER_LIMITS.tables;
  const busy = confirm?.kind === 'code' ? mutations.regenerate.isPending : mutations.remove.isPending;
  const filePrefix = tableFilePrefix(workspace.restaurant.subdomain, branch);
  const occupancyOf = (table: RestaurantTable) => floor.data?.find(entry => entry.id === table.id);
  const groupOf = tableGroups(list, floor.data);
  /** A merged group's bill: every member's open orders, settled together (from the lead table). */
  const billOf = (tableId: string | null): TableOccupancy | null => {
    const row = floor.data?.find(entry => entry.id === tableId) ?? null;
    const group = row?.group;
    if (!row || !group) return row;
    const members = (floor.data ?? []).filter(entry => group.tableIds.includes(entry.id));
    const openOrders = members.flatMap(entry => entry.openOrders).sort((a, b) => a.placedAt.localeCompare(b.placedAt));
    return { ...row, label: group.label ?? members.map(entry => entry.label).join(' + '), seats: group.seats, openOrders,
      unpaidPiastres: members.reduce((sum, entry) => sum + entry.unpaidPiastres, 0), since: openOrders[0]?.placedAt ?? null };
  };
  const statusOf = (table: RestaurantTable): TableStatus => tableStatus(table, occupancyOf(table));
  const statuses = list.map(statusOf);
  const tally = (status: TableStatus) => statuses.filter(entry => entry === status).length;
  const shown = list.filter(table => (where === 'ALL' || table.location === where)
    && (areaFilter === 'ALL' || (areaFilter === 'NONE' ? table.areaId === null : table.areaId === areaFilter))
    && (feature === 'ALL' || table.attributes.includes(feature)));
  const unassigned = list.filter(table => table.areaId === null).length;
  const selected = list.find(table => table.id === selectedId) ?? null;
  const upcoming = (reservations.data ?? []).filter(entry => entry.status === 'PENDING' || entry.status === 'CONFIRMED').length;
  const seatsFree = list.reduce((sum, table, index) => sum + (statuses[index] === 'AVAILABLE' ? table.seats : 0), 0);
  const seatsTaken = list.reduce((sum, table, index) => sum + (statuses[index] === 'OCCUPIED' ? table.seats : 0), 0);

  const addTable = (areaId: string | null, kind: 'one' | 'range' = 'one') => { setAddTo(areaId); setAdding(kind); };
  /** A table's actions; the details bar has its own QR and Edit buttons, so it leaves those two out (`primary: false`). */
  const tableActions = (table: RestaurantTable, primary = true): ActionMenuItem[] => [
    ...(primary && manage ? [
      { label: text('كود QR', 'View QR code'), icon: <QrCodeIcon size={17} aria-hidden="true" />, onSelect: () => setQrId(table.id) },
      { label: text('تعديل', 'Edit'), icon: <PencilSimpleIcon size={17} aria-hidden="true" />, onSelect: () => setEditId(table.id) },
    ] : []),
    ...(statusOf(table) === 'OCCUPIED' && seeBills ? [{ label: text('الحساب وفضّي الترابيزة', 'Bill and free the table'), icon: <ReceiptIcon size={17} aria-hidden="true" />, onSelect: () => setBillId(table.id) }] : []),
    ...(book ? [{ label: text('احجزها', 'Book this table'), icon: <CalendarPlusIcon size={17} aria-hidden="true" />, onSelect: () => setBooking({ reservation: null, tableId: table.id }), disabled: !table.isActive }] : []),
    ...(changeStatus ? statusActions(table) : []),
    ...(changeStatus ? groupActions(table) : []),
    ...(manage ? tableManageActions(table) : []),
  ];
  /** Merge this table with others, or separate its group. */
  const groupActions = (table: RestaurantTable): ActionMenuItem[] => {
    const group = groupOf(table);
    if (group) return [{ label: text('افصل الطاولات', 'Separate tables'), icon: <ArrowsSplitIcon size={17} aria-hidden="true" />, onSelect: () => setSeparating(group) }];
    return table.isActive ? [{ label: text('ادمجها مع طاولات تانية', 'Merge with other tables'), icon: <ArrowsMergeIcon size={17} aria-hidden="true" />, onSelect: () => setMerging({ initial: table.id }) }] : [];
  };
  /** The status changes this table's current status allows (TABLE_STATUS_TRANSITIONS). */
  const statusActions = (table: RestaurantTable): ActionMenuItem[] => {
    const current = statusOf(table);
    const allowed = TABLE_STATUS_TRANSITIONS[current];
    const to = (status: ManualTableStatus) => () => setTableStatus.mutate({ table, status });
    return [
      ...(allowed.includes('CLEANING') ? [{ label: text('علّمها بتتنضف', 'Mark as cleaning'), icon: <BroomIcon size={17} aria-hidden="true" />, onSelect: to('CLEANING') }] : []),
      ...(allowed.includes('AVAILABLE') ? [current === 'UNAVAILABLE'
        ? { label: text('شغّلها', 'Turn on'), icon: <PowerIcon size={17} aria-hidden="true" />, onSelect: to('AVAILABLE') }
        : { label: text('اتنضفت، خليها متاحة', 'Cleaned, mark available'), icon: <CheckCircleIcon size={17} aria-hidden="true" />, onSelect: to('AVAILABLE') }] : []),
      ...(allowed.includes('UNAVAILABLE') ? [{ label: text('وقّفها مؤقتًا', 'Turn off'), icon: <PowerIcon size={17} aria-hidden="true" />, onSelect: to('UNAVAILABLE') }] : []),
    ];
  };
  const tableManageActions = (table: RestaurantTable): ActionMenuItem[] => [
    // Turning a table off and on is a status change (statusActions) for those who may change statuses.
    ...(changeStatus ? [] : [table.isActive
      ? { label: text('وقّفها مؤقتًا', 'Turn off'), icon: <PowerIcon size={17} aria-hidden="true" />, onSelect: () => mutations.setActive.mutate({ table, isActive: false }) }
      : { label: text('شغّلها', 'Turn on'), icon: <PowerIcon size={17} aria-hidden="true" />, onSelect: () => mutations.setActive.mutate({ table, isActive: true }) }]),
    { label: text('اعمل QR جديد', 'Regenerate QR code'), icon: <ArrowsClockwiseIcon size={17} aria-hidden="true" />, onSelect: () => setConfirm({ kind: 'code', table }) },
    ...(table.floorX !== null ? [{ label: text('رجّع مكانها تلقائي', 'Reset position'), icon: <ArrowCounterClockwiseIcon size={17} aria-hidden="true" />, onSelect: () => mutations.move.mutate({ table, floorX: null, floorY: null }) }] : []),
    { label: text('امسح', 'Delete'), icon: <TrashIcon size={17} aria-hidden="true" />, danger: true, onSelect: () => setConfirm({ kind: 'delete', table }) },
  ];
  const reservationActions = (reservation: Reservation): ActionMenuItem[] => {
    if (!book) return [];
    const to = (status: ReservationStatus) => () => setReservationStatus.mutate({ reservation, status });
    const open = reservation.status === 'PENDING' || reservation.status === 'CONFIRMED';
    return [
      ...(reservation.status === 'PENDING' ? [{ label: text('أكّد الحجز', 'Confirm'), icon: <CheckCircleIcon size={17} aria-hidden="true" />, onSelect: to('CONFIRMED') }] : []),
      // Seating needs a table: without one, the booking opens to pick it, already set to seated.
      ...(open ? [{ label: text('وصلوا، قعّدهم', 'Seat guests'), icon: <UserCheckIcon size={17} aria-hidden="true" />, onSelect: reservation.tableId ? to('SEATED') : () => setBooking({ reservation, tableId: null, seat: true }) }] : []),
      ...(reservation.status === 'SEATED' ? [{ label: text('خلص', 'Complete'), icon: <CheckCircleIcon size={17} aria-hidden="true" />, onSelect: to('COMPLETED') }] : []),
      { label: text('تعديل', 'Edit'), icon: <PencilSimpleIcon size={17} aria-hidden="true" />, onSelect: () => setBooking({ reservation, tableId: null }) },
      ...(open ? [
        { label: text('محضروش', 'Mark no-show'), icon: <ProhibitIcon size={17} aria-hidden="true" />, onSelect: to('NO_SHOW') },
        { label: text('الغي الحجز', 'Cancel reservation'), icon: <XCircleIcon size={17} aria-hidden="true" />, danger: true, onSelect: to('CANCELLED') },
      ] : []),
    ];
  };

  const summary = [
    { key: 'total', icon: TableIcon, value: list.length, label: text('كل الطاولات', 'Total tables'), note: count(list.length - tally('UNAVAILABLE'), [{ one: 'واحدة شغالة', two: 'اتنين شغالين', few: '{n} شغالة', many: '{n} شغالة', zero: 'مفيش شغال' }, { one: '{n} active', other: '{n} active' }]) },
    { key: 'available', icon: CheckCircleIcon, value: tally('AVAILABLE'), label: text('متاحة', 'Available'), note: text(`${number(seatsFree)} كرسي فاضي`, `${seatsFree} seats free`) },
    { key: 'occupied', icon: ForkKnifeIcon, value: tally('OCCUPIED'), label: text('مشغولة', 'Occupied'), note: text(`${number(seatsTaken)} كرسي مشغول`, `${seatsTaken} seats taken`) },
    { key: 'reserved', icon: CalendarCheckIcon, value: tally('RESERVED'), label: text('محجوزة', 'Reserved'), note: text(`${number(upcoming)} حجز جاي في اليوم ده`, `${upcoming} upcoming that day`) },
    { key: 'cleaning', icon: BroomIcon, value: tally('CLEANING'), label: text('بتتنضف', 'Cleaning'), note: text('لحد ما تتعلّم متاحة', 'Until marked available') },
  ];

  return <div className="page tables-page">
    <PageHeader title={text('إدارة الطاولات', 'Tables management')}
      description={multi && branch
        ? fill(t.tablesBranch.description, { name: branch.name })
        : text('تابع حالة كل ترابيزة، رتّب الصالة، وسجّل الحجوزات من مكان واحد.', 'See every table’s status, arrange your floor, and take reservations in one place.')}
      actions={<>
        {workspace.can('analytics.view') && <Link className="button button-secondary" to="/insights/tables"><ChartBarIcon size={18} aria-hidden="true" />{text('إحصائيات الطاولات', 'Table insights')}</Link>}
        {changeStatus && list.filter(table => table.isActive && !table.groupId).length >= 2 && <Button variant="secondary" onClick={() => setMerging({ initial: null })} icon={<ArrowsMergeIcon size={18} aria-hidden="true" />}>{text('ادمج طاولات', 'Merge tables')}</Button>}
        {manage && list.length > 0 && <Link className="button button-secondary" to={printPath}><PrinterIcon size={18} aria-hidden="true" />{text('اطبع الأكواد', 'Print QR codes')}</Link>}
        {manage && <>
        <Button variant="secondary" onClick={() => setManagingAreas(true)} icon={<MapPinAreaIcon size={18} aria-hidden="true" />}>{text('المناطق', 'Areas')}</Button>
        <Button variant="secondary" disabled={full} onClick={() => addTable(null, 'range')} icon={<ListNumbersIcon size={18} aria-hidden="true" />}>{text('ضيف كذا طاولة', 'Add several')}</Button>
        <Button disabled={full} onClick={() => addTable(null)} icon={<PlusIcon size={18} aria-hidden="true" />}>{text('ضيف طاولة', 'Add table')}</Button>
        </>}
      </>} />
    <PageBranchPicker page={page} />

    {!ordering.included && <Alert kind="info" live={false} title={text('الطلب من الطاولة محتاج باقة فيها طلبات', 'Ordering from tables needs a plan with ordering')}
      actions={workspace.can('billing.manage') ? <Link className="link-action" to="/subscription">{text('شوف الباقات', 'See plans')}</Link> : undefined}>
      {text('تقدر تجهّز طاولاتك وأكوادها دلوقتي، والزباين هيقدروا يطلبوا منها أول ما تشترك في «منيو وطلبات».', 'You can set up tables and codes now; diners can order from them once you are on “Menu & Orders”.')}
    </Alert>}
    {ordering.included && (!ordering.enabled || !ordering.acceptsDineIn) && <Alert kind="warning" live={false}
      title={!ordering.enabled ? text('الطلبات مش متشغّلة', 'Ordering is switched off') : text('طلبات الصالة مقفولة', 'Dine-in orders are switched off')}
      actions={<Link className="link-action" to={orderingPath}>{multi || !owner ? t.ordersBranch.branchSettings : text('إعدادات الطلبات', 'Ordering settings')}</Link>}>
      {multi ? t.tablesBranch.dineInOff : text('الزبون اللي يمسح كود الطاولة هيشوف المنيو بس، من غير طلب.', 'Diners who scan a table code will see the menu but cannot order.')}
    </Alert>}
    {full && <Alert kind="warning" live={false}>{text(`وصلت للحد الأقصى (${count(ORDER_LIMITS.tables, 'table')}). امسح طاولة عشان تضيف غيرها.`, `You reached the limit of ${count(ORDER_LIMITS.tables, 'table')}. Delete one to add another.`)}</Alert>}

    {list.length === 0
      ? <section className="card empty-state" aria-labelledby="tables-empty-title">
        <span className="empty-state-icon" aria-hidden="true"><TableIcon size={30} /></span>
        <h2 id="tables-empty-title">{text('ضيف طاولاتك', 'Add your tables')}</h2>
        <p>{manage
          ? text('ضيف الطاولات مرة واحدة (مثلًا من ١ لـ ٢٠)، واطبع كارت QR لكل طاولة.', 'Add your tables in one go (for example 1 to 20), then print a QR card for each one.')
          : text('لسه مفيش طاولات. صاحب المطعم أو المدير بيضيفها.', 'No tables yet. The owner or a manager adds them.')}</p>
        {manage && <div className="form-actions">
          <Button onClick={() => addTable(null, 'range')} icon={<ListNumbersIcon size={18} aria-hidden="true" />}>{text('ضيف كذا طاولة', 'Add several')}</Button>
          <Button variant="secondary" onClick={() => addTable(null)} icon={<PlusIcon size={18} aria-hidden="true" />}>{text('ضيف طاولة', 'Add table')}</Button>
        </div>}
      </section>
      : <>
        <ul className="tables-summary" aria-label={text('ملخص الطاولات', 'Tables summary')}>
          {summary.map(card => <li key={card.key} className={`tables-summary-card is-${card.key}`} data-testid={`summary-${card.key}`}>
            <span className="tables-summary-icon" aria-hidden="true"><card.icon size={22} weight="fill" /></span>
            <span className="tables-summary-body">
              <strong>{number(card.value)}</strong>
              <span>{card.label}</span>
            </span>
            <small>{card.note}</small>
          </li>)}
        </ul>

        <div className="tables-workspace">
          <section className="card tables-floor-card" aria-label={text('خريطة الصالة', 'Floor plan')} data-testid="tables-floor">
            <div className="tables-toolbar">
              <div className="chips tables-area-filter" role="group" aria-label={text('فلتر المناطق', 'Filter by area')}>
                <button type="button" className="chip" aria-pressed={areaFilter === 'ALL'} onClick={() => setAreaFilter('ALL')}>{text('كل المناطق', 'All areas')}</button>
                {areas.map(area => <button type="button" key={area.id} className="chip" aria-pressed={areaFilter === area.id} onClick={() => setAreaFilter(area.id)}>
                  <bdi>{area.name}</bdi><span className="tables-location-count">{number(area.tableCount)}</span>
                </button>)}
                {areas.length > 0 && unassigned > 0 && <button type="button" className="chip" aria-pressed={areaFilter === 'NONE'} onClick={() => setAreaFilter('NONE')}>
                  {text('بدون منطقة', 'No area')}<span className="tables-location-count">{number(unassigned)}</span>
                </button>}
                {manage && areas.length === 0 && <button type="button" className="chip chip-dashed" onClick={() => setEditingArea('new')}><PlusIcon size={14} aria-hidden="true" />{text('ضيف منطقة', 'Add area')}</button>}
              </div>
              <label className="visually-hidden" htmlFor="tables-location">{text('المكان', 'Location')}</label>
              <select id="tables-location" className="select tables-location-select" value={where} onChange={event => setWhere(event.target.value as TableLocation | 'ALL')}>
                <option value="ALL">{text('كل الأماكن', 'All locations')}</option>
                {TABLE_LOCATION_OPTIONS.map(option => <option key={option.value} value={option.value}>{text(option.ar, option.en)}</option>)}
              </select>
              {/* Tables with one feature (by the window, wheelchair accessible...): on the floor plan and in the list. */}
              <label className="visually-hidden" htmlFor="tables-feature">{text('المميزات', 'Features')}</label>
              <select id="tables-feature" className="select tables-location-select" value={feature} onChange={event => setFeature(event.target.value as TableAttribute | 'ALL')}>
                <option value="ALL">{text('كل المميزات', 'All features')}</option>
                {TABLE_ATTRIBUTE_OPTIONS.map(option => <option key={option.value} value={option.value}>{text(option.ar, option.en)}</option>)}
              </select>
            </div>
            <ul className="floor-status-legend" aria-label={text('معاني الألوان', 'Status colours')}>
              {TABLE_STATUSES.map(option => <li key={option.value} className={`is-${option.value.toLowerCase()}`}><span aria-hidden="true" />{text(option.ar, option.en)}</li>)}
            </ul>
            <FloorCanvas tables={shown} location={where} statusOf={statusOf} groupOf={groupOf} selectedId={selectedId} onSelect={setSelectedId}
              areas={areaFilter === 'ALL' ? areas.filter(area => where === 'ALL' || area.location === where) : areas.filter(area => area.id === areaFilter)}
              includeUnassigned={areaFilter === 'ALL' || areaFilter === 'NONE'}
              onMove={manage ? (table, floorX, floorY, change) => mutations.move.mutate({ table, floorX, floorY, ...change }) : undefined}
              onShape={manage ? (table, shape) => mutations.shape.mutate({ table, ...shape }) : undefined} />
          </section>

          <TablesSidePanel tables={shown} total={list.length} areas={areas} statusOf={statusOf} groupOf={groupOf} selectedId={selectedId} onSelect={setSelectedId} tableActions={table => tableActions(table)}
            reservations={!seeBookings ? null : { data: reservations.data, isPending: reservations.isPending, isError: reservations.isError, error: reservations.error, refetch: () => void reservations.refetch() }}
            day={day} onDay={setDay} onAddReservation={book ? () => setBooking({ reservation: null, tableId: null }) : undefined}
            onOpenReservation={reservation => { if (book) setBooking({ reservation, tableId: null }); }} reservationActions={reservationActions} />
        </div>

        {selected
          ? <TableDetails table={selected} area={areas.find(area => area.id === selected.areaId)} status={statusOf(selected)} occupancy={occupancyOf(selected)} group={groupOf(selected)}
            onQr={manage ? () => setQrId(selected.id) : undefined} onEdit={manage ? () => setEditId(selected.id) : undefined} actions={tableActions(selected, false)}
            onShape={manage ? shape => mutations.shape.mutate({ table: selected, ...shape }) : undefined} />
          : <p className="card table-details-hint">{text('اختار ترابيزة من الخريطة أو القايمة عشان تشوف تفاصيلها.', 'Pick a table on the plan or in the list to see its details.')}</p>}
      </>}

    <AddTableDialog branchId={branchId} open={adding === 'one'} onClose={() => setAdding(null)} areas={areas} areaId={addTo} />
    <AddRangeDialog branchId={branchId} open={adding === 'range'} onClose={() => setAdding(null)} existing={list.length} areas={areas} areaId={addTo} />
    <TableEditDialog branchId={branchId} table={list.find(table => table.id === editId) ?? null} onClose={() => setEditId(null)} areas={areas} />
    <TableQrDialog table={list.find(table => table.id === qrId) ?? null} filePrefix={filePrefix} onClose={() => setQrId(null)}
      onNewCode={table => { setQrId(null); setConfirm({ kind: 'code', table }); }} />
    <TableBillDialog branchId={branchId} table={billOf(billId)} onClose={() => setBillId(null)} />
    <MergeTablesDialog open={merging !== null} initial={merging?.initial ?? null} tables={list} areas={areas} onClose={() => setMerging(null)} />
    <ConfirmDialog open={separating !== null} busy={separate.isPending} tone="primary" onCancel={() => setSeparating(null)}
      title={text(`تفصل ${separating?.name ?? ''}؟`, `Separate ${separating?.name ?? ''}?`)}
      description={text('كل طاولة هترجع لوحدها بكراسيها وكودها، والطلبات القديمة هتفضل على طاولاتها.', 'Each table goes back to its own seats and code; past orders stay on their tables.')}
      confirmLabel={text('افصلها', 'Separate')}
      onConfirm={() => { if (separating) separate.mutate(separating); }} />
    <ReservationDialog branchId={branchId} open={booking !== null} reservation={booking?.reservation ?? null} tableId={booking?.tableId ?? null} seat={booking?.seat ?? false} day={day} tables={list}
      onClose={() => setBooking(null)} />
    <ManageAreasDialog open={managingAreas} areas={areas} onClose={() => setManagingAreas(false)}
      onAdd={() => { setManagingAreas(false); setEditingArea('new'); }}
      onEdit={area => { setManagingAreas(false); setEditingArea(area); }}
      onDelete={area => { setManagingAreas(false); setDeletingArea(area); }} />
    <TableAreaDialog branchId={branchId} area={editingArea === 'new' ? null : editingArea} open={editingArea !== null} onClose={() => setEditingArea(null)} />
    <DeleteTableAreaDialog area={deletingArea} areas={areas} onClose={() => { if (deletingArea && areaFilter === deletingArea.id) setAreaFilter('ALL'); setDeletingArea(null); }} />
    <ConfirmDialog open={confirm !== null} busy={busy} onCancel={() => setConfirm(null)}
      title={confirm?.kind === 'code' ? text(`QR جديد لـ«${confirm.table.label}»؟`, `Regenerate the QR code for “${confirm?.table.label}”?`) : text(`امسح «${confirm?.table.label ?? ''}»؟`, `Delete “${confirm?.table.label ?? ''}”?`)}
      description={confirm?.kind === 'code'
        ? text('الكود المطبوع حاليًا على الطاولة دي هيبطل يشتغل، ولازم تطبع الكارت الجديد. إعدادات الطاولة وطلباتها القديمة مش هتتأثر. استخدمها لو الكود ضاع أو حد صوّره.', 'The code printed on this table stops working and you will need to print the new card. The table’s settings and past orders stay as they are. Use this if the code was lost, copied or taken.')
        : text('الكود بتاعها هيبطل يشتغل. الطلبات القديمة مش هتتأثر.', 'Its QR code stops working. Past orders are not affected.')}
      confirmLabel={confirm?.kind === 'code' ? text('اعمل QR جديد', 'Regenerate QR code') : text('امسح', 'Delete')}
      onConfirm={() => {
        if (!confirm) return;
        const mutation = confirm.kind === 'code' ? mutations.regenerate : mutations.remove;
        mutation.mutate(confirm.table, {
          onSettled: () => setConfirm(null),
          onSuccess: () => {
            if (confirm.kind === 'delete' && selectedId === confirm.table.id) setSelectedId(null);
            // Show the new code straight away, ready to download or print.
            if (confirm.kind === 'code') setQrId(confirm.table.id);
          },
        });
      }} />
  </div>;
}
