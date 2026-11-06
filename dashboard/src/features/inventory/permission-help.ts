import type { Permission } from '@bilhanah/contracts';

/** What each inventory permission lets someone do, in one plain sentence (the staff page and inventory settings). */
export const INVENTORY_PERMISSION_HELP: Record<Extract<Permission, `inventory.${string}`>, [ar: string, en: string]> = {
  'inventory.view': ['يشوف المخزون والحركة والخامات والوصفات والموردين والمشتريات والجرد، بالكميات من غير تكاليف.', 'Sees stock, movements, ingredients, recipes, suppliers, deliveries and counts, in quantities without costs.'],
  'inventory.waste': ['يسجل الهالك ويدخل الكميات المعدودة في جرد مفتوح، من الموبايل في المطبخ.', 'Records waste and enters counted quantities on an open count, from a phone in the kitchen.'],
  'inventory.operate': ['يستلم المشتريات ويلغيها، يبدأ الجرد ويرحّله، ويحوّل مخزون من فرعه.', 'Receives and voids deliveries, starts and posts counts, and transfers stock out of their branch.'],
  'inventory.manage': ['يدير الخامات ووحداتها والوصفات والموردين وحدود الطلب وإعدادات المخزون.', 'Manages ingredients and their units, recipes, suppliers, reorder levels and inventory settings.'],
  'inventory.costs': ['يشوف تكلفة الخامات وقيمة المخزون وأسعار الشراء وتكلفة الأكل وهندسة المنيو.', 'Sees ingredient costs, stock value, purchase prices, food cost and menu engineering.'],
  'inventory.approve': ['يوافق على الجرد اللي فرقه أكبر من المسموح (لو الإعدادات طالبة موافقة) أو يرجّعه.', 'Approves or sends back counts whose difference is above the threshold (when the settings ask for approval).'],
};

export const isInventoryPermission = (permission: Permission): permission is keyof typeof INVENTORY_PERMISSION_HELP => permission.startsWith('inventory.');
