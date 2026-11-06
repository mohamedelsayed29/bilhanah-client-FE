import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowClockwiseIcon, DownloadSimpleIcon, EyeIcon, FileCsvIcon, FilePdfIcon, ChartBarIcon } from '@phosphor-icons/react';
import { REPORT_TYPES, type ReportData, type ReportQuery, type ReportRow, type ReportType } from '@bilhanah/contracts';
import { apiClient } from '../../lib/api';
import { useLanguage, usePageTitle } from '../../lib/language';
import { PageHeader } from '../../components/PageHeader';
import { Section } from '../../components/Section';
import { Dialog } from '../../components/Dialog';
import { Pagination } from '../../components/Pagination';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { useWorkspace } from '../branches/workspace';
import { useBranchScope } from '../branches/BranchScope';
import './reports.css';
import { ReportsOverview } from './ReportsOverview';

export function reportPeriod(period:string, timezone:string, now=new Date()) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const end=new Date(`${today}T00:00:00Z`), start=new Date(end);
  if(period==='weekly') start.setUTCDate(start.getUTCDate()-6);
  if(period==='monthly') start.setUTCDate(1);
  if(period==='quarterly') {start.setUTCDate(1);start.setUTCMonth(Math.floor(start.getUTCMonth()/3)*3);}
  return {from:start.toISOString().slice(0,10),to:today};
}
const labels:Record<ReportType,[string,string]>={overview:['نظرة عامة','Overview'],sales:['المبيعات','Sales'],orders:['الطلبات','Orders'],products:['الأصناف','Products'],categories:['الأقسام','Categories'],branches:['الفروع','Branches'],payments:['المدفوعات والاسترجاع','Payments & refunds']};
const statusLabels:Record<string,[string,string]>={PLACED:['جديد','Placed'],ACCEPTED:['مقبول','Accepted'],PREPARING:['قيد التجهيز','Preparing'],READY:['جاهز','Ready'],COMPLETED:['مكتمل','Completed'],CANCELLED:['ملغي','Cancelled'],REJECTED:['مرفوض','Rejected']};
const paymentLabels:Record<string,[string,string]>={CASH:['نقدي','Cash'],CARD:['بطاقة','Card'],WALLET:['محفظة','Wallet'],OTHER:['أخرى','Other'],UNPAID:['غير مدفوع','Unpaid']};
const params=(query:ReportQuery)=>new URLSearchParams(Object.entries(query).filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=>[k,String(v)])).toString();

export function ReportsPage() {
  const {text,language,number}=useLanguage();
  usePageTitle('التقارير','Reports');
  const workspace=useWorkspace(), scope=useBranchScope();
  const queryClient=useQueryClient();
  const [filters,setFilters]=useState<ReportQuery>(()=>({...reportPeriod('monthly','Africa/Cairo'),type:'overview',language,page:1,pageSize:20,sort:'net',direction:'desc'}));
  const [period,setPeriod]=useState('monthly');
  const [busy,setBusy]=useState<string|null>(null),[message,setMessage]=useState(''),[failure,setFailure]=useState('');
  const [preview,setPreview]=useState<string|null>(null);
  const branchId=scope.selected==='all'?undefined:scope.selected;
  const query={...filters,language,branchId};
  const result=useQuery({queryKey:['reports',query],queryFn:({signal})=>apiClient.request<ReportData>(`/v1/reports?${params(query)}`,{signal}),enabled:workspace.can('analytics.financial')&&workspace.can('analytics.view')});
  const data=result.data;
  useEffect(()=>{if(!data||period==='custom')return;const range=reportPeriod(period,data.restaurant.timezone);setFilters(f=>f.from===range.from&&f.to===range.to?f:{...f,...range,page:1});},[data?.restaurant.timezone,period]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  const update=(patch:Partial<ReportQuery>)=>setFilters(f=>({...f,...patch,page:1}));
  const money=(v:number)=>new Intl.NumberFormat(language==='ar'?'ar-EG':'en-EG',{style:'currency',currency:data?.restaurant.currency??'EGP',maximumFractionDigits:2}).format(v/100);
  const name=(row:ReportRow)=>paymentLabels[row.name]?text(...paymentLabels[row.name]!):language==='ar'?row.name:row.nameEn||row.name;
  async function exportReport(format:'pdf'|'csv'|'html') {
    if(!data||busy||result.isFetching)return;
    setBusy(format);setFailure('');setMessage('');
    try {
      const blob=await apiClient.requestBlob(`/v1/reports/export?${params(query)}&format=${format}`);
      const url=URL.createObjectURL(blob);
      if(format==='html')setPreview(url);
      else {const link=document.createElement('a');link.href=url;link.download=`bilhanah-${query.type}-${query.from}-${query.to}.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage(text('التقرير جاهز واتنزّل بنجاح.','Your report was downloaded.'));}
    } catch(error) {setFailure(error instanceof Error?error.message:text('تعذر تنزيل التقرير. حاول تاني.','Could not download the report. Try again.'));}
    finally {setBusy(null);}
  }
  if(!workspace.can('analytics.financial'))return <div className="page"><PageHeader title={text('التقارير','Reports')}/><div className="card empty-state">{text('عرض وتنزيل التقارير يحتاج صلاحية الإحصائيات المالية.','Viewing and exporting reports requires financial analytics permission.')}</div></div>;
  const disabled=!data||Boolean(busy)||result.isFetching||result.isError;
  return <div className="page reports-page">
    <PageHeader title={text('التقارير','Reports')} description={text('كل أرقام مطعمك في مكان واحد. اختار الفترة، راجع الأداء، ونزّل تقريرك.','Your restaurant, in numbers. Choose a period, explore performance and take your report with you.')}
      actions={<button className="button button-secondary" onClick={()=>{void result.refetch();void queryClient.invalidateQueries({queryKey:['report-overview']});}} disabled={result.isFetching}><ArrowClockwiseIcon size={18}/>{text('تحديث','Refresh')}</button>}/>
    <ReportsOverview filters={query} timezone={data?.restaurant.timezone??'Africa/Cairo'} enabled={workspace.can('analytics.financial')&&workspace.can('analytics.view')}/>
    <div className="reports-tabs" role="group" aria-label={text('نوع التقرير','Report type')}>{REPORT_TYPES.map(type=><button key={type} className={filters.type===type?'is-active':''} aria-pressed={filters.type===type} onClick={()=>update({type})}>{text(...labels[type])}</button>)}</div>
    <section className="card reports-filters" aria-label={text('فلاتر التقارير','Report filters')}>
      <label>{text('الفترة','Period')}<select value={period} onChange={e=>{const v=e.target.value;setPeriod(v);if(v!=='custom')update(reportPeriod(v,data?.restaurant.timezone??'Africa/Cairo'));}}>{[['daily','اليوم','Today'],['weekly','آخر ٧ أيام','Last 7 days'],['monthly','الشهر الحالي','This month'],['quarterly','الربع الحالي','This quarter'],['custom','فترة مخصصة','Custom range']].map(([v,a,e])=><option key={v} value={v}>{text(a!,e!)}</option>)}</select></label>
      <label>{text('من','From')}<input type="date" value={filters.from} onChange={e=>{setPeriod('custom');update({from:e.target.value});}}/></label>
      <label>{text('إلى','To')}<input type="date" value={filters.to} onChange={e=>{setPeriod('custom');update({to:e.target.value});}}/></label>
      <label>{text('الفرع','Branch')}<select value={scope.selected} disabled={scope.locked} onChange={e=>{scope.select(e.target.value);update({});}}>{!scope.locked&&<option value="all">{text('كل الفروع','All branches')}</option>}{scope.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>{text('القسم','Category')}<select value={filters.categoryId??''} onChange={e=>update({categoryId:e.target.value||undefined,productId:undefined})}><option value="">{text('كل الأقسام','All categories')}</option>{data?.options.categories.map(c=><option key={c.id} value={c.id}>{language==='ar'?c.name:c.nameEn||c.name}</option>)}</select></label>
      <label>{text('الصنف','Product')}<select value={filters.productId??''} onChange={e=>update({productId:e.target.value||undefined})}><option value="">{text('كل الأصناف','All products')}</option>{data?.options.products.filter(p=>!filters.categoryId||p.categoryId===filters.categoryId).map(p=><option key={p.id} value={p.id}>{language==='ar'?p.name:p.nameEn||p.name}</option>)}</select></label>
      <label>{text('حالة الطلب','Order status')}<select value={filters.status??''} onChange={e=>update({status:e.target.value as ReportQuery['status']||undefined})}><option value="">{text('كل الحالات','All statuses')}</option>{Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{text(...v)}</option>)}</select></label>
      <label>{text('طريقة الدفع','Payment method')}<select value={filters.paymentMethod??''} onChange={e=>update({paymentMethod:e.target.value as ReportQuery['paymentMethod']||undefined})}><option value="">{text('كل الطرق','All methods')}</option>{Object.entries(paymentLabels).map(([k,v])=><option key={k} value={k}>{text(...v)}</option>)}</select></label>
      <button className="button button-ghost button-small reports-reset" onClick={()=>{setPeriod('monthly');update({...reportPeriod('monthly',data?.restaurant.timezone??'Africa/Cairo'),categoryId:undefined,productId:undefined,status:undefined,paymentMethod:undefined});}}>{text('مسح الفلاتر','Reset filters')}</button>
    </section>
    <div className="reports-export"><div><strong>{text('تقريرك، جاهز للمشاركة','Your report, ready to share')}</strong><small>{text('التنزيل يشمل كل نتائج الفلاتر، مش الصفحة الحالية بس.','Downloads include every filtered result, across all pages.')}</small></div><div className="reports-export-actions">
      <button className="button button-secondary" disabled={disabled} onClick={()=>void exportReport('html')}><EyeIcon size={19}/>{text('معاينة','Preview')}</button>
      <button className="button button-secondary" disabled={disabled} onClick={()=>void exportReport('csv')}><FileCsvIcon size={21}/>{text('تنزيل CSV','Download CSV')}</button>
      <button className="button reports-pdf" disabled={disabled} onClick={()=>void exportReport('pdf')}><span className="pdf-ball"><FilePdfIcon size={23} weight="duotone"/></span><span>{text('تنزيل PDF','Download PDF')}</span><DownloadSimpleIcon size={16}/></button>
    </div></div>
    <div role="status" aria-live="polite" className="reports-feedback">{busy?text('بنجهز تقريرك…','Preparing your report…'):message}</div>{failure&&<p className="reports-error" role="alert">{failure}</p>}
    {result.isError&&<ErrorPanel error={result.error} onRetry={()=>void result.refetch()}/>}
    {result.isPending&&<div className="reports-kpis">{Array.from({length:8},(_,i)=><div className="card" key={i}><Skeleton height={85}/></div>)}</div>}
    {data&&!result.isError&&<div aria-busy={result.isFetching} className="reports-body">
      <div className="reports-kpis">{[
        ['صافي المبيعات','Net sales',money(data.summary.net)],['إجمالي المبيعات','Gross sales',money(data.summary.gross)],['إجمالي الطلبات','Total orders',number(data.summary.orders)],['متوسط الطلب','Average order value',money(data.summary.average)],['طلبات مكتملة','Completed orders',number(data.summary.completed)],['ملغية / مرفوضة','Cancelled / rejected',number(data.summary.cancelled)],['خصومات','Discounts',money(data.summary.discounts)],['استرجاع نقدي مسجل','Recorded cash refunds',money(data.summary.refunds)],
      ].map(([a,e,v],i)=><div className={`card reports-kpi ${i===0?'is-featured':''}`} key={e}><span>{text(a!,e!)}</span><strong>{v}</strong>{i===0&&<small>{text('بعد الاسترجاع النقدي المسجل','After recorded cash reversals')}</small>}</div>)}</div>
      <p className="reports-submetrics">{text('قيد التنفيذ', 'Pending')}: {number(data.summary.pending)} · {text('طلبات باسترجاع مسجل', 'Orders with recorded refunds')}: {number(data.summary.refundedOrders)}</p><p className="reports-rules">{text('المبيعات تستبعد الطلبات والأصناف الملغية والمرفوضة. الخصومات غير مسجّلة حاليًا؛ الاسترجاع يشمل عكس المدفوعات النقدية المسجل فقط، وليس كل طرق الدفع. المتوسط = الصافي ÷ الطلبات غير الملغية.','Sales exclude cancelled/rejected orders and cancelled dishes. Discounts are not tracked yet; refunds cover recorded cash payment reversals only, across the order’s lifetime. Average = net sales ÷ non-cancelled orders.')}</p>
      {data.summary.orders===0?<div className="card empty-state"><ChartBarIcon size={38}/><h2>{text('لسه مفيش بيانات للفترة دي','No activity in this period')}</h2><p>{text('جرّب فترة أو فلاتر مختلفة. تقدر تنزّل التقرير الفارغ برضه.','Try another period or filters. You can still export this empty report.')}</p></div>:<>
        <div className="reports-charts">{[[text('الإيراد حسب الفرع','Revenue by branch'),data.branches],[text('الإيراد حسب القسم','Revenue by category'),data.categories],[text('طرق الدفع','Payment methods'),data.payments],[text('أعلى الأصناف','Top products'),data.topProducts]].map(([title,rows])=><section className="card reports-ranking" key={String(title)}><h2>{String(title)}</h2>{(rows as ReportRow[]).slice(0,6).map(row=><div className="reports-rank" key={row.id}><div><span>{name(row)}</span><strong>{money(row.net)}</strong></div><span className="reports-track"><span style={{width:`${Math.max(0,Math.min(100,row.contribution))}%`}}/></span></div>)}</section>)}</div>
      </>}
      <Section id="report-details" title={text('تفاصيل التقرير','Report details')} description={text(`${number(data.total)} سجل · الأسعار بـ${data.restaurant.currency}`,`${data.total} rows · Amounts in ${data.restaurant.currency}`)}>
        <div className="reports-sort"><label>{text('ترتيب حسب','Sort by')} <select value={filters.sort} onChange={e=>update({sort:e.target.value as ReportQuery['sort']})} disabled={filters.type==='orders'}>{[['net','صافي المبيعات','Net sales'],['gross','الإجمالي','Gross sales'],['units','الوحدات','Units'],['orders','الطلبات','Orders'],['name','الاسم','Name'],['date','التاريخ','Date']].map(([v,a,e])=><option key={v} value={v}>{text(a!,e!)}</option>)}</select></label><button className="button button-secondary button-small" disabled={filters.type==='orders'} onClick={()=>update({direction:filters.direction==='asc'?'desc':'asc'})}>{filters.direction==='desc'?text('تنازلي ↓','Descending ↓'):text('تصاعدي ↑','Ascending ↑')}</button><small>{filters.type==='orders'?text('الطلبات مرتبة من الأحدث.','Orders are listed newest first.'):null}</small></div>
        <div className="table-scroll reports-table" tabIndex={0} role="region" aria-label={text('بيانات التقرير، اسحب لرؤية الأعمدة', 'Report data, scroll to see all columns')}><table className="data-table"><thead><tr>{['البيان|Name','القسم|Category','الطلبات|Orders','الوحدات|Units','الإجمالي|Gross sales','الصافي|Net sales','المساهمة|Contribution', filters.type==='branches'?'متوسط الطلب|Average order':filters.type==='categories'?'عدد الأصناف|Products count':'استرجاع مسجل|Recorded refunds'].map(s=><th key={s}>{text(s.split('|')[0]!,s.split('|')[1]!)}</th>)}</tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td><strong>{name(row)}</strong>{row.status&&<small>{text(...statusLabels[row.status]!)} · {text(...paymentLabels[row.paymentMethod??'UNPAID']!)}</small>}</td><td>{(language==='ar'?row.category:row.categoryEn||row.category)??'—'}</td><td>{number(row.orders)}</td><td>{number(row.units)}</td><td>{money(row.gross)}</td><td>{money(row.net)}</td><td>{number(Math.round(row.contribution*10)/10)}%</td><td>{filters.type==='branches'?money(row.average):filters.type==='categories'?number(row.products):money(row.refunds)}</td></tr>)}</tbody></table></div>
        <Pagination page={filters.page} pageSize={filters.pageSize} total={data.total} label={text('صفحات التقرير','Report pages')} onChange={page=>setFilters(f=>({...f,page}))}/>
      </Section>
      <p className="reports-updated">{text('آخر تحديث','Last updated')}: {new Intl.DateTimeFormat(language==='ar'?'ar-EG':'en-GB',{timeZone:data.restaurant.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(data.generatedAt))}</p>
    </div>}
    {preview&&<Dialog open title={text('معاينة التقرير','Report preview')} size="wide" onClose={()=>setPreview(null)} footer={<button className="button reports-pdf" disabled={Boolean(busy)} onClick={()=>void exportReport('pdf')}><FilePdfIcon size={20}/>{text('تنزيل PDF','Download PDF')}</button>}><iframe title={text('التقرير بألوان بالهنا','Branded report preview')} src={preview} sandbox="" className="reports-preview"/></Dialog>}
  </div>;
}
