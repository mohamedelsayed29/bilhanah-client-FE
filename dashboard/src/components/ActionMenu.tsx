import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ActionMenuItem = { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean };

/**
 * A button that opens a short list of actions (a "⋮" or "More" menu). Arrow keys move between the
 * actions, Escape or a click outside closes it, and focus goes back to the button.
 */
export function ActionMenu({ label, trigger, items, className = '', align = 'end' }: {
  /** The button's accessible name, e.g. "More actions for T-3". */
  label: string;
  trigger: ReactNode;
  items: ActionMenuItem[];
  className?: string;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const entries = () => [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];

  useEffect(() => {
    if (!open) return;
    entries()[0]?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = () => { setOpen(false); button.current?.focus(); };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const list = entries();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(index + (event.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
  };

  return <div ref={root} className={`action-menu ${className}`} onKeyDown={open ? onKeyDown : undefined}>
    <button ref={button} type="button" className="action-menu-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(value => !value)}>{trigger}</button>
    {open && <div id={menuId} role="menu" aria-label={label} className={`action-menu-list action-menu-${align}`}>
      {items.map(item => <button key={item.label} type="button" role="menuitem" disabled={item.disabled} className={item.danger ? 'is-danger' : undefined}
        onClick={() => { setOpen(false); button.current?.focus(); item.onSelect(); }}>
        {item.icon}<span>{item.label}</span>
      </button>)}
    </div>}
  </div>;
}
