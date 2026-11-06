import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { ChartPieIcon, PhoneIcon, TruckIcon } from '@phosphor-icons/react';
import { MENU_ENGINEERING_CLASS_LABELS, type FoodCostRow, type MenuEngineeringClass } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { BarList } from '../../components/charts/BarList';
import { Button } from '../../components/Button';
import { CompactMeta } from '../../components/CompactMeta';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { inventoryApi } from '../../lib/api/endpoints';
import { useLanguage, usePageTitle } from '../../lib/language';
import { PageBranchPicker } from '../branches/BranchScope';
import { useWorkspace } from '../branches/workspace';
import { Chips, Figure } from './controls';
import { CLASS_PRESENTATION, engineeringSummary, groupByClass, MATRIX_LAYOUT, sortEngineering, type EngineeringSort } from './menu-engineering';
import type { PurchasePrefill } from './PurchasesPage';
import { inventoryKeys, shiftDay, today, useInventoryActions, useInventoryFormat, useListBranch, useStockBranch } from './shared';
import { formatInUnit, formatNumber, unitLabel } from './units';

type View = 'reorder' | 'valuation' | 'food-cost' | 'engineering';

/** Reports: what to order (by supplier), stock value by category, food cost for a period, and the menu engineering matrix. */
export function InventoryReportsPage() {
  const { text } = useLanguage();
  usePageTitle('تقارير المخزون', 'Inventory reports');
  const actions = useInventoryActions();
  const [params, setParams] = useSearchParams();
  const views: { value: View; label: string }[] = [
    ...(actions.costs ? [{ value: 'food-cost' as const, label: text('تكلفة الأكل', 'Food cost') }, { value: 'engineering' as const, label: text('هندسة المنيو', 'Menu engineering') }, { value: 'valuation' as const, label: text('قيمة المخزون', 'Stock value') }] : []),
    ...(actions.view ? [{ value: 'reorder' as const, label: text('محتاج تطلبه', 'Reorder') }] : []),
  ];
  const asked = params.get('view') as View | null;
  const view = views.find(entry => entry.value === asked)?.value ?? views[0]?.value ?? 'reorder';
  return <>
    <Chips value={view} onChange={value => setParams(current => { const next = new URLSearchParams(current); next.set('view', value); return next; }, { replace: true })} label={text('التقرير', 'Report')} options={views} />
    {view === 'reorder' && <ReorderReport />}
    {view === 'valuation' && <ValuationReport />}
    {view === 'food-cost' && <FoodCostReport />}
    {view === 'engineering' && <EngineeringReport />}
  </>;
}

function ReorderReport() {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const { to } = useWorkspace();
  const navigate = useNavigate();
  const page = useStockBranch();
  const branchId = page.branchId;
  const report = useQuery({ queryKey: inventoryKeys.report('reorder', { branchId }), queryFn: () => inventoryApi.reorder(branchId), enabled: Boolean(branchId), placeholderData: keepPreviousData });
  const order = (group: NonNullable<typeof report.data>['groups'][number]) => {
    const prefill: PurchasePrefill = {
      supplierId: group.supplier?.id ?? null, branchId,
      lines: group.lines.map(line => ({ ingredientId: line.ingredientId, unitId: line.suggestedUnits?.unitId ?? null, quantity: line.suggestedUnits?.quantity ?? line.suggestedQuantity })),
    };
    void navigate(`${to('/inventory/purchases')}?new=1`, { state: { prefill } });
  };
  return <>
    <PageBranchPicker page={page} />
    <p className="inv-note">{text('الخامات اللي وصلت لحد الطلب أو أقل، والكمية المقترحة عشان توصل للمستوى المطلوب، متقسمة حسب المورد المفضل.', 'Ingredients at or below their reorder point, with the quantity that brings them back to par, grouped by preferred supplier.')}</p>
    {report.isError && <ErrorPanel error={report.error} onRetry={() => void report.refetch()} />}
    {report.isPending && <Skeleton height={200} />}
    {report.data?.groups.length === 0 && <section className="card"><div className="empty-state"><span className="empty-state-icon" aria-hidden="true"><TruckIcon size={30} /></span>
      <h2>{text('مفيش حاجة محتاج تطلبها', 'Nothing to reorder')}</h2><p>{text('كل الخامات فوق حد الطلب في الفرع ده.', 'Every ingredient is above its reorder point at this branch.')}</p></div></section>}
    {report.data?.groups.map(group => <section key={group.supplier?.id ?? 'none'} className="card list-card" aria-label={group.supplier?.name ?? text('من غير مورد', 'No supplier')} data-testid="reorder-group">
      <header className="inv-panel-head is-padded">
        <div><h2><bdi>{group.supplier?.name ?? text('من غير مورد مفضل', 'No preferred supplier')}</bdi></h2>
          {group.supplier?.phone && <a className="inv-phone" href={`tel:${group.supplier.phone}`}><PhoneIcon size={15} aria-hidden="true" /><span className="ltr">{group.supplier.phone}</span></a>}</div>
        <div className="cash-actions">{actions.costs && group.estimatedCost !== null && <span className="muted">{text('تقريبًا', 'About')} <strong>{format.money(group.estimatedCost)}</strong></span>}
          {actions.operate && <Button small variant="secondary" onClick={() => order(group)} icon={<TruckIcon size={16} aria-hidden="true" />}>{text('سجّل استلامهم', 'Record their delivery')}</Button>}</div>
      </header>
      <div className="table-scroll"><table className="data-table inv-table">
        <thead><tr><th scope="col">{text('الخامة', 'Ingredient')}</th><th scope="col">{text('الموجود', 'On hand')}</th><th scope="col">{text('حد الطلب', 'Reorder at')}</th><th scope="col">{text('المستوى المطلوب', 'Par')}</th>
          <th scope="col">{text('اطلب', 'Order')}</th>{actions.costs && <th scope="col">{text('التكلفة التقريبية', 'Estimated cost')}</th>}</tr></thead>
        <tbody>{group.lines.map(line => <tr key={line.ingredientId}>
          <td className="cell-primary"><bdi>{format.name(line.nameAr, line.nameEn)}</bdi></td>
          <td className="cell-nowrap">{format.qty(line.onHand, line.baseUnit)}</td>
          <td className="cell-nowrap">{format.qty(line.reorderPoint, line.baseUnit)}</td>
          <td className="cell-nowrap">{format.qty(line.parLevel, line.baseUnit)}</td>
          <td className="cell-end cell-nowrap"><strong>{line.suggestedUnits ? formatInUnit(line.suggestedUnits.quantity, unitLabel(line.suggestedUnits), format.language) : format.qty(line.suggestedQuantity, line.baseUnit)}</strong>
            {line.suggestedUnits && <small>{format.qty(line.suggestedQuantity, line.baseUnit)}</small>}</td>
          {actions.costs && <td className="cell-nowrap">{format.money(line.estimatedCost)}</td>}
          <CompactMeta parts={[text(`موجود ${format.qty(line.onHand, line.baseUnit)}`, `${format.qty(line.onHand, line.baseUnit)} on hand`), actions.costs ? format.money(line.estimatedCost) : null]} />
        </tr>)}</tbody>
      </table></div>
    </section>)}
  </>;
}

function ValuationReport() {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const page = useStockBranch();
  const branchId = page.branchId;
  const report = useQuery({ queryKey: inventoryKeys.report('valuation', { branchId }), queryFn: () => inventoryApi.valuation(branchId), enabled: Boolean(branchId), placeholderData: keepPreviousData });
  return <>
    <PageBranchPicker page={page} />
    {report.isError && <ErrorPanel error={report.error} onRetry={() => void report.refetch()} />}
    {report.isPending && <Skeleton height={200} />}
    {report.data && <>
      <div className="att-kpis is-compact">
        <Figure label={text('قيمة المخزون', 'Stock value')} value={format.money(report.data.total)} tone="info" testId="valuation-total" />
        <Figure label={text('خامات بالسالب', 'Below zero')} value={formatNumber(report.data.negativeItems, format.language)} tone={report.data.negativeItems ? 'danger' : 'muted'}
          hint={text('مش داخلة في القيمة', 'Not valued')} />
      </div>
      <section className="card card-padded" aria-labelledby="valuation-title">
        <h2 id="valuation-title" className="section-title">{text('حسب القسم', 'By category')}</h2>
        {report.data.byCategory.length === 0 ? <p className="muted">{text('مفيش مخزون له قيمة.', 'No stock with a value.')}</p>
          : <BarList label={text('قيمة المخزون حسب القسم', 'Stock value by category')} format={value => format.money(value)}
            items={report.data.byCategory.map(row => ({ key: row.category ?? 'none', label: row.category ?? text('من غير قسم', 'No category'), hint: text(`${formatNumber(row.items, 'ar')} خامة`, `${row.items} ingredient${row.items === 1 ? '' : 's'}`), value: row.value }))} />}
      </section>
    </>}
  </>;
}

const monthStart = () => `${today().slice(0, 8)}01`;

function FoodCostReport() {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const branchId = useListBranch();
  const [from, setFrom] = useState(() => shiftDay(today(), -29));
  const [to, setTo] = useState(today);
  const params = { branchId, from, to };
  const report = useQuery({ queryKey: inventoryKeys.report('food-cost', params), queryFn: () => inventoryApi.foodCost(params), placeholderData: keepPreviousData });
  const presets: [string, string, string][] = [
    [text('آخر ٧ أيام', 'Last 7 days'), shiftDay(today(), -6), today()],
    [text('آخر ٣٠ يوم', 'Last 30 days'), shiftDay(today(), -29), today()],
    [text('الشهر ده', 'This month'), monthStart(), today()],
  ];
  const total = report.data?.total;
  return <>
    <div className="att-filters" role="group" aria-label={text('الفترة', 'Period')}>
      <Field label={text('من', 'From')}><input className="input" type="date" value={from} max={to} onChange={event => event.target.value && setFrom(event.target.value)} /></Field>
      <Field label={text('لحد', 'To')}><input className="input" type="date" value={to} min={from} max={today()} onChange={event => event.target.value && setTo(event.target.value)} /></Field>
      <div className="att-presets">{presets.map(([label, start, end]) => <button key={label} type="button" className={`filter-chip ${from === start && to === end ? 'active' : ''}`} onClick={() => { setFrom(start); setTo(end); }}>{label}</button>)}</div>
    </div>
    {report.isError && <ErrorPanel error={report.error} onRetry={() => void report.refetch()} />}
    {report.isPending && <Skeleton height={200} />}
    {total && <>
      <div className="inv-fc-hero" data-testid="food-cost-hero">
        <div><span>{text('تكلفة الأكل الفعلية', 'Actual food cost')}</span><strong>{format.percent(total.actualFoodCostPercent)}</strong>
          <small>{text('المبيعات + الهالك + فرق الجرد، من الإيراد', 'Sales cost + waste + count difference, of revenue')}</small></div>
        <div><span>{text('تكلفة الأكل النظرية', 'Theoretical food cost')}</span><strong>{format.percent(total.theoreticalFoodCostPercent)}</strong>
          <small>{text('اللي المفروض الوصفات صرفته', 'What the recipes should have used')}</small></div>
      </div>
      <p className="inv-note">{text('الفرق بين الفعلي والنظري هو الهالك وفروقات الجرد: كل ما يقرّبوا من بعض، كل ما المطبخ ماشي على الوصفات.', 'The gap between actual and theoretical is waste and count differences: the closer they are, the closer the kitchen follows the recipes.')}</p>
      <div className="att-kpis is-compact" data-testid="food-cost-figures">
        <Figure label={text('الإيراد', 'Revenue')} value={format.money(total.revenue)} />
        <Figure label={text('تكلفة المبيعات', 'Cost of sales')} value={format.money(total.theoreticalCost)} />
        <Figure label={text('الهالك', 'Waste')} value={format.money(total.wasteCost)} tone={total.wasteCost ? 'warning' : 'muted'} />
        <Figure label={text('فرق الجرد', 'Count difference')} value={format.signedMoney(total.countVariance)} tone={total.countVariance < 0 ? 'danger' : 'muted'} />
        <Figure label={text('المشتريات', 'Purchases')} value={format.money(total.purchases)} tone="info" />
      </div>
      {report.data && report.data.byBranch.length > 1 && <section className="card list-card" aria-labelledby="fc-branches">
        <h2 id="fc-branches" className="card-title inv-card-title">{text('حسب الفرع', 'By branch')}</h2>
        <div className="table-scroll"><table className="data-table inv-table">
          <thead><tr><th scope="col">{text('الفرع', 'Branch')}</th><th scope="col">{text('الإيراد', 'Revenue')}</th><th scope="col">{text('تكلفة المبيعات', 'Cost of sales')}</th><th scope="col">{text('الهالك', 'Waste')}</th>
            <th scope="col">{text('فرق الجرد', 'Count difference')}</th><th scope="col">{text('النظرية', 'Theoretical')}</th><th scope="col">{text('الفعلية', 'Actual')}</th></tr></thead>
          <tbody>{report.data.byBranch.map((row: FoodCostRow) => <tr key={row.branchId ?? 'all'}>
            <td className="cell-primary"><bdi>{row.branchName ?? '—'}</bdi></td>
            <td className="cell-nowrap">{format.money(row.revenue)}</td><td className="cell-nowrap">{format.money(row.theoreticalCost)}</td><td className="cell-nowrap">{format.money(row.wasteCost)}</td>
            <td className="cell-nowrap">{format.signedMoney(row.countVariance)}</td><td className="cell-nowrap">{format.percent(row.theoreticalFoodCostPercent)}</td>
            <td className="cell-end cell-nowrap"><strong>{format.percent(row.actualFoodCostPercent)}</strong></td>
            <CompactMeta parts={[format.money(row.revenue), text(`نظرية ${format.percent(row.theoreticalFoodCostPercent)}`, `theoretical ${format.percent(row.theoreticalFoodCostPercent)}`), text(`هالك ${format.money(row.wasteCost)}`, `waste ${format.money(row.wasteCost)}`)]} />
          </tr>)}</tbody>
        </table></div>
      </section>}
    </>}
  </>;
}

const CLASS_ICONS: Record<MenuEngineeringClass, string> = { STAR: '★', PLOWHORSE: '◆', PUZZLE: '?', DOG: '▼' };

function EngineeringReport() {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const branchId = useListBranch();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [sort, setSort] = useState<EngineeringSort>('margin');
  const params = { branchId, days: Number(days) };
  const report = useQuery({ queryKey: inventoryKeys.report('engineering', params), queryFn: () => inventoryApi.menuEngineering(params), placeholderData: keepPreviousData });
  const data = report.data;
  const summary = data ? engineeringSummary(data) : null;
  const groups = data ? groupByClass(data.rows) : null;
  return <>
    <div className="inv-toolbar">
      <Chips value={days} onChange={setDays} label={text('الفترة', 'Period')} options={[
        { value: '7', label: text('٧ أيام', '7 days') }, { value: '30', label: text('٣٠ يوم', '30 days') }, { value: '90', label: text('٩٠ يوم', '90 days') },
      ]} />
    </div>
    <p className="inv-note">{text('كل طبق اتباع في الفترة: الشعبية (نصيبه من المبيعات) والمكسب للطبق (السعر ناقص تكلفة الوصفة). الأطباق اللي مبيعاتها من غير تكلفة وصفة مش بتتصنف.', 'Every dish sold in the period: popularity (its share of items sold) and margin per dish (price minus recipe cost). Dishes sold without a recipe cost are not classified.')}</p>
    {report.isError && <ErrorPanel error={report.error} onRetry={() => void report.refetch()} />}
    {report.isPending && <Skeleton height={300} />}
    {data && summary && groups && <>
      {summary.empty && <Alert kind="info" live={false} title={text('مفيش أطباق اتصنفت لسه', 'No dish could be classified yet')}>
        {data.rows.length === 0 ? text('مفيش مبيعات في الفترة دي.', 'No sales in this period.') : text('المبيعات دي اتسجلت قبل ما الوصفات تتكتب أو والمخزون مقفول، فمالهاش تكلفة. التصنيف بيظهر مع المبيعات الجديدة.', 'These sales were recorded before the recipes existed or while inventory was off, so they carry no cost. The matrix fills in with new sales.')}
      </Alert>}
      <div className="inv-matrix" role="group" aria-label={text('مصفوفة هندسة المنيو', 'Menu engineering matrix')} data-testid="engineering-matrix">
        {MATRIX_LAYOUT.flat().map(key => {
          const meta = CLASS_PRESENTATION[key];
          return <section key={key} className={`inv-quadrant tone-${meta.tone}`} aria-labelledby={`quad-${key}`} data-testid={`quadrant-${key}`}>
            <header><span className="inv-quadrant-mark" aria-hidden="true">{CLASS_ICONS[key]}</span><h3 id={`quad-${key}`}>{text(...MENU_ENGINEERING_CLASS_LABELS[key])}</h3>
              <strong className="inv-quadrant-count">{formatNumber(summary.counts[key], format.language)}</strong></header>
            <p>{text(...meta.advice)}</p>
            <small className="muted">{text(meta.popular ? 'شعبي' : 'مش شعبي', meta.popular ? 'Popular' : 'Less popular')} · {text(meta.profitable ? 'مكسبه عالي' : 'مكسبه قليل', meta.profitable ? 'high margin' : 'low margin')}
              {summary.classified > 0 && <> · {text(`${formatNumber(summary.marginShare[key], 'ar')}٪ من المكسب`, `${summary.marginShare[key]}% of margin`)}</>}</small>
            {groups[key].length > 0 && <ul className="inv-inline-list">{groups[key].slice(0, 5).map(row => <li key={row.itemId}><bdi>{format.name(row.nameAr, row.nameEn)}</bdi></li>)}</ul>}
          </section>;
        })}
      </div>
      <p className="inv-matrix-legend" aria-hidden="true"><span>{text('↑ فوق: مكسب أعلى', '↑ Top: higher margin')}</span><span>{text('← الشمال: شعبية أعلى', '→ Right: more popular')}</span></p>
      {data.rows.length > 0 && <section className="card list-card" aria-labelledby="eng-table">
        <header className="inv-panel-head is-padded"><h2 id="eng-table">{text('كل طبق', 'Every dish')}</h2>
          <select className="select inv-sort-select" aria-label={text('الترتيب', 'Sort')} value={sort} onChange={event => setSort(event.target.value as EngineeringSort)}>
            <option value="margin">{text('المكسب الكلي', 'Total margin')}</option><option value="sold">{text('المبيعات', 'Items sold')}</option><option value="foodCost">{text('تكلفة الأكل', 'Food cost')}</option>
          </select></header>
        <div className="table-scroll"><table className="data-table inv-table" data-testid="engineering-table">
          <thead><tr><th scope="col">{text('الطبق', 'Dish')}</th><th scope="col">{text('اتباع', 'Sold')}</th><th scope="col">{text('الإيراد', 'Revenue')}</th><th scope="col">{text('التكلفة', 'Cost')}</th>
            <th scope="col">{text('مكسب الطبق', 'Margin per dish')}</th><th scope="col">{text('تكلفة الأكل', 'Food cost')}</th><th scope="col">{text('التصنيف', 'Class')}</th></tr></thead>
          <tbody>{sortEngineering(data.rows, sort).map(row => <tr key={row.itemId}>
            <td className="cell-primary"><bdi>{format.name(row.nameAr, row.nameEn)}</bdi></td>
            <td>{formatNumber(row.sold, format.language)}</td><td className="cell-nowrap">{format.money(row.revenue)}</td><td className="cell-nowrap">{format.money(row.cost)}</td>
            <td className="cell-nowrap">{format.money(row.unitMargin)}</td><td className="cell-nowrap">{format.percent(row.foodCostPercent)}</td>
            <td className="cell-end">{row.class ? <span className={`badge inv-class tone-${CLASS_PRESENTATION[row.class].tone}`}>{CLASS_ICONS[row.class]} {text(...MENU_ENGINEERING_CLASS_LABELS[row.class])}</span>
              : <span className="badge badge-muted" title={text('مبيعاته من غير تكلفة وصفة', 'Sold without a recipe cost')}>{text('مش متصنف', 'Unclassified')}</span>}</td>
            <CompactMeta parts={[text(`اتباع ${formatNumber(row.sold, 'ar')}`, `${row.sold} sold`), format.money(row.revenue), row.unitMargin === null ? null : text(`مكسب ${format.money(row.unitMargin)}`, `margin ${format.money(row.unitMargin)}`)]} />
          </tr>)}</tbody>
        </table></div>
      </section>}
      {data.averageMargin !== null && <p className="muted inv-note"><ChartPieIcon size={15} aria-hidden="true" /> {text(`الحد: نصيب ${format.percent((data.popularityThreshold ?? 0) * 100)} من المبيعات، ومكسب ${format.money(data.averageMargin)} للطبق (المتوسط).`, `Thresholds: a ${format.percent((data.popularityThreshold ?? 0) * 100)} share of items sold, and ${format.money(data.averageMargin)} margin per dish (the average).`)}</p>}
    </>}
  </>;
}
