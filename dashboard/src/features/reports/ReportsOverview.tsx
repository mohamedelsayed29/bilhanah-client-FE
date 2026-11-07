import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ReportData, ReportQuery } from '@bilhanah/contracts';
import { apiClient } from '../../lib/api';
import { useLanguage } from '../../lib/language';
import { formatCompact } from '../../lib/format';
import { labelIndexes, niceMax } from '../../lib/charts';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { overviewPoints, type OverviewPeriod, type OverviewPoint } from './overview-data';
import { smoothPath } from '../restaurant/overview/SalesChart';
import './overview.css';

type Props = { filters: ReportQuery; data: ReportData; enabled: boolean };

const DAY_MS = 86_400_000;

/**
 * The trend over the page's period: one day hour by hour (its own request), up to two months day
 * by day, longer periods month by month (each month keeps its days for the tooltip).
 */
export function ReportsOverview({filters,data,enabled}:Props) {
  const {text}=useLanguage();
  const single=filters.from===filters.to;
  const span=(Date.parse(filters.to)-Date.parse(filters.from))/DAY_MS+1;
  const period:OverviewPeriod=single?'day':span>62?'year':'month';
  const query={...filters,type:'overview' as const,page:1,pageSize:20,sort:'date' as const,direction:'asc' as const};
  const hourly=useQuery({queryKey:['report-overview','day',query],enabled:enabled&&single,
    queryFn:({signal})=>apiClient.request<ReportData>(`/v1/reports/overview?${new URLSearchParams(Object.entries(query).filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=>[k,String(v)]))}&period=day`,{signal}),
    staleTime:30000,refetchInterval:60000});
  const source=single?hourly.data:data;
  const points=useMemo(()=>overviewPoints(source?.days??[],period),[source?.days,period]);
  const [active,setActive]=useState<number|null>(null);
  const timezone=data.restaurant.timezone;
  const hint=period==='day'?text('اليوم بالساعة.','Hour by hour.'):period==='month'?text('يوم بيوم.','Day by day.'):text('شهر بشهر، وتفاصيل الأيام في كل شهر.','Month by month, with each month’s days.');
  return <section className="report-overview" aria-labelledby="report-overview-title" data-testid="report-overview">
    <div className="report-overview-heading"><h2 id="report-overview-title">{text('الأداء على مدار الفترة','Performance over the period')}</h2>
      <p>{hint} {text('مرّر على الرسم أو استخدم الأسهم.','Hover the chart or use the arrow keys.')}</p></div>
    {single&&hourly.isPending&&<div className="overview-chart-grid" role="status" aria-label={text('جاري تحميل الرسوم','Loading charts')}>{[0,1].map(i=><div className="card overview-chart-card" key={i}><Skeleton height={280}/></div>)}</div>}
    {single&&hourly.isError&&<ErrorPanel error={hourly.error} onRetry={()=>void hourly.refetch()}/>}
    {source&&<div className="overview-chart-grid">
      <OverviewChart key={`sales-${period}-${filters.from}`} kind="line" points={points} period={period} timezone={timezone} currency={data.restaurant.currency} active={active} setActive={setActive}/>
      <OverviewChart key={`orders-${period}-${filters.from}`} kind="bar" points={points} period={period} timezone={timezone} currency={data.restaurant.currency} active={active} setActive={setActive}/>
    </div>}
  </section>;
}

type ChartProps={kind:'line'|'bar';points:OverviewPoint[];period:OverviewPeriod;timezone:string;currency:string;active:number|null;setActive:(index:number|null)=>void};
function OverviewChart({kind,points,period,timezone,currency,active,setActive}:ChartProps) {
  const {text,language,locale,number}=useLanguage();
  const rtl=language==='ar', sales=kind==='line';
  const title=sales?text('صافي المبيعات','Net sales'):text('إجمالي الطلبات','Total orders');
  const plotRef=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(480);
  const id=useId().replace(/:/g,'');
  const tooltipId=`overview-tooltip-${id}`;
  useLayoutEffect(()=>{
    const el=plotRef.current;if(!el)return;
    const measure=()=>setWidth(Math.max(200,Math.round(el.clientWidth)));
    measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();
  },[]);
  const money=(v:number)=>new Intl.NumberFormat(locale,{style:'currency',currency,maximumFractionDigits:2}).format(v/100);
  const values=points.map(p=>sales?p.net:p.orders), total=values.reduce((sum,v)=>sum+v,0);
  const maximum=niceMax(Math.max(0,...values),sales?10000:4), height=220, top=12, bottom=182, gutter=54;
  const left=rtl?8:gutter,right=rtl?width-gutter:width-8,plotWidth=Math.max(1,right-left);
  const slot=plotWidth/Math.max(1,points.length);
  const x=(i:number)=>left+slot*((rtl?points.length-1-i:i)+.5);
  const y=(v:number)=>bottom-(v/maximum)*(bottom-top);
  const coords=values.map((value,i)=>({x:x(i),y:y(value)})).sort((a,b)=>a.x-b.x);
  const line=smoothPath(coords);
  const area=coords.length?`${line} L${coords.at(-1)!.x},${bottom} L${coords[0]!.x},${bottom} Z`:'';
  const ticks=[0,maximum/2,maximum].filter(v=>sales||Number.isInteger(v));
  const labels=new Set(labelIndexes(points.length,Math.max(2,Math.floor(plotWidth/75))));
  function dateLabel(date:string,full=false) {
    const instant=new Date(date.length===10?`${date}T00:00:00Z`:date);
    if(period==='day')return new Intl.DateTimeFormat(locale,{timeZone:timezone,...(full?{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'}:{hour:'numeric',hour12:true})}).format(instant);
    return new Intl.DateTimeFormat(locale,{timeZone:'UTC',...(period==='year'?{month:full?'long':'short',...(full&&{year:'numeric'})}:full?{day:'numeric',month:'long',year:'numeric'}:{day:'numeric',month:'short'})}).format(instant);
  }
  const dayLabel=(date:string)=>new Intl.DateTimeFormat(locale,{timeZone:'UTC',day:'numeric',month:'short'}).format(new Date(`${date}T00:00:00Z`));
  const selected=active===null?undefined:points[active];
  const position=active===null?width/2:Math.max(0,Math.min(width-250,x(active)-125));
  function pointer(event:PointerEvent<SVGSVGElement>) {
    if(!points.length)return;
    const box=event.currentTarget.getBoundingClientRect();
    const px=(event.clientX-box.left)*width/box.width;
    const index=Math.max(0,Math.min(points.length-1,Math.floor((px-left)/slot)));
    setActive(rtl?points.length-1-index:index);
  }
  function keydown(event:KeyboardEvent<HTMLDivElement>) {
    if(!points.length)return;
    const current=active??points.length-1;
    if(event.key==='Escape'){setActive(null);return;}
    let next:number;
    if(event.key===(rtl?'ArrowLeft':'ArrowRight'))next=Math.min(points.length-1,current+1);
    else if(event.key===(rtl?'ArrowRight':'ArrowLeft'))next=Math.max(0,current-1);
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=points.length-1;
    else return;
    event.preventDefault();setActive(next);
  }
  return <figure className={`card overview-chart-card overview-${kind}`} data-testid={`overview-${kind}`}>
    <figcaption><div><span className="overview-metric-label"><i aria-hidden="true"/>{title}</span><strong>{sales?money(total):number(total)}</strong></div>
      <span className="overview-chart-caption">{sales?currency:text('طلب','orders')}</span></figcaption>
    <div ref={plotRef} className="overview-plot" tabIndex={0} role="img" aria-label={text(`${title}. استخدم الأسهم لقراءة القيم، أو مرّر على الرسم.`,`${title}. Use arrow keys to explore values, or hover over the chart.`)} aria-describedby={selected?tooltipId:undefined}
      onFocus={()=>{if(active===null&&points.length)setActive(points.length-1);}} onKeyDown={keydown} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setActive(null);}}
      onPointerLeave={e=>{if(e.pointerType==='mouse')setActive(null);}}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" onPointerMove={pointer} onPointerDown={pointer}>
        <defs><linearGradient id={`overview-fill-${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--color-primary)" stopOpacity=".22"/><stop offset="100%" stopColor="var(--color-primary)" stopOpacity=".015"/></linearGradient></defs>
        {ticks.map(tick=><g key={tick}><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className="overview-gridline"/><text x={rtl?right+8:left-8} y={y(tick)} dy=".35em" textAnchor={rtl?'start':'end'} className="overview-axis" direction="ltr">{formatCompact(sales?tick/100:tick,language)}</text></g>)}
        {sales?<><path d={area} fill={`url(#overview-fill-${id})`}/><path d={line} className="overview-sales-line"/>{points.length===1&&<circle cx={x(0)} cy={y(values[0]??0)} r="4" className="overview-dot"/>}</>:
          values.map((value,i)=><rect key={points[i]!.date} x={x(i)-Math.min(slot*.58,28)/2} y={y(value)} width={Math.min(slot*.58,28)} height={bottom-y(value)} rx={3} className={`overview-column ${active===i?'is-active':''}`}/>)}
        {selected&&<><line x1={x(active!)} x2={x(active!)} y1={top} y2={bottom} className="overview-crosshair"/>{sales&&<circle cx={x(active!)} cy={y(values[active!]??0)} r="5" className="overview-dot"/>}</>}
        {points.map((point,i)=>labels.has(i)?<text key={point.date} x={x(i)} y={height-12} textAnchor="middle" className="overview-axis">{dateLabel(point.date)}</text>:null)}
        <rect x={left} y={top} width={plotWidth} height={bottom-top} fill="transparent"/>
      </svg>
      {total===0&&<p className="overview-no-activity">{text('لا توجد حركة في الفترة دي حتى الآن','No activity in this period yet')}</p>}
      {selected&&<div className="overview-tooltip" id={tooltipId} role="tooltip" data-testid={`overview-${kind}-tooltip`} style={{left:position}}>
        <strong>{dateLabel(selected.date,true)}</strong><div><span>{text('صافي المبيعات','Net sales')}</span><b>{money(selected.net)}</b></div><div><span>{text('الطلبات','Orders')}</span><b>{number(selected.orders)}</b></div>
        {period==='year'&&selected.days.length>0&&<div className="overview-daily-breakdown" tabIndex={0} role="region" aria-label={text('تفاصيل الأيام','Daily breakdown')}><small>{text('تفاصيل الأيام','Daily breakdown')}</small>
          {selected.days.map(day=><p key={day.date}><span>{dayLabel(day.date)}</span><b>{money(day.net)}</b><span>{number(day.orders)} {text('طلب','orders')}</span></p>)}</div>}
      </div>}
    </div>
    <div className="visually-hidden"><table><caption>{title}</caption><thead><tr><th>{text('التاريخ','Date')}</th><th>{text('صافي المبيعات','Net sales')}</th><th>{text('الطلبات','Orders')}</th></tr></thead><tbody>{points.map(point=><tr key={point.date}><th>{dateLabel(point.date,true)}</th><td>{money(point.net)}</td><td>{number(point.orders)}</td></tr>)}</tbody></table></div>
  </figure>;
}
