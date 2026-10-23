import type { ReactNode } from 'react';

/** The dark band that opens every inner page and sits beneath the transparent header. */
export function PageHero({ eyebrow, title, lead, children, compact = false }: { eyebrow?: string; title: ReactNode; lead?: ReactNode; children?: ReactNode; compact?: boolean }) {
  return <section className={`page-hero ${compact ? 'page-hero-compact' : ''}`} aria-labelledby="page-title">
    <div className="page-container page-hero-inner">
      {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
      <h1 id="page-title">{title}</h1>
      {lead && <p className="page-lead">{lead}</p>}
      {children}
    </div>
  </section>;
}
