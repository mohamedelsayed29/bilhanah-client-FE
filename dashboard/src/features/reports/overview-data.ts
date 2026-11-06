import type { ReportData } from '@bilhanah/contracts';

export type OverviewPeriod = 'day' | 'month' | 'year';
export type OverviewDay = { date: string; net: number; orders: number };
export type OverviewPoint = OverviewDay & { days: OverviewDay[] };

/** Calendar dates in the restaurant timezone, independent of the detailed report's date filter. */
export function overviewRange(period: OverviewPeriod, timezone: string, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:timezone, year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
  return {from:period==='day'?today:period==='month'?`${today.slice(0,7)}-01`:`${today.slice(0,4)}-01-01`, to:today};
}

/** Yearly points retain their daily source rows for the interactive breakdown. No averaged totals. */
export function overviewPoints(days: ReportData['days'], period: OverviewPeriod): OverviewPoint[] {
  if(period!=='year') return days.map(day=>({date:day.date,net:day.net,orders:day.orders,days:[]}));
  const months=new Map<string,OverviewPoint>();
  for(const day of days) {
    const key=`${day.date.slice(0,7)}-01`;
    let month=months.get(key);
    if(!month){month={date:key,net:0,orders:0,days:[]};months.set(key,month);}
    month.net+=day.net; month.orders+=day.orders;
    month.days.push({date:day.date,net:day.net,orders:day.orders});
  }
  return [...months.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
