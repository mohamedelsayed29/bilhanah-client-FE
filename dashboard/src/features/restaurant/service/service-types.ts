import { BellRingingIcon, BroomIcon, DropIcon, NoteIcon, ReceiptIcon, ScrollIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { ServiceRequestStatus, ServiceRequestType } from '@bilhanah/contracts';

/** What each request asks for, as the staff read it. */
export const SERVICE_TYPES: Record<ServiceRequestType, { ar: string; en: string; icon: Icon }> = {
  CALL_WAITER: { ar: 'نادى على الويتر', en: 'Called a waiter', icon: BellRingingIcon },
  REQUEST_BILL: { ar: 'عايز الحساب', en: 'Wants the bill', icon: ReceiptIcon },
  REQUEST_WATER: { ar: 'عايز مية', en: 'Wants water', icon: DropIcon },
  REQUEST_NAPKINS: { ar: 'عايز مناديل', en: 'Wants napkins', icon: ScrollIcon },
  REQUEST_CLEANING: { ar: 'عايز تنضيف الترابيزة', en: 'Wants the table cleaned', icon: BroomIcon },
  CUSTOM: { ar: 'طلب خاص', en: 'Custom request', icon: NoteIcon },
};

export const SERVICE_STATUSES: Record<ServiceRequestStatus, { ar: string; en: string }> = {
  PENDING: { ar: 'جديد', en: 'New' },
  ACKNOWLEDGED: { ar: 'اتشاف', en: 'Acknowledged' },
  IN_PROGRESS: { ar: 'جاري', en: 'In progress' },
  COMPLETED: { ar: 'خلص', en: 'Completed' },
  CANCELLED: { ar: 'اتلغى', en: 'Cancelled' },
};
