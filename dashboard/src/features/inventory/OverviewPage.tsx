import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ClipboardTextIcon, CookingPotIcon, PhoneIcon, TrashIcon, TruckIcon } from '@phosphor-icons/react';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { inventoryApi } from '../../lib/api/endpoints';
import { useLanguage, usePageTitle } from '../../lib/language';
import { PageBranchPicker } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { Figure } from './controls';
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
  return <>
    <PageBranchPicker page={page} />
    <div className="inv-quick" role="group" aria-label={text('اختصارات', 'Quick actions')}>
      {actions.operate && <Link className="inv-quick-action" to={`${to('/inventory/purchases')}?new=1`} data-testid="quick-receive">
        <TruckIcon size={22} aria-hidden="true" /><span><strong>{text('استلم مشتريات', 'Receive a delivery')}</strong><small>{text('البضاعة وصلت؟ سجّلها ويدخل المخزون.', 'Goods arrived? Record them into stock.')}</small></span>
      </Link>}
      {actions.recordWaste && <Link className="inv-quick-action" to={`${to('/inventory/waste')}?new=1`} data-testid="quick-waste">
        <TrashIcon size={22} aria-hidden="true" /><span><strong>{text('سجّل هالك', 'Record waste')}</strong><small>{text('حاجة باظت أو وقعت أو اتقدمت ضيافة.', 'Something spoiled, dropped or was given away.')}</small></span>
      </Link>}
      {(actions.operate || (counting && actions.enterCounts)) && <Link className="inv-quick-action" to={`${to('/inventory/counts')}${counting ? '' : '?new=1'}`} data-testid="quick-count">
        <ClipboardTextIcon size={22} aria-hidden="true" /><span><strong>{counting ? text('كمّل الجرد', 'Continue the count') : text('ابدأ جرد', 'Start a count')}</strong>
          <small>{counting ? text(`اتعد ${formatNumber(counting.countedLines, 'ar')} من ${formatNumber(counting.lineCount, 'ar')}`, `${counting.countedLines} of ${counting.lineCount} counted`) : text('عدّ اللي على الرف وقارنه بالمتوقع.', 'Count what is on the shelf against what is expected.')}</small></span>
      </Link>}
    </div>
    {stock.isError && <ErrorPanel error={stock.error} onRetry={() => void stock.refetch()} />}
    {stock.isPending ? <Skeleton height={80} /> : stock.data && <div className="att-kpis is-compact" data-testid="overview-figures">
      {actions.costs && <Figure label={text('قيمة المخزون', 'Stock value')} value={format.money(stock.data.totalValue)} tone="info" testId="overview-value" />}
      <Figure label={text('قربت تخلص', 'Running low')} value={formatNumber(low, format.language)} tone={low ? 'warning' : 'success'} testId="overview-low" />
      <Figure label={text('خلصت', 'Out of stock')} value={formatNumber(out, format.language)} tone={out ? 'danger' : 'success'}
        hint={stock.data.negativeItems ? text(`منها ${formatNumber(stock.data.negativeItems, 'ar')} بالسالب`, `${stock.data.negativeItems} below zero`) : undefined} />
      {actions.costs && costing.data && <Figure label={text('أطباق من غير وصفة', 'Dishes without a recipe')} value={formatNumber(costing.data.summary.sizes - costing.data.summary.withRecipe, format.language)}
        tone={costing.data.summary.sizes - costing.data.summary.withRecipe ? 'guava' : 'success'} />}
      {actions.costs && costing.data && <Figure label={text('متوسط تكلفة الأكل', 'Average food cost')} value={format.percent(costing.data.summary.averageFoodCostPercent)} />}
      {actions.approve && pending.data && <Figure label={text('جرد مستني موافقتك', 'Counts to approve')} value={formatNumber(pending.data.total, format.language)} tone={pending.data.total ? 'guava' : 'muted'} />}
    </div>}
    <div className="inv-overview-grid">
      <section className="card inv-panel" aria-labelledby="ov-reorder">
        <header className="inv-panel-head"><h2 id="ov-reorder">{text('محتاج تطلبه', 'Time to reorder')}</h2>
          <Link className="link-action" to={`${to('/inventory/reports')}?view=reorder`}>{text('تقرير الطلب', 'Reorder report')}</Link></header>
        {reorder.isPending && <Skeleton height={120} />}
        {reorder.isError && <ErrorPanel error={reorder.error} onRetry={() => void reorder.refetch()} />}
        {reorder.data && reorder.data.groups.length === 0 && <p className="muted inv-panel-empty">{text('كل حاجة فوق حد الطلب.', 'Everything is above its reorder point.')}</p>}
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
        <header className="inv-panel-head"><h2 id="ov-low">{text('قرب يخلص أو خلص', 'Low or out')}</h2>
          <Link className="link-action" to={to('/inventory/stock')}>{text('كل المخزون', 'All stock')}</Link></header>
        {lowStock.isPending && <Skeleton height={120} />}
        {lowStock.isError && <ErrorPanel error={lowStock.error} onRetry={() => void lowStock.refetch()} />}
        {lowStock.data && lowStock.data.rows.length === 0 && <p className="muted inv-panel-empty">{text('مفيش حاجة قربت تخلص.', 'Nothing is running low.')}</p>}
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
        <header className="inv-panel-head"><h2 id="ov-moves">{text('آخر حركة', 'Recent movements')}</h2>
          <Link className="link-action" to={to('/inventory/movements')}>{text('السجل كله', 'Full ledger')}</Link></header>
        {movements.isPending && <Skeleton height={120} />}
        {movements.isError && <ErrorPanel error={movements.error} onRetry={() => void movements.refetch()} />}
        {movements.data && movements.data.items.length === 0 && <p className="muted inv-panel-empty">{text('مفيش حركة لسه.', 'No movements yet.')}</p>}
        {movements.data && movements.data.items.length > 0 && <ul className="inv-mini-list">{movements.data.items.map(movement => <li key={movement.id}>
          <bdi>{format.name(movement.ingredientNameAr, movement.ingredientNameEn)}</bdi>
          <span className="muted">{movement.source ? <bdi>{sourceLabel(movement.source)}</bdi> : <MovementType type={movement.type} />}</span>
          <strong className={`inv-signed ${movement.quantity < 0 ? 'is-out' : 'is-in'}`}>{format.qty(movement.quantity, movement.baseUnit, { signed: true })}</strong>
        </li>)}</ul>}
      </section>
      {actions.costs && <section className="card inv-panel" aria-labelledby="ov-recipes">
        <header className="inv-panel-head"><h2 id="ov-recipes">{text('أطباق محتاجة وصفة', 'Dishes needing a recipe')}</h2>
          <Link className="link-action" to={to('/inventory/recipes')}>{text('الوصفات والتكلفة', 'Recipes & costing')}</Link></header>
        {costing.isPending && <Skeleton height={120} />}
        {costing.isError && <ErrorPanel error={costing.error} onRetry={() => void costing.refetch()} />}
        {costing.data && missing.length === 0 && <p className="muted inv-panel-empty">
          <CookingPotIcon size={16} aria-hidden="true" /> {text('كل الأطباق ليها وصفة متسعّرة، فالمبيعات بتخصم من المخزون.', 'Every dish has a costed recipe, so sales take stock out.')}</p>}
        {missing.length > 0 && <ul className="inv-mini-list">{missing.slice(0, 8).map(row => <li key={row.variantId}>
          <bdi>{dishLabel(row, format.language)}</bdi>
          <span className={`badge ${row.hasRecipe ? 'badge-warning' : 'badge-guava'}`}>{row.hasRecipe ? text('ناقصة تكلفة', 'Incomplete') : text('من غير وصفة', 'No recipe')}</span>
          {actions.manage && <Link className="link-action" to={`${to('/inventory/recipes')}?item=${row.itemId}&size=${row.variantId}`}>{text('اكتبها', 'Add')}</Link>}
        </li>)}</ul>}
      </section>}
    </div>
  </>;
}
