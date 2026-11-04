import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { axisTicks, barHeight, barLayout, formatDay, labelIndexes, niceMax } from '../../lib/charts';
import { useLanguage } from '../../lib/language';

export type ChartSeries<Day> = {
  key: keyof Day & string;
  label: string;
  /** Full value, e.g. in the tooltip and the table ("١٬٢٠٠ ج.م"). */
  format: (value: number) => string;
  /** Short value for the axis ("١٫٢ ألف"). Defaults to `format`. */
  axisFormat?: (value: number) => string;
  /** The period's total, shown beside the panel title (already formatted). */
  total?: string;
};

type Props<Day extends { date: string }> = {
  days: readonly Day[];
  series: readonly ChartSeries<Day>[];
  /** Names the chart for screen readers and the data table. */
  label: string;
};

const PANEL_HEIGHT = 96;
const PANEL_TITLE = 34;
const PANEL_GAP = 18;
const AXIS_HEIGHT = 26;

/** Width of an element, kept current as the layout changes. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth || fallback);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.round(entry.contentRect.width) || fallback); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

/** A bar with rounded top corners, anchored to the baseline. */
function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

/**
 * Daily bars as small multiples: one panel per series, one shared date axis (never two
 * y-scales on one chart). Time runs in the reading direction (right to left in Arabic).
 * Hover, tap or arrow keys show a day's values; screen readers get the same data as a table.
 */
export function DailyChart<Day extends { date: string }>({ days, series, label }: Props<Day>) {
  const { text, locale, language } = useLanguage();
  const rtl = language === 'ar';
  const [wrapper, width] = useWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();
  // A new period or series starts without a highlighted day.
  const shape = `${days.length}:${days[0]?.date ?? ''}`;
  useEffect(() => setActive(null), [shape]);

  // Room for the longest axis label (about 6.5 px a character at 11 px).
  const longest = Math.max(1, ...series.map(entry => {
    const top = niceMax(Math.max(0, ...days.map(day => Number(day[entry.key]) || 0)));
    return (entry.axisFormat ?? entry.format)(top).length;
  }));
  const GUTTER = Math.min(84, Math.max(32, Math.round(longest * 6.5) + 12));
  const plotWidth = Math.max(width - GUTTER, 40);
  const plotStart = rtl ? 0 : GUTTER;
  const bars = barLayout(days.length, plotWidth, { gap: days.length > 45 ? 1 : days.length > 14 ? 2 : 6, rtl });
  const panelSpan = PANEL_TITLE + PANEL_HEIGHT + PANEL_GAP;
  const height = series.length * panelSpan - PANEL_GAP + AXIS_HEIGHT;
  const labels = new Set(labelIndexes(days.length, Math.max(2, Math.floor(plotWidth / 72))));
  const dayLabel = (date: string) => formatDay(date, locale);

  const indexAt = (clientX: number, element: Element) => {
    const box = element.getBoundingClientRect();
    const x = clientX - box.left - plotStart;
    if (x < 0 || x > plotWidth || days.length === 0) return null;
    const slot = Math.min(days.length - 1, Math.floor((x / plotWidth) * days.length));
    return rtl ? days.length - 1 - slot : slot;
  };
  const onPointer = (event: PointerEvent<SVGSVGElement>) => setActive(indexAt(event.clientX, event.currentTarget));
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (days.length === 0) return;
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    const current = active ?? days.length - 1;
    let next: number | null = null;
    if (event.key === forward) next = Math.min(days.length - 1, active === null ? current : current + 1);
    else if (event.key === backward) next = Math.max(0, active === null ? current : current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = days.length - 1;
    else if (event.key === 'Escape') { setActive(null); return; }
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  };

  const activeBar = active === null ? undefined : bars[active];
  const activeDay = active === null ? undefined : days[active];
  const tooltipX = activeBar ? plotStart + activeBar.x + activeBar.width / 2 : 0;
  // Keep the tooltip inside the chart near its edges.
  const tooltipCenter = Math.min(Math.max(tooltipX, 84), Math.max(84, width - 84));

  return <figure className="daily-chart">
    <div ref={wrapper} className="daily-chart-plot" role="img" tabIndex={0} onKeyDown={onKey} onBlur={() => setActive(null)}
      aria-label={text(`${label}. التفاصيل في الجدول اللي بعده. استخدم الأسهم عشان تشوف كل يوم.`, `${label}. Details are in the table that follows. Use the arrow keys to see each day.`)}
>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false"
        onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null); }}>
        {series.map((entry, panel) => {
          const values = days.map(day => Number(day[entry.key]) || 0);
          const ticks = axisTicks(Math.max(0, ...values));
          const top = niceMax(Math.max(0, ...values));
          const y0 = panel * panelSpan + PANEL_TITLE;
          const axisFormat = entry.axisFormat ?? entry.format;
          return <g key={entry.key}>
            <text className="chart-panel-title" x={rtl ? width : 0} y={y0 - 18} textAnchor="start" direction={rtl ? 'rtl' : 'ltr'}>{entry.label}{entry.total && <tspan className="chart-panel-total" dx="8">{entry.total}</tspan>}</text>
            {[ticks[0]!, ticks[Math.floor(ticks.length / 2)]!, ticks.at(-1)!].filter((tick, index, all) => all.indexOf(tick) === index).map(tick => {
              const y = y0 + PANEL_HEIGHT - (tick / top) * PANEL_HEIGHT;
              return <g key={tick}>
                <line className={tick === 0 ? 'chart-baseline' : 'chart-grid'} x1={plotStart} x2={plotStart + plotWidth} y1={y} y2={y} />
                <text className="chart-axis" x={rtl ? plotWidth + 6 : GUTTER - 6} y={y} dy="0.35em" style={{ textAnchor: rtl ? 'start' : 'end' }} direction="ltr">
                  {tick === 0 ? (rtl ? '٠' : '0') : axisFormat(tick)}
                </text>
              </g>;
            })}
            {bars.map(bar => {
              const value = values[bar.index] ?? 0;
              const h = barHeight(value, top, PANEL_HEIGHT);
              if (h <= 0) return null;
              return <path key={bar.index} className={`chart-bar ${active !== null && active !== bar.index ? 'is-dimmed' : ''}`}
                d={barPath(plotStart + bar.x, y0 + PANEL_HEIGHT - h, bar.width, h)} />;
            })}
          </g>;
        })}
        {activeBar && <line className="chart-guide" x1={tooltipX} x2={tooltipX} y1={PANEL_TITLE - 4} y2={height - AXIS_HEIGHT} />}
        {bars.filter(bar => labels.has(bar.index)).map(bar => <text key={bar.index} className="chart-axis" x={plotStart + bar.x + bar.width / 2} y={height - 8}
          style={{ textAnchor: 'middle' }}>{dayLabel(days[bar.index]!.date)}</text>)}
      </svg>
      {activeDay && <div className="chart-tooltip" aria-hidden="true" data-testid="chart-tooltip"
        style={{ insetInlineStart: rtl ? width - tooltipCenter : tooltipCenter }}>
        <strong>{formatDay(activeDay.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
        {series.map(entry => <span key={entry.key}>{entry.label}: <b>{entry.format(Number(activeDay[entry.key]) || 0)}</b></span>)}
      </div>}
    </div>
    {/* A table ignores the 1px box of .visually-hidden, so a wrapper hides it. */}
    <div className="visually-hidden"><table id={tableId}>
      <caption>{label}</caption>
      <thead><tr><th scope="col">{text('اليوم', 'Day')}</th>{series.map(entry => <th scope="col" key={entry.key}>{entry.label}</th>)}</tr></thead>
      <tbody>{days.map(day => <tr key={day.date}>
        <th scope="row">{formatDay(day.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</th>
        {series.map(entry => <td key={entry.key}>{entry.format(Number(day[entry.key]) || 0)}</td>)}
      </tr>)}</tbody>
    </table></div>
  </figure>;
}
