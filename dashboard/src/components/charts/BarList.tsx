import type { ReactNode } from 'react';
import { percentages } from '../../lib/charts';
import { useLanguage } from '../../lib/language';

export type BarListItem = { key: string; label: ReactNode; hint?: ReactNode; value: number; icon?: ReactNode };

/**
 * Parts of a whole as labelled horizontal bars. Every number is text next to its bar,
 * so the list reads the same for screen readers; the bars themselves are decorative.
 */
export function BarList({ items, label, format }: { items: readonly BarListItem[]; label: string; format?: (value: number) => string }) {
  const { number } = useLanguage();
  const shares = percentages(items.map(item => item.value));
  const max = Math.max(1, ...items.map(item => item.value));
  const show = format ?? ((value: number) => number(value));
  return <ul className="bar-list" aria-label={label}>
    {items.map((item, index) => <li key={item.key} className="bar-list-item" data-testid={`bar-${item.key}`}>
      <div className="bar-list-head">
        {item.icon && <span className="bar-list-icon" aria-hidden="true">{item.icon}</span>}
        <span className="bar-list-label">{item.label}{item.hint && <small>{item.hint}</small>}</span>
        <span className="bar-list-value"><strong>{show(item.value)}</strong>
          <small>{number(shares[index]! / 100, { style: 'percent', maximumFractionDigits: 0 })}</small></span>
      </div>
      <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${item.value > 0 ? Math.max(1.5, (item.value / max) * 100) : 0}%` }} /></span>
    </li>)}
  </ul>;
}
