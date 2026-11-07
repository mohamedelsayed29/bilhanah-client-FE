import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { axisTicks } from '../../../lib/charts';
import { useLanguage } from '../../../lib/language';

export type SalesPoint = { key: string; label: string; value: number; tooltip: string };

const HEIGHT = 250;
const PAD = { top: 34, bottom: 34, start: 46, end: 14 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry!.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A smooth line through the points that never overshoots them (monotone cubic, Fritsch–Carlson). */
export function smoothPath(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0]!.x},${points[0]!.y}`;
  const n = points.length;
  const dx = points.slice(1).map((point, index) => point.x - points[index]!.x);
  const slopes = points.slice(1).map((point, index) => (point.y - points[index]!.y) / (dx[index] || 1));
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0]!;
    if (index === n - 1) return slopes[n - 2]!;
    const a = slopes[index - 1]!;
    const b = slopes[index]!;
    return a * b <= 0 ? 0 : (3 * (dx[index - 1]! + dx[index]!)) / ((2 * dx[index]! + dx[index - 1]!) / a + (dx[index]! + 2 * dx[index - 1]!) / b);
  });
  let path = `M${points[0]!.x},${points[0]!.y}`;
  for (let index = 0; index < n - 1; index += 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    const third = dx[index]! / 3;
    path += ` C${from.x + third},${from.y + tangents[index]! * third} ${to.x - third},${to.y - tangents[index + 1]! * third} ${to.x},${to.y}`;
  }
  return path;
}

/**
 * Sales over the period as a soft area under a smooth line, dashed guides, and a dark tooltip on the
 * point under the pointer (the peak until then). Arrow keys move between points; the figures are
 * also in a visually hidden table.
 */
export function SalesChart({ points, label, axisFormat }: { points: readonly SalesPoint[]; label: string; axisFormat: (value: number) => string }) {
  const { language } = useLanguage();
  const id = useId();
  const [ref, width] = useWidth<HTMLDivElement>();
  const peak = points.reduce((best, point, index) => (point.value > (points[best]?.value ?? -1) ? index : best), 0);
  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? peak;
  const ticks = axisTicks(Math.max(...points.map(point => point.value), 0));
  const top = ticks.at(-1) || 1;
  const rtl = language === 'ar';
  const plotWidth = width - PAD.start - PAD.end;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const xAt = (index: number) => {
    const share = points.length > 1 ? index / (points.length - 1) : 0.5;
    return rtl ? PAD.end + (1 - share) * plotWidth : PAD.start + share * plotWidth;
  };
  const yAt = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;
  const coords = points.map((point, index) => ({ x: xAt(index), y: yAt(point.value) }));
  const line = smoothPath(coords);
  const base = PAD.top + plotHeight;
  const area = coords.length ? `${line} L${coords.at(-1)!.x},${base} L${coords[0]!.x},${base} Z` : '';
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotWidth / 78))));
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    let nearest = 0;
    coords.forEach((point, index) => { if (Math.abs(point.x - x) < Math.abs(coords[nearest]!.x - x)) nearest = index; });
    setActive(nearest);
  };
  const keys = (event: KeyboardEvent) => {
    const step = (event.key === 'ArrowRight') !== rtl ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    setActive(Math.min(points.length - 1, Math.max(0, shown + step)));
  };
  const point = points[shown];
  const at = coords[shown];
  const axisX = rtl ? width - PAD.start + 10 : PAD.start - 10;
  return <div className="sales-chart" ref={ref}>
    <svg width={width} height={HEIGHT} role="img" aria-labelledby={`${id}-title`} tabIndex={0} onKeyDown={keys}
      onPointerMove={pick} onPointerLeave={() => setActive(null)} data-testid="sales-chart">
      <title id={`${id}-title`}>{label}</title>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--ov-orange)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--ov-orange)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map(tick => <g key={tick}>
        <line className="sales-grid" x1={rtl ? PAD.end : PAD.start} x2={rtl ? width - PAD.start : width - PAD.end} y1={yAt(tick)} y2={yAt(tick)} />
        <text className="sales-axis" x={axisX} y={yAt(tick)} dy="0.35em" textAnchor={rtl ? 'start' : 'end'} direction="ltr">{axisFormat(tick)}</text>
      </g>)}
      {points.map((entry, index) => index % every === 0
        ? <text key={entry.key} className="sales-axis" x={coords[index]!.x} y={HEIGHT - 8} textAnchor="middle">{entry.label}</text> : null)}
      <path d={area} fill={`url(#${id}-fill)`} />
      <path d={line} className="sales-line" />
      {point && at && <g className="sales-tip" aria-hidden="true">
        <line className="sales-tip-guide" x1={at.x} x2={at.x} y1={at.y} y2={base} />
        <circle cx={at.x} cy={at.y} r={6} className="sales-dot" />
        <TipBubble x={at.x} y={at.y} text={point.tooltip} min={4} max={width - 4} />
      </g>}
    </svg>
    <table className="visually-hidden"><caption>{label}</caption><tbody>{points.map(entry => <tr key={entry.key}><th scope="row">{entry.label}</th><td>{entry.tooltip}</td></tr>)}</tbody></table>
  </div>;
}

/** The dark pill over the point, kept inside the chart. */
function TipBubble({ x, y, text, min, max }: { x: number; y: number; text: string; min: number; max: number }) {
  const width = Math.max(52, text.length * 8 + 24);
  const left = Math.min(max - width, Math.max(min, x - width / 2));
  const top = Math.max(2, y - 46);
  return <g>
    <rect x={left} y={top} width={width} height={30} rx={15} className="sales-tip-box" />
    {top + 30 < y - 4 && <path d={`M${x - 6},${top + 29} L${x},${top + 36} L${x + 6},${top + 29} Z`} className="sales-tip-box" />}
    <text x={left + width / 2} y={top + 15} dy="0.35em" textAnchor="middle" className="sales-tip-text">{text}</text>
  </g>;
}
