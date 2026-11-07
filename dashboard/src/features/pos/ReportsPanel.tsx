import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { OrderChannel } from '@bilhanah/contracts';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { posApi } from '../../lib/api/endpoints';
import { formatDate, formatPrice } from '../../lib/format';
import { useLanguage } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';

const today = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const daysAgo = (days: number) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - days * 86_400_000));
const METHODS: Record<string, [string, string]> = { CASH: ['كاش', 'Cash'], CARD: ['كارت', 'Card'], WALLET: ['محفظة', 'Wallet'], OTHER: ['أخرى', 'Other'] };

/** POS sales from real orders and payments: gross, net, tax and service apart; collected vs still owed; by channel, method, cashier; shifts. */
export function ReportsPanel() {
  const { text, language, number } = useLanguage();
  const scope = useBranchScope();
  const [range, setRange] = useState({ from: daysAgo(6), to: today() });
  const [channel, setChannel] = useState<OrderChannel | ''>('');
  const params = { ...range, branchId: scope.selected === 'all' ? null : scope.selected, ...(channel && { channel }) };
  const report = useQuery({ queryKey: ['pos', 'report', params], queryFn: () => posApi.report(params), placeholderData: keepPreviousData });
  const money = (piastres: number) => formatPrice(piastres, language);
  const data = report.data;
  return <section className="card pos-card" aria-labelledby="pos-reports">
    <header className="pos-report-head">
      <div><h2 id="pos-reports">{text('تقارير الكاشير', 'POS reports')}</h2>
        <p className="pos-muted">{text('من الطلبات والمدفوعات الفعلية. الضريبة والخدمة مش محسوبين في المبيعات.', 'From real orders and payments. Tax and service are not counted as sales.')}</p></div>
    </header>
    <div className="pos-report-toolbar">
      <div className="pos-presets" role="group" aria-label={text('الفترة', 'Period')}>
        {([[0, 'النهارده', 'Today'], [6, '٧ أيام', '7 days'], [29, '٣٠ يوم', '30 days']] as const).map(([days, ar, en]) => {
          const active = range.to === today() && range.from === daysAgo(days);
          return <button key={days} type="button" className={active ? 'active' : ''} aria-pressed={active} onClick={() => setRange({ from: daysAgo(days), to: today() })}>{text(ar, en)}</button>;
        })}
      </div>
      <div className="pos-range">
        <input className="input" type="date" dir="ltr" value={range.from} max={range.to} onChange={event => event.target.value && setRange(current => ({ ...current, from: event.target.value }))} aria-label={text('من', 'From')} />
        <span aria-hidden="true">→</span>
        <input className="input" type="date" dir="ltr" value={range.to} min={range.from} onChange={event => event.target.value && setRange(current => ({ ...current, to: event.target.value }))} aria-label={text('لحد', 'To')} />
      </div>
      <select className="select pos-source" value={channel} onChange={event => setChannel(event.target.value as OrderChannel | '')} aria-label={text('المصدر', 'Source')}>
        <option value="">{text('كل الطلبات', 'All orders')}</option><option value="POS">{text('الكاشير بس', 'POS only')}</option><option value="MENU">{text('منيو QR بس', 'QR menu only')}</option>
      </select>
    </div>
    {report.isError && <ErrorPanel error={report.error} onRetry={() => void report.refetch()} />}
    {report.isPending && <Skeleton height={240} />}
    {data && <>
      <dl className="pos-kpis">
        {[
          [text('صافي المبيعات', 'Net sales'), money(data.netPiastres), text(`إجمالي ${money(data.grossPiastres)} − خصم ${money(data.discountPiastres)}`, `Gross ${money(data.grossPiastres)} − discounts ${money(data.discountPiastres)}`)],
          [text('اتحصّل', 'Collected'), money(data.collectedPiastres), text(`مسترد ${money(data.refundedPiastres)}`, `Refunded ${money(data.refundedPiastres)}`)],
          [text('لسه متدفعش', 'Outstanding'), money(data.outstandingPiastres), text(`من فواتير ${money(data.billedPiastres)}`, `Of ${money(data.billedPiastres)} billed`)],
          [text('الطلبات', 'Orders'), number(data.orders), text(`متوسط ${money(data.averageOrderPiastres)}`, `Average ${money(data.averageOrderPiastres)}`)],
          [text('ضريبة وخدمة', 'Tax & service'), money(data.taxPiastres + data.serviceChargePiastres), text(`ضريبة ${money(data.taxPiastres)} · خدمة ${money(data.serviceChargePiastres)}`, `Tax ${money(data.taxPiastres)} · service ${money(data.serviceChargePiastres)}`)],
        ].map(([label, value, note]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><small>{note}</small></div>)}
      </dl>
      <div className="pos-report-grid">
        <div><h3>{text('حسب المصدر', 'By source')}</h3><ul className="pos-bars">{data.byChannel.map(row => <li key={row.channel}><span>{row.channel === 'POS' ? text('الكاشير', 'POS') : text('منيو QR', 'QR menu')} · {number(row.orders)}</span><strong>{money(row.netPiastres)}</strong></li>)}</ul></div>
        <div><h3>{text('حسب طريقة الدفع', 'By payment method')}</h3><ul className="pos-bars">{data.byMethod.length ? data.byMethod.map(row => <li key={row.method}><span>{text(...(METHODS[row.method] ?? METHODS.OTHER!))} · {number(row.payments)}</span><strong>{money(row.collectedPiastres)}</strong></li>) : <li className="pos-muted">{text('مفيش مدفوعات.', 'No payments.')}</li>}</ul></div>
        <div><h3>{text('حسب الكاشير', 'By cashier')}</h3><ul className="pos-bars">{data.byCashier.length ? data.byCashier.map(row => <li key={row.cashierId ?? row.name}><span>{row.name} · {number(row.orders)}</span><strong>{money(row.netPiastres)}</strong></li>) : <li className="pos-muted">{text('مفيش طلبات كاشير.', 'No POS orders.')}</li>}</ul></div>
      </div>
      <h3 className="pos-sub">{text('الورديات', 'Shifts')}</h3>
      {data.shifts.length === 0 ? <p className="pos-muted">{text('مفيش ورديات في الفترة دي.', 'No shifts in this period.')}</p> : <div className="table-scroll"><table className="data-table">
        <thead><tr><th>{text('الكاشير', 'Cashier')}</th><th>{text('فتح', 'Opened')}</th><th>{text('الحالة', 'Status')}</th><th className="num">{text('المتوقع', 'Expected')}</th><th className="num">{text('الفعلي', 'Counted')}</th><th className="num">{text('الفرق', 'Difference')}</th></tr></thead>
        <tbody>{data.shifts.map(shift => <tr key={shift.id}><td>{shift.cashierName}</td><td>{formatDate(shift.openedAt, language, { dateStyle: 'short', timeStyle: 'short' })}</td><td>{shift.status}</td>
          <td className="num">{shift.expectedPiastres === null ? '—' : money(shift.expectedPiastres)}</td><td className="num">{shift.countedPiastres === null ? '—' : money(shift.countedPiastres)}</td>
          <td className={`num ${shift.discrepancyPiastres ? 'pos-diff' : ''}`}>{shift.discrepancyPiastres === null ? '—' : money(shift.discrepancyPiastres)}</td></tr>)}</tbody>
      </table></div>}
    </>}
  </section>;
}
