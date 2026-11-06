import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  ArrowsDownUpIcon, CaretLeftIcon, CheckCircleIcon, ClipboardTextIcon, CoinsIcon, CookingPotIcon, PercentIcon, PhoneIcon, SealCheckIcon, ShoppingCartIcon, TrashIcon, TrendDownIcon, TruckIcon, WarningOctagonIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { StatCard } from '../../components/StatCard';
import { inventoryApi } from '../../lib/api/endpoints';
import { useLanguage, usePageTitle } from '../../lib/language';
import { PageBranchPicker, useBranchScope } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { dishLabel, inventoryKeys, MovementType, StockStatusBadge, useInventoryActions, useSourceLabel, useInventoryFormat, useStockBranch } from './shared';
import { formatInUnit, formatNumber, unitLabel } from './units';

/** The day's picture of one branch: value, what is running out, what to order, recent movements and dishes without a recipe. */
export function InventoryOverviewPage() {
  const { text } = useLanguage();
  usePageTitle('المخزون', 'Inventory');
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const { to } = useWorkspace();
  const sourceLabel = useSourceLabel();
  const page = useStockBranch();
  const scope = useBranchScope();
  const branchId = page.branchId;
  const enabled = Boolean(branchId);
  const stock = useQuery({ queryKey: inventoryKeys.stock(branchId), queryFn: () => inventoryApi.stock(branchId), enabled, placeholderData: keepPreviousData });
  const reorder = useQuery({ queryKey: inventoryKeys.report('reorder', { branchId }), queryFn: () => inventoryApi.reorder(branchId), enabled, placeholderData: keepPreviousData });
  const lowStock = useQuery({ queryKey: inventoryKeys.report('low-stock', { branchId, days: 7 }), queryFn: () => inventoryApi.lowStock(branchId, 7), enabled, placeholderData: keepPreviousData });
  const movementFilters = { branchId, page: 1, pageSize: 8 };
  const movements = useQuery({ queryKey: inventoryKeys.movements(movementFilters), queryFn: () => inventoryApi.movements(movementFilters), enabled, placeholderData: keepPreviousData });
  const costing = useQuery({ queryKey: inventoryKeys.costing(branchId), queryFn: () => inventoryApi.costing(branchId), enabled: enabled && actions.costs, placeholderData: keepPreviousData });
  const countFilters = { branchId, status: 'OPEN', page: 1, pageSize: 1 };
  const openCount = useQuery({ queryKey: inventoryKeys.counts(countFilters), queryFn: () => inventoryApi.counts(countFilters), enabled });
  const pendingFilters = { status: 'PENDING_APPROVAL', page: 1, pageSize: 20 };
  const pending = useQuery({ queryKey: inventoryKeys.counts(pendingFilters), queryFn: () => inventoryApi.counts(pendingFilters), enabled: actions.approve && actions.view });
  const rows = stock.data?.rows ?? [];
  const low = rows.filter(row => row.status === 'LOW').length;
  const out = rows.filter(row => row.status === 'OUT').length;
  const missing = costing.data?.rows.filter(row => !row.hasRecipe || row.incomplete) ?? [];
  const counting = openCount.data?.items[0];
  const stockPath = to('/inventory/stock');
  const branchName = branchId ? scope.nameOf(branchId) : null;
  const ready = Boolean(stock.data);
  const summary = !ready ? ' '
    : out + low === 0 ? text('كل الخامات متوفرة، ومفيش حاجة محتاجة تتطلب دلوقتي.', 'Everything is in stock and nothing needs ordering right now.')
      : text(`${out ? `${formatNumber(out, 'ar')} خامة خلصت` : ''}${out && low ? ' و' : ''}${low ? `${formatNumber(low, 'ar')} قربت تخلص` : ''}. راجعهم قبل الزحمة.`,
        `${out ? `${out} out of stock` : ''}${out && low ? ' and ' : ''}${low ? `${low} running low` : ''}. Check them before the rush.`);
  const withoutRecipe = costing.data ? costing.data.summary.sizes - costing.data.summary.withRecipe : 0;
  return <>
    <PageBranchPicker page={page} />
    <section className="inv-ov-head" aria-labelledby="inv-ov-title">
      <div className="inv-ov-intro">
        <h2 id="inv-ov-title">{branchName ? text('النهارده في ', 'Today at ') : text('النهارده', 'Today')}{branchName && <bdi>{branchName}</bdi>}</h2>
        <p className={out + low ? 'is-warning' : ''}>{summary}</p>
      </div>
      <div className="inv-ov-actions" role="group" aria-label={text('اختصارات', 'Quick actions')}>
        {actions.operate && <Link className="button button-primary" to={`${to('/inventory/purchases')}?new=1`} data-testid="quick-receive">
          <TruckIcon size={18} aria-hidden="true" />{text('استلم مشتريات', 'Receive a delivery')}</Link>}
        {actions.recordWaste && <Link className="button button-secondary" to={`${to('/inventory/waste')}?new=1`} data-testid="quick-waste">
          <TrashIcon size={18} aria-hidden="true" />{text('سجّل هالك', 'Record waste')}</Link>}
        {(actions.operate || (counting && actions.enterCounts)) && <Link className="button button-secondary" to={`${to('/inventory/counts')}${counting ? '' : '?new=1'}`} data-testid="quick-count"
          title={counting ? text(`اتعد ${formatNumber(counting.countedLines, 'ar')} من ${formatNumber(counting.lineCount, 'ar')}`, `${counting.countedLines} of ${counting.lineCount} counted`) : undefined}>
          <ClipboardTextIcon size={18} aria-hidden="true" />{counting ? text('كمّل الجرد', 'Continue the count') : text('ابدأ جرد', 'Start a count')}
          {counting && <span className="inv-ov-progress">{formatNumber(counting.countedLines, format.language)}/{formatNumber(counting.lineCount, format.language)}</span>}
        </Link>}
      </div>
    </section>

    {stock.isError && <ErrorPanel error={stock.error} onRetry={() => void stock.refetch()} />}
    {stock.isPending ? <div className="inv-stats" aria-hidden="true">{[0, 1, 2, 3].map(index => <Skeleton key={index} height={112} />)}</div> : stock.data && <div className="inv-stats" data-testid="overview-figures">
      {actions.costs && <StatCard to={stockPath} icon={CoinsIcon} tone="info" label={text('قيمة المخزون', 'Stock value')} value={format.money(stock.data.totalValue)}
        note={text('بتكلفة الشراء', 'At purchase cost')} testId="overview-value" />}
      <StatCard to={stockPath} icon={TrendDownIcon} tone={low ? 'warning' : 'success'} label={text('قربت تخلص', 'Running low')} value={formatNumber(low, format.language)}
        note={low ? text('تحت حد الطلب', 'Below the reorder point') : text('كله فوق حد الطلب', 'All above reorder point')} testId="overview-low" />
      <StatCard to={stockPath} icon={WarningOctagonIcon} tone={out ? 'danger' : 'success'} label={text('خلصت', 'Out of stock')} value={formatNumber(out, format.language)}
        note={stock.data.negativeItems ? text(`منها ${formatNumber(stock.data.negativeItems, 'ar')} بالسالب`, `${stock.data.negativeItems} below zero`) : out ? text('محتاجة تتطلب', 'Needs ordering') : text('مفيش حاجة خلصت', 'Nothing has run out')} />
      {actions.costs && costing.data && <StatCard to={to('/inventory/recipes')} icon={CookingPotIcon} tone={withoutRecipe ? 'guava' : 'success'} label={text('أطباق من غير وصفة', 'Dishes without a recipe')}
        value={formatNumber(withoutRecipe, format.language)} note={withoutRecipe ? text('مش بتخصم من المخزون', 'Not deducting stock') : text('كل الأطباق متسعّرة', 'Every dish is costed')} />}
      {actions.costs && costing.data && <StatCard to={`${to('/inventory/reports')}`} icon={PercentIcon} tone="muted" label={text('متوسط تكلفة الأكل', 'Average food cost')}
        value={format.percent(costing.data.summary.averageFoodCostPercent)} note={costing.data.summary.averageFoodCostPercent === null ? text('محتاج وصفات متسعّرة', 'Needs costed recipes') : text('من سعر البيع', 'Of the selling price')} />}
      {actions.approve && pending.data && <StatCard to={to('/inventory/counts')} icon={SealCheckIcon} tone={pending.data.total ? 'guava' : 'muted'} label={text('جرد مستني موافقتك', 'Counts to approve')}
        value={formatNumber(pending.data.total, format.language)} note={pending.data.total ? text('فرق أكبر من المسموح', 'Variance above the limit') : text('مفيش حاجة مستنياك', 'Nothing waiting for you')} />}
    </div>}

    <div className="inv-overview-grid">
      <section className="card inv-panel" aria-labelledby="ov-reorder">
        <PanelHead id="ov-reorder" icon={ShoppingCartIcon} title={text('محتاج تطلبه', 'Time to reorder')} count={reorder.data?.groups.reduce((sum, group) => sum + group.lines.length, 0)}
          link={{ to: `${to('/inventory/reports')}?view=reorder`, label: text('تقرير الطلب', 'Reorder report') }} />
        {reorder.isPending && <Skeleton height={120} />}
        {reorder.isError && <ErrorPanel error={reorder.error} onRetry={() => void reorder.refetch()} />}
        {reorder.data && reorder.data.groups.length === 0 && <Empty icon={CheckCircleIcon} title={text('مفيش حاجة تتطلب', 'Nothing to order')}
          text={text('كل الخامات فوق حد الطلب. هنقولك هنا أول ما حاجة تقرب تخلص.', 'Everything is above its reorder point. It shows here as soon as something runs low.')} />}
        {reorder.data && reorder.data.groups.length > 0 && <ul className="inv-reorder-groups">
          {reorder.data.groups.map(group => <li key={group.supplier?.id ?? 'none'} data-testid="overview-reorder-group">
            <div className="inv-reorder-supplier"><strong><bdi>{group.supplier?.name ?? text('من غير مورد مفضل', 'No preferred supplier')}</bdi></strong>
              {group.supplier?.phone && <a className="inv-phone" href={`tel:${group.supplier.phone}`}><PhoneIcon size={15} aria-hidden="true" /><span className="ltr">{group.supplier.phone}</span></a>}
              {actions.costs && group.estimatedCost !== null && <small className="muted">{text('تقريبًا', 'about')} {format.money(group.estimatedCost)}</small>}</div>
            <ul className="inv-mini-list">{group.lines.map(line => <li key={line.ingredientId}>
              <bdi>{format.name(line.nameAr, line.nameEn)}</bdi>
              <span className="muted">{format.qty(line.onHand, line.baseUnit)}</span>
              <strong>{line.suggestedUnits ? formatInUnit(line.suggestedUnits.quantity, unitLabel(line.suggestedUnits), format.language) : format.qty(line.suggestedQuantity, line.baseUnit)}</strong>
            </li>)}</ul>
          </li>)}
        </ul>}
      </section>
      <section className="card inv-panel" aria-labelledby="ov-low">
        <PanelHead id="ov-low" icon={TrendDownIcon} title={text('قرب يخلص أو خلص', 'Low or out')} count={lowStock.data?.rows.length}
          link={{ to: stockPath, label: text('كل المخزون', 'All stock') }} />
        {lowStock.isPending && <Skeleton height={120} />}
        {lowStock.isError && <ErrorPanel error={lowStock.error} onRetry={() => void lowStock.refetch()} />}
        {lowStock.data && lowStock.data.rows.length === 0 && <Empty icon={CheckCircleIcon} title={text('المخزون مطمّن', 'Stock looks healthy')}
          text={text('مفيش خامة قربت تخلص في الفرع ده.', 'Nothing is running low at this branch.')} />}
        {lowStock.data && lowStock.data.rows.length > 0 && <ul className="inv-mini-list" data-testid="overview-low-list">{lowStock.data.rows.map(row => <li key={row.ingredientId}>
          <bdi>{format.name(row.nameAr, row.nameEn)}</bdi><span className="muted">{format.qty(row.onHand, row.baseUnit)}</span><StockStatusBadge status={row.status} negative={row.onHand < 0} />
        </li>)}</ul>}
        {lowStock.data && lowStock.data.warnedOrders.length > 0 && <>
          <h3 className="inv-panel-sub">{text('طلبات اتقبلت والمخزون مش مكفّيها (آخر ٧ أيام)', 'Orders the stock could not cover (last 7 days)')}</h3>
          <ul className="inv-mini-list">{lowStock.data.warnedOrders.map(order => <li key={order.orderId}>
            <strong>{text(`طلب #${formatNumber(order.number, 'ar')}`, `Order #${order.number}`)}</strong>
            <span className="muted">{order.items.map(item => format.name(item.nameAr, item.nameEn)).join('، ')}</span>
            <small className="muted">{format.dateTime(order.placedAt)}</small>
          </li>)}</ul>
        </>}
      </section>
      <section className="card inv-panel" aria-labelledby="ov-moves">
        <PanelHead id="ov-moves" icon={ArrowsDownUpIcon} title={text('آخر حركة', 'Recent movements')}
          link={{ to: to('/inventory/movements'), label: text('السجل كله', 'Full ledger') }} />
        {movements.isPending && <Skeleton height={120} />}
        {movements.isError && <ErrorPanel error={movements.error} onRetry={() => void movements.refetch()} />}
        {movements.data && movements.data.items.length === 0 && <Empty icon={ArrowsDownUpIcon} tone="muted" title={text('مفيش حركة لسه', 'No movements yet')}
          text={text('أول ما تستلم مشتريات أو تسجّل هالك أو جرد، هتظهر هنا.', 'Deliveries, waste and counts show here as soon as you record them.')}
          action={actions.operate ? { to: `${to('/inventory/purchases')}?new=1`, label: text('سجّل أول مشتريات', 'Record a first delivery') } : undefined} />}
        {movements.data && movements.data.items.length > 0 && <ul className="inv-mini-list">{movements.data.items.map(movement => <li key={movement.id}>
          <bdi>{format.name(movement.ingredientNameAr, movement.ingredientNameEn)}</bdi>
          <span className="muted">{movement.source ? <bdi>{sourceLabel(movement.source)}</bdi> : <MovementType type={movement.type} />}</span>
          <strong className={`inv-signed ${movement.quantity < 0 ? 'is-out' : 'is-in'}`}>{format.qty(movement.quantity, movement.baseUnit, { signed: true })}</strong>
        </li>)}</ul>}
      </section>
      {actions.costs && <section className="card inv-panel" aria-labelledby="ov-recipes">
        <PanelHead id="ov-recipes" icon={CookingPotIcon} title={text('أطباق محتاجة وصفة', 'Dishes needing a recipe')} count={missing.length || undefined}
          link={{ to: to('/inventory/recipes'), label: text('الوصفات والتكلفة', 'Recipes & costing') }} />
        {costing.isPending && <Skeleton height={120} />}
        {costing.isError && <ErrorPanel error={costing.error} onRetry={() => void costing.refetch()} />}
        {costing.data && missing.length === 0 && <Empty icon={CheckCircleIcon} title={text('كل الأطباق ليها وصفة', 'Every dish has a recipe')}
          text={text('كل طبق ليه وصفة متسعّرة، فالمبيعات بتخصم من المخزون وتكلفة الأكل محسوبة.', 'Every dish has a costed recipe, so sales take stock out and food cost is known.')} />}
        {missing.length > 0 && <>
          <p className="inv-panel-lead">{text('الأطباق دي مش بتخصم من المخزون ومش معروف بتكلّفك كام. ابدأ بالأكتر مبيعًا.', 'These dishes do not take stock out and their cost is unknown. Start with your best sellers.')}</p>
          <ul className="inv-mini-list">{missing.slice(0, 8).map(row => <li key={row.variantId}>
            <bdi>{dishLabel(row, format.language)}</bdi>
            <span className={`badge ${row.hasRecipe ? 'badge-warning' : 'badge-guava'}`}>{row.hasRecipe ? text('ناقصة تكلفة', 'Incomplete') : text('من غير وصفة', 'No recipe')}</span>
            {actions.manage && <Link className="inv-row-action" to={`${to('/inventory/recipes')}?item=${row.itemId}&size=${row.variantId}`}>{row.hasRecipe ? text('كمّلها', 'Complete') : text('اكتب الوصفة', 'Add recipe')}</Link>}
          </li>)}</ul>
          {missing.length > 8 && <Link className="inv-panel-more" to={to('/inventory/recipes')}>{text(`و${formatNumber(missing.length - 8, 'ar')} أطباق تانية`, `and ${missing.length - 8} more`)}</Link>}
        </>}
      </section>}
    </div>
  </>;
}

function PanelHead({ id, icon: IconComponent, title, count, link }: { id: string; icon: Icon; title: string; count?: number; link: { to: string; label: string } }) {
  const { number } = useLanguage();
  return <header className="inv-panel-head">
    <h2 id={id}><span className="inv-panel-icon" aria-hidden="true"><IconComponent size={17} /></span>{title}{count ? <span className="inv-panel-count">{number(count)}</span> : null}</h2>
    <Link className="inv-panel-link" to={link.to}>{link.label}<CaretLeftIcon size={13} className="directional" aria-hidden="true" /></Link>
  </header>;
}

function Empty({ icon: IconComponent, title, text, tone = 'success', action }: { icon: Icon; title: string; text: string; tone?: 'success' | 'muted'; action?: { to: string; label: string } }) {
  return <div className={`inv-empty is-${tone}`}>
    <span className="inv-empty-icon" aria-hidden="true"><IconComponent size={22} weight="duotone" /></span>
    <div><strong>{title}</strong><p>{text}</p>{action && <Link className="inv-panel-link" to={action.to}>{action.label}</Link>}</div>
  </div>;
}
