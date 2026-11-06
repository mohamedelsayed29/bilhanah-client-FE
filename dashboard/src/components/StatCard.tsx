import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Icon } from '@phosphor-icons/react';

export type StatTone = 'muted' | 'success' | 'warning' | 'danger' | 'info' | 'guava';

/** One headline figure: an icon, the label, the value and a line on what it means; opens what is behind it. */
export function StatCard({ to, onClick, icon: IconComponent, tone, label, value, note, active, testId }: {
  to?: string; onClick?: () => void; icon: Icon; tone: StatTone; label: string; value: ReactNode; note: ReactNode; active?: boolean; testId?: string;
}) {
  const body = <>
    <span className="inv-stat-icon" aria-hidden="true"><IconComponent size={20} weight="duotone" /></span>
    <span className="inv-stat-label">{label}</span>
    <strong className="inv-stat-value">{value}</strong>
    <small className="inv-stat-note">{note}</small>
  </>;
  const className = `inv-stat tone-${tone} ${active ? 'is-active' : ''}`;
  if (to) return <Link to={to} className={className} data-testid={testId}>{body}</Link>;
  if (onClick) return <button type="button" className={className} onClick={onClick} aria-pressed={active} data-testid={testId}>{body}</button>;
  return <div className={className} data-testid={testId}>{body}</div>;
}
