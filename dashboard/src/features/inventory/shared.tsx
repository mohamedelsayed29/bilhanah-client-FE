import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet } from 'react-router';
import {
  ArrowsLeftRightIcon, BookOpenTextIcon, ChartLineUpIcon, ClipboardTextIcon, CookingPotIcon, GearSixIcon, ListMagnifyingGlassIcon,
  PackageIcon, SquaresFourIcon, TrashIcon, TruckIcon, UsersThreeIcon, WarehouseIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import {
  INVENTORY_ERROR_CODES, PURCHASE_STATUS_LABELS, STOCK_COUNT_STATUS_LABELS, STOCK_MOVEMENT_TYPE_LABELS, STOCK_STATUS_LABELS,
  type BaseUnit, type InventoryDish, type PurchaseStatus, type StockMovement, type StockCountStatus, type StockMovementType, type StockStatus,
} from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { isApiError } from '../../lib/api';
import { inventoryApi } from '../../lib/api/endpoints';
import { formatPrice } from '../../lib/format';
import { useLanguage } from '../../lib/language';
import { useBranchScope, usePageBranch } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { inventoryActions, type InventoryTabKey, visibleInventoryTabs } from './access';
import { costPerDisplayUnit, formatPercent, formatQuantity } from './units';

export const inventoryKeys = {
  all: ['inventory'] as const,
  settings: ['inventory', 'settings'] as const,
  ingredients: (branchId: string | null, includeInactive = false) => ['inventory', 'ingredients', branchId, includeInactive] as const,
  stock: (branchId: string | null) => ['inventory', 'stock', branchId] as const,
  costing: (branchId: string | null) => ['inventory', 'costing', branchId] as const,
  dishes: (branchId: string | null) => ['inventory', 'dishes', branchId] as const,
  destinations: (branchId: string | null) => ['inventory', 'transfer-destinations', branchId] as const,
  recipe: (variantId: string, branchId: string | null) => ['inventory', 'recipe', variantId, branchId] as const,
  suppliers: ['inventory', 'suppliers'] as const,
  movements: (filters: object) => ['inventory', 'movements', filters] as const,
  purchases: (filters: object) => ['inventory', 'purchases', filters] as const,
  purchase: (id: string) => ['inventory', 'purchase', id] as const,
  waste: (filters: object) => ['inventory', 'waste', filters] as const,
  counts: (filters: object) => ['inventory', 'counts', filters] as const,
  count: (id: string) => ['inventory', 'count', id] as const,
  transfers: (filters: object) => ['inventory', 'transfers', filters] as const,
  report: (name: string, params: object) => ['inventory', 'report', name, params] as const,
};

/** The restaurant's inventory settings (every inventory permission may read them; they carry the waste reasons). */
export function useInventorySettings() {
  return useQuery({
    queryKey: inventoryKeys.settings,
    queryFn: inventoryApi.settings,
    staleTime: 60_000,
    retry: (count, error) => !isApiError(error, INVENTORY_ERROR_CODES.UNAVAILABLE) && count < 2,
  });
}

/** What the viewer may do here (transfers need a branch to send to). */
export function useInventoryActions() {
  const { can } = useWorkspace();
  const scope = useBranchScope();
  return useMemo(() => inventoryActions(can, { branchCount: scope.locked ? 2 : scope.choices.length }), [can, scope.locked, scope.choices.length]);
}

/** Lists across branches: the selected branch, or every branch the viewer may see (null). */
export function useListBranch(): string | null {
  const scope = useBranchScope();
  return scope.selected === 'all' ? null : scope.selected;
}

/** Pages about one branch's stock: the selected branch, or one picked on the page. */
export const useStockBranch = usePageBranch;

export type Label = [ar: string, en: string];

/** Quantities, money and dates as the interface language writes them. */
export function useInventoryFormat() {
  const { language, text } = useLanguage();
  return useMemo(() => {
    const locale = language === 'ar' ? 'ar-EG' : 'en-GB';
    return {
      language,
      qty: (base: number | null | undefined, unit: BaseUnit | null | undefined, options?: { signed?: boolean }) =>
        (base === null || base === undefined || !unit ? '—' : formatQuantity(base, unit, language, options)),
      money: (piastres: number | null | undefined) => (piastres === null || piastres === undefined ? '—' : formatPrice(piastres, language)),
      signedMoney: (piastres: number | null | undefined) => (piastres === null || piastres === undefined ? '—' : `${piastres > 0 ? '+' : piastres < 0 ? '−' : ''}${formatPrice(Math.abs(piastres), language)}`),
      /** Piastres per base unit, shown per kilo, litre or piece. */
      unitCost: (perBase: number | null | undefined, unit: BaseUnit) => {
        if (perBase === null || perBase === undefined) return '—';
        const shown = costPerDisplayUnit(perBase, unit);
        return `${formatPrice(shown.piastres, language)} / ${text(...shown.label)}`;
      },
      percent: (value: number | null | undefined) => formatPercent(value, language),
      date: (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : '—'),
      dateTime: (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—'),
      name: (nameAr: string | null, nameEn: string | null | undefined) => (language === 'en' ? nameEn || nameAr || '' : nameAr || nameEn || ''),
      label: (label: Label) => text(...label),
    };
  }, [language, text]);
}

/** Today in the browser's calendar, YYYY-MM-DD. */
export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const STOCK_TONES: Record<StockStatus, string> = { OK: 'badge-success', LOW: 'badge-warning', OUT: 'badge-danger' };
export function StockStatusBadge({ status, negative = false }: { status: StockStatus; negative?: boolean }) {
  const { text } = useLanguage();
  return <span className={`badge ${STOCK_TONES[status]}`} data-status={status}>
    {negative ? text('بالسالب', 'Below zero') : text(...STOCK_STATUS_LABELS[status])}
  </span>;
}

const PURCHASE_TONES: Record<PurchaseStatus, string> = { DRAFT: 'badge-muted', RECEIVED: 'badge-success', VOID: 'badge-danger' };
export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const { text } = useLanguage();
  return <span className={`badge ${PURCHASE_TONES[status]}`} data-status={status}>{text(...PURCHASE_STATUS_LABELS[status])}</span>;
}

const COUNT_TONES: Record<StockCountStatus, string> = { OPEN: 'badge-info', PENDING_APPROVAL: 'badge-guava', POSTED: 'badge-success', CANCELLED: 'badge-muted' };
export function CountStatusBadge({ status }: { status: StockCountStatus }) {
  const { text } = useLanguage();
  return <span className={`badge ${COUNT_TONES[status]}`} data-status={status}>{text(...STOCK_COUNT_STATUS_LABELS[status])}</span>;
}

export function MovementType({ type }: { type: StockMovementType }) {
  const { text } = useLanguage();
  return <>{text(...STOCK_MOVEMENT_TYPE_LABELS[type])}</>;
}

/** The document behind a movement, in words: "Order #12", the waste reason's name, the invoice number. */
export function useSourceLabel() {
  const { text, language } = useLanguage();
  const settings = useInventorySettings();
  return (source: StockMovement['source']): string | null => {
    if (!source) return null;
    if (source.kind === 'WASTE') {
      const reason = settings.data?.wasteReasons.find(entry => entry.code === source.label);
      return `${text('هالك', 'Waste')}${reason ? `: ${language === 'en' ? reason.nameEn ?? reason.nameAr : reason.nameAr}` : ''}`;
    }
    if (source.kind === 'ORDER') return `${text('طلب', 'Order')} ${source.label ?? ''}`.trim();
    if (source.kind === 'PURCHASE') return source.label ? `${text('فاتورة', 'Invoice')} ${source.label}` : text('استلام', 'Delivery');
    if (source.kind === 'COUNT') return text('جرد', 'Count');
    return source.label ?? text('تحويل', 'Transfer');
  };
}

/** A dish size as one line: "Koshary · Large". */
export function dishLabel(row: { itemNameAr: string; itemNameEn: string | null; variantNameAr: string | null; variantNameEn: string | null }, language: 'ar' | 'en'): string {
  const item = language === 'en' ? row.itemNameEn || row.itemNameAr : row.itemNameAr;
  const size = language === 'en' ? row.variantNameEn || row.variantNameAr : row.variantNameAr || row.variantNameEn;
  return size ? `${item} · ${size}` : item;
}

export type DishSize = InventoryDish;

/**
 * Every dish size of the menu with its recipe's ingredients (no costs), for recipes and whole-dish
 * waste: GET /inventory/dishes, open to inventory.view and inventory.waste. Null while unknown.
 */
export function useDishSizes(branchId: string | null) {
  const { can } = useWorkspace();
  const allowed = can('inventory.view') || can('inventory.waste');
  const dishes = useQuery({ queryKey: inventoryKeys.dishes(branchId), queryFn: () => inventoryApi.dishes(branchId), enabled: allowed && Boolean(branchId), placeholderData: keepPreviousData });
  return { sizes: dishes.data?.rows ?? null, allowed, pending: allowed && Boolean(branchId) && dishes.isPending, error: dishes.error, retry: () => void dishes.refetch() };
}

const TAB_PRESENTATION: Record<InventoryTabKey, { icon: Icon; label: Label; end?: boolean }> = {
  overview: { icon: SquaresFourIcon, label: ['نظرة عامة', 'Overview'], end: true },
  stock: { icon: WarehouseIcon, label: ['المخزون', 'Stock'] },
  counts: { icon: ClipboardTextIcon, label: ['الجرد', 'Counts'] },
  waste: { icon: TrashIcon, label: ['الهالك', 'Waste'] },
  purchases: { icon: TruckIcon, label: ['المشتريات', 'Purchases'] },
  recipes: { icon: CookingPotIcon, label: ['الوصفات والتكلفة', 'Recipes & costing'] },
  ingredients: { icon: PackageIcon, label: ['الخامات', 'Ingredients'] },
  transfers: { icon: ArrowsLeftRightIcon, label: ['التحويلات', 'Transfers'] },
  movements: { icon: ListMagnifyingGlassIcon, label: ['سجل الحركة', 'Movements'] },
  suppliers: { icon: UsersThreeIcon, label: ['الموردين', 'Suppliers'] },
  reports: { icon: ChartLineUpIcon, label: ['التقارير', 'Reports'] },
  settings: { icon: GearSixIcon, label: ['الإعدادات', 'Settings'] },
};

/**
 * The inventory section: one header, its pages as tabs (those the viewer may open), and the
 * plan check. Owners under /inventory, staff under /manager/inventory, kitchen screens under
 * /kitchen/inventory.
 */
export function InventoryLayout() {
  const { text } = useLanguage();
  const { can, to } = useWorkspace();
  const scope = useBranchScope();
  const settings = useInventorySettings();
  const tabs = visibleInventoryTabs(can, { branchCount: scope.locked ? 2 : scope.choices.length });
  const unavailable = settings.isError && isApiError(settings.error, INVENTORY_ERROR_CODES.UNAVAILABLE);
  return <div className="page inv-page">
    <PageHeader title={text('المخزون والتكاليف', 'Inventory & costs')}
      description={text('المخزون في كل فرع، المشتريات والهالك والجرد، والوصفات وتكلفة كل طبق عليك.', 'Stock at every branch, deliveries, waste and counts, and the recipes behind what each dish costs you.')} />
    {unavailable ? <section className="card"><div className="empty-state" data-testid="inventory-unavailable">
      <span className="empty-state-icon" aria-hidden="true"><WarehouseIcon size={30} /></span>
      <h2>{text('المخزون مش ضمن باقتك', 'Inventory is not part of your plan')}</h2>
      <p>{text('المخزون والوصفات والتكاليف متاحين في باقة «منيو وطلبات» و«التجربة الكاملة». بياناتك محفوظة لو رجعت لهم.', 'Inventory, recipes and costs come with the Menu & Orders and Full Experience plans. Your data is kept if you come back to them.')}</p>
      {can('billing.manage') && <Link className="button button-primary" to={to('/subscription')}>{text('شوف الباقات', 'See the plans')}</Link>}
    </div></section> : <>
      <nav className="att-tabs inv-tabs" aria-label={text('أقسام المخزون', 'Inventory sections')}>
        {tabs.map(tab => {
          const meta = TAB_PRESENTATION[tab.key];
          return <NavLink key={tab.key} to={to(tab.path)} end={meta.end} className="att-tab" data-testid={`inv-tab-${tab.key}`}>
            <meta.icon size={18} weight="bold" aria-hidden="true" />{text(...meta.label)}
          </NavLink>;
        })}
      </nav>
      {settings.isError && !unavailable && <ErrorPanel error={settings.error} onRetry={() => void settings.refetch()} />}
      {settings.isPending && <Skeleton height={48} />}
      {settings.data && !settings.data.enabled && <Alert kind="info" live={false} title={text('الطلبات مش بتخصم من المخزون لسه', 'Orders do not deduct stock yet')}
        actions={can('inventory.manage') ? <Link className="link-action" to={to('/inventory/settings')}>{text('شغّلها من الإعدادات', 'Turn it on in the settings')}</Link> : undefined}>
        {text('المشتريات والهالك والجرد بيشتغلوا عادي، بس المبيعات مش بتنزل من المخزون والأصناف مش بتخلص لوحدها.', 'Deliveries, waste and counts work as usual, but sales do not take stock out and dishes are not marked sold out automatically.')}
      </Alert>}
      <Outlet />
    </>}
  </div>;
}

/** Shown where a figure needs inventory.costs, instead of a zero. */
export function CostsHidden() {
  const { text } = useLanguage();
  return <span className="muted inv-costs-hidden" title={text('محتاج صلاحية التكاليف', 'Needs the costs permission')}>{text('مخفي', 'Hidden')}</span>;
}

export function BookIcon() {
  return <BookOpenTextIcon size={30} />;
}
