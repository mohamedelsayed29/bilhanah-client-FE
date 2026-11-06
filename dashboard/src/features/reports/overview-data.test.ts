import { describe,it,expect } from 'vitest';
import type { ReportData } from '@bilhanah/contracts';
import { overviewPoints,overviewRange } from './overview-data';

describe('report overview periods and aggregation',()=>{
  it('uses the restaurant local date at a UTC month/year boundary',()=>{
    const now=new Date('2026-12-31T23:00:00Z');
    expect(overviewRange('day','Africa/Cairo',now)).toEqual({from:'2027-01-01',to:'2027-01-01'});
    expect(overviewRange('year','America/New_York',now)).toEqual({from:'2026-01-01',to:'2026-12-31'});
    expect(overviewRange('month','Africa/Cairo',new Date('2024-02-29T10:00:00Z'))).toEqual({from:'2024-02-01',to:'2024-02-29'});
  });
  it('sums daily rows into separate calendar months and retains daily figures, including zero days',()=>{
    const days=[{date:'2026-01-31',net:1500,orders:2},{date:'2026-02-01',net:2000,orders:3},{date:'2026-02-02',net:0,orders:0},{date:'2026-02-03',net:3500,orders:1}] as ReportData['days'];
    const points=overviewPoints(days,'year');
    expect(points.map(p=>({date:p.date,net:p.net,orders:p.orders}))).toEqual([{date:'2026-01-01',net:1500,orders:2},{date:'2026-02-01',net:5500,orders:4}]);
    expect(points[1]!.days).toHaveLength(3);
    expect(points[1]!.days[1]).toEqual({date:'2026-02-02',net:0,orders:0});
    expect(overviewPoints(days,'month')).toHaveLength(4);
  });
});
