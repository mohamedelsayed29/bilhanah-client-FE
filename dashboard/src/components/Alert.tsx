import type { ReactNode } from 'react';
import { CheckCircleIcon, InfoIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';

type Kind = 'error' | 'warning' | 'success' | 'info';
const ICONS = { error: WarningCircleIcon, warning: WarningIcon, success: CheckCircleIcon, info: InfoIcon } as const;

export function Alert({ kind, title, children, actions, live = true }: { kind: Kind; title?: ReactNode; children?: ReactNode; actions?: ReactNode; live?: boolean }) {
  const Icon = ICONS[kind];
  return <div className={`alert alert-${kind}`} role={live ? (kind === 'error' ? 'alert' : 'status') : undefined}>
    <Icon size={20} weight="fill" aria-hidden="true" />
    <div className="alert-body">
      {title && <strong>{title}</strong>}
      {children && <div>{children}</div>}
      {actions && <div className="alert-actions">{actions}</div>}
    </div>
  </div>;
}
