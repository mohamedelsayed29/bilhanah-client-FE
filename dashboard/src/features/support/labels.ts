import {
  BuildingsIcon, CoinsIcon, CreditCardIcon, ForkKnifeIcon, type Icon, QrCodeIcon, QuestionIcon, ReceiptIcon, RocketLaunchIcon, StorefrontIcon, UserGearIcon, WrenchIcon,
} from '@phosphor-icons/react';
import type { SupportNotificationKind, SupportTopic, TicketPriority, TicketStatus } from '@bilhanah/contracts';

type Pair = [string, string];

/** Category icons by the name stored with each FAQ category. */
export const CATEGORY_ICONS: Record<string, Icon> = {
  rocket: RocketLaunchIcon, storefront: StorefrontIcon, 'fork-knife': ForkKnifeIcon, 'qr-code': QrCodeIcon, receipt: ReceiptIcon,
  coins: CoinsIcon, buildings: BuildingsIcon, 'credit-card': CreditCardIcon, 'user-gear': UserGearIcon, wrench: WrenchIcon,
};
export const categoryIcon = (name: string): Icon => CATEGORY_ICONS[name] ?? QuestionIcon;

export const TOPIC_LABELS: Record<SupportTopic, Pair> = {
  GETTING_STARTED: ['البداية', 'Getting started'],
  RESTAURANT_SETUP: ['إعداد المطعم', 'Restaurant setup'],
  MENU: ['المنيو', 'Menu'],
  QR_TABLES: ['أكواد QR والطاولات', 'QR codes & tables'],
  ORDERS: ['الطلبات', 'Orders'],
  PAYMENTS: ['المدفوعات', 'Payments'],
  BRANCHES: ['الفروع', 'Branches'],
  BILLING: ['الاشتراك والفواتير', 'Subscription & billing'],
  ACCOUNT: ['الحساب والصلاحيات', 'Account & permissions'],
  TROUBLESHOOTING: ['مشكلة فنية', 'Technical problem'],
};

export const STATUS_LABELS: Record<TicketStatus, Pair> = {
  OPEN: ['مفتوحة', 'Open'],
  IN_PROGRESS: ['بنشتغل عليها', 'In progress'],
  WAITING_FOR_CUSTOMER: ['مستنيين ردك', 'Waiting for you'],
  RESOLVED: ['اتحلّت', 'Resolved'],
  CLOSED: ['مقفولة', 'Closed'],
};

export const PRIORITY_LABELS: Record<TicketPriority, Pair> = {
  LOW: ['عادية مش مستعجلة', 'Low'],
  NORMAL: ['عادية', 'Normal'],
  HIGH: ['مهمة', 'High'],
  URGENT: ['عاجلة، الشغل واقف', 'Urgent: work is blocked'],
};

export const NOTIFICATION_LABELS: Partial<Record<SupportNotificationKind, Pair>> = {
  AGENT_REPLIED: ['فريق الدعم رد عليك', 'Support replied'],
  STATUS_CHANGED: ['حالة التذكرة اتغيرت', 'The ticket’s status changed'],
  TICKET_RESOLVED: ['التذكرة اتحلّت', 'The ticket was resolved'],
};

/** The dashboard page a ticket is about, from the current path (/manager/... included). */
export function moduleOf(pathname: string): string | undefined {
  const parts = pathname.split('/').filter(Boolean);
  const first = parts[0] === 'manager' ? parts[1] : parts[0];
  return first?.slice(0, 60) || undefined;
}

/** A sensible topic for a ticket opened from a page. */
export function topicOf(module: string | undefined): SupportTopic {
  switch (module) {
    case 'menu': return 'MENU';
    case 'tables': case 'qr-codes': return 'QR_TABLES';
    case 'orders': case 'kitchen': case 'service': return 'ORDERS';
    case 'cash': return 'PAYMENTS';
    case 'branches': return 'BRANCHES';
    case 'subscription': return 'BILLING';
    case 'staff': case 'account': return 'ACCOUNT';
    case 'settings': case 'branding': case 'hours': case 'ordering': return 'RESTAURANT_SETUP';
    default: return 'TROUBLESHOOTING';
  }
}
