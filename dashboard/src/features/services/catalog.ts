import {
  CashRegisterIcon, ChartBarIcon, ForkKnifeIcon, HeadsetIcon, type Icon, IdentificationCardIcon, QrCodeIcon, ReceiptIcon, StarHalfIcon, StorefrontIcon, UserCheckIcon, UsersThreeIcon, WarehouseIcon,
} from '@phosphor-icons/react';
import type { CoreServiceKey, MenuSource, RestaurantServiceKey } from '@bilhanah/contracts';

type Label = [string, string];

/** How each service is presented: what it is, in one line, and what it brings. */
export const SERVICE_INFO: Record<RestaurantServiceKey, { icon: Icon; summary: Label; includes: Label[]; path: string }> = {
  DIGITAL_MENU: {
    icon: QrCodeIcon, path: '/menu',
    summary: ['منيو أونلاين بلينك وكود QR لكل طاولة، تعدّله في ثواني.', 'An online menu with a link and a QR code per table, edited in seconds.'],
    includes: [['المنيو والأصناف والصور', 'Menu, dishes and photos'], ['أكواد QR للطاولات', 'Table QR codes'], ['لغات المنيو والترشيحات', 'Menu languages and suggestions']],
  },
  QR_ORDERING: {
    icon: ReceiptIcon, path: '/orders',
    summary: ['الزبون يطلب من موبايله، والطلب يوصلك على لوحة الطلبات لحظتها.', 'Diners order from their phones; orders reach your board instantly.'],
    includes: [['لوحة الطلبات وسجلها', 'Order board and history'], ['طلبات الخدمة (ويتر، حساب)', 'Service requests (waiter, bill)'], ['شاشة المطبخ', 'Kitchen display']],
  },
  REVIEWS: {
    icon: StarHalfIcon, path: '/reviews',
    summary: ['اعرف رأي الزباين في كل زيارة وطبق، ورد عليهم وتابع اللي مش مبسوط.', 'Hear what diners think of each visit and dish, reply and follow up.'],
    includes: [['صندوق التقييمات والردود', 'Reviews inbox and replies'], ['أرقام وتقارير التقييم', 'Rating insights'], ['دعوة لتقييم جوجل', 'Google review invitations']],
  },
  INVENTORY: {
    icon: WarehouseIcon, path: '/inventory',
    summary: ['تابع الخامات والمشتريات والهالك والجرد، واعرف تكلفة كل طبق.', 'Track stock, purchases, waste and counts, and the cost of each dish.'],
    includes: [['المخزون لكل فرع', 'Stock per branch'], ['الوصفات والتكلفة', 'Recipes and costing'], ['الموردين والجرد', 'Suppliers and counts']],
  },
  CASH_DRAWER: {
    icon: CashRegisterIcon, path: '/cash',
    summary: ['ورديات الكاشير والفلوس اللي دخلت وخرجت، والفرق في آخر اليوم.', 'Cashier shifts, cash in and out, and the difference at closing.'],
    includes: [['فتح وقفل الوردية', 'Opening and closing shifts'], ['المصروفات والتسويات', 'Expenses and corrections'], ['تقارير الخزنة', 'Cash reports']],
  },
  ATTENDANCE: {
    icon: UserCheckIcon, path: '/attendance',
    summary: ['حضور وانصراف الموظفين بكود أو QR، والتأخير والساعات الإضافية.', 'Staff check in and out with a PIN or QR; lateness and overtime.'],
    includes: [['شاشة حضور للفرع', 'A check-in screen per branch'], ['الورديات والسجلات', 'Shifts and records'], ['تقارير الحضور', 'Attendance reports']],
  },
};

export const CORE_INFO: Record<CoreServiceKey, { icon: Icon }> = {
  PROFILE: { icon: StorefrontIcon },
  BRANCHES: { icon: ForkKnifeIcon },
  TEAM: { icon: UsersThreeIcon },
  REPORTS: { icon: ChartBarIcon },
  SUPPORT: { icon: HeadsetIcon },
};

export const MENU_SOURCE_INFO: Record<MenuSource, { icon: Icon; title: Label; help: Label }> = {
  BILHANAH: {
    icon: QrCodeIcon,
    title: ['عايز منيو بالهنا الرقمي', 'I want Bilhanah’s digital menu'],
    help: ['نجهزلك منيو بلينك وكود QR، وتقدر تشغّل الطلب من الموبايل.', 'We set up a menu with a link and QR codes, and you can turn on ordering.'],
  },
  EXTERNAL: {
    icon: IdentificationCardIcon,
    title: ['عندي منيو QR بالفعل', 'I already have a QR menu'],
    help: ['كمّل بالمنيو بتاعك، واستخدم باقي خدمات بالهنا.', 'Keep your own menu and use the rest of Bilhanah.'],
  },
  NONE: {
    icon: StorefrontIcon,
    title: ['مش محتاج منيو QR', 'I don’t need a QR menu'],
    help: ['استخدم لوحة التحكم للتقارير والفروع والموظفين وغيرها.', 'Use the dashboard for reports, branches, staff and more.'],
  },
};
