import type { ReactNode } from 'react';

/** Page heading; the h1 receives focus after navigation (see useRouteFocus). */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <header className="page-header">
    <div>
      <h1 tabIndex={-1} data-page-title>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>;
}
