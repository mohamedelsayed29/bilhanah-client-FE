import type { RestaurantTable, TableOccupancy, TableStatus } from '@bilhanah/contracts';

/**
 * A table's state on the floor plan (the API's, see TABLE_STATUSES): switched off (unavailable), guests at it
 * (occupied), being cleaned after they left (cleaning), held by a booking around its time (reserved), or free.
 */
export type { TableStatus };

export const TABLE_STATUSES: { value: TableStatus; ar: string; en: string }[] = [
  { value: 'AVAILABLE', ar: 'متاحة', en: 'Available' },
  { value: 'OCCUPIED', ar: 'مشغولة', en: 'Occupied' },
  { value: 'RESERVED', ar: 'محجوزة', en: 'Reserved' },
  { value: 'CLEANING', ar: 'بتتنضف', en: 'Cleaning' },
  { value: 'UNAVAILABLE', ar: 'متوقفة', en: 'Unavailable' },
];

export const statusOption = (status: TableStatus) => TABLE_STATUSES.find(option => option.value === status)!;

export function tableStatus(table: RestaurantTable, occupancy: TableOccupancy | undefined): TableStatus {
  if (!table.isActive) return 'UNAVAILABLE';
  if (occupancy) return occupancy.status;
  return table.cleaning ? 'CLEANING' : 'AVAILABLE';
}

/** Merged tables as one seating: its name, members (lead first), seats and a colour to tell groups apart. */
export type TableGroupInfo = { id: string; name: string; label: string | null; members: RestaurantTable[]; leadId: string; seats: number; colour: string };

const GROUP_COLOURS = ['#c42e44', '#6b2d5c', '#1f5fb8', '#8a5300'];

/** Each table's group (or null), from the tables' groupId and the floor's group details (label, lead). */
export function tableGroups(tables: RestaurantTable[], floor: TableOccupancy[] | undefined): (table: RestaurantTable) => TableGroupInfo | null {
  const ids = [...new Set(tables.map(table => table.groupId).filter((id): id is string => id !== null))].sort();
  const groups = new Map(ids.map((id, index) => {
    const detail = floor?.find(row => row.group?.id === id)?.group ?? null;
    const lead = detail?.leadTableId;
    const members = tables.filter(table => table.groupId === id).sort((a, b) => (a.id === lead ? -1 : b.id === lead ? 1 : 0));
    const info: TableGroupInfo = {
      id, label: detail?.label ?? null, members, leadId: lead ?? members[0]!.id,
      name: detail?.label ?? members.map(table => table.label).join(' + '),
      seats: members.reduce((sum, table) => sum + table.seats, 0),
      colour: GROUP_COLOURS[index % GROUP_COLOURS.length]!,
    };
    return [id, info] as const;
  }));
  return table => (table.groupId ? groups.get(table.groupId) ?? null : null);
}
