import type { ReactNode } from 'react';

export function AuthCard({ icon, tone, title, description, children }: { icon?: ReactNode; tone?: 'success' | 'danger'; title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return <section className="auth-card">
    <header className="auth-card-header">
      {icon && <span className={`auth-icon ${tone ? `auth-icon-${tone}` : ''}`} aria-hidden="true">{icon}</span>}
      <h1 tabIndex={-1} data-page-title>{title}</h1>
      {description && <p>{description}</p>}
    </header>
    {children}
  </section>;
}
