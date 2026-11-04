import { Fragment } from 'react';
import type { ReactNode } from 'react';

/**
 * The second line of a table row on phones: the row's secondary cells as one run of text
 * ("Tanta · joined 23/10/2026"), so it wraps like a sentence instead of stacking label/value pairs.
 * Wide screens show the real columns instead (the cell is hidden there, and they are hidden here).
 * The separator is glued to the part before it, so a line never starts with "·".
 */
export function CompactMeta({ parts, colSpan }: { parts: ReactNode[]; colSpan?: number }) {
  const shown = parts.filter(part => part !== null && part !== undefined && part !== false && part !== '');
  return <td className="cell-compact" colSpan={colSpan}>
    {shown.map((part, index) => <Fragment key={index}>{index > 0 && <span aria-hidden="true">{' · '}</span>}<span className="compact-part">{part}</span></Fragment>)}
  </td>;
}
