import type { RestaurantTable, TableOccupancy } from '@bilhanah/contracts';

/**
 * A table's state on the floor plan: switched off (unavailable), guests with an unpaid order
 * (occupied), held by a booking around its time (reserved), or free (available).
 */
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'UNAVAILABLE';

export const TABLE_STATUSES: { value: TableStatus; ar: string; en: string }[] = [
  { value: 'AVAILABLE', ar: 'متاحة', en: 'Available' },
  { value: 'OCCUPIED', ar: 'مشغولة', en: 'Occupied' },
  { value: 'RESERVED', ar: 'محجوزة', en: 'Reserved' },
  { value: 'UNAVAILABLE', ar: 'متوقفة', en: 'Unavailable' },
];

export const statusOption = (status: TableStatus) => TABLE_STATUSES.find(option => option.value === status)!;

export function tableStatus(table: RestaurantTable, occupancy: TableOccupancy | undefined): TableStatus {
  if (!table.isActive) return 'UNAVAILABLE';
  if (occupancy?.occupied) return 'OCCUPIED';
  if (occupancy?.reservation) return 'RESERVED';
  return 'AVAILABLE';
}
