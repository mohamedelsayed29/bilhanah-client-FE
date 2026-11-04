import type { HTMLAttributes, ReactNode } from 'react';

type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /** Id of the heading, for aria-labelledby. */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Shown at the end of the heading row (a link or a small button). */
  actions?: ReactNode;
  /** Heading level inside the page (h2 by default). */
  level?: 2 | 3;
};

/** A titled part of a page: a heading over a hairline, with no box around it. */
export function Section({ id, title, description, actions, level = 2, className = '', children, ...rest }: Props) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return <section className={`section ${className}`} aria-labelledby={id} {...rest}>
    <div className="section-head">
      <div><Heading id={id}>{title}</Heading>{description && <p>{description}</p>}</div>
      {actions}
    </div>
    {children}
  </section>;
}
