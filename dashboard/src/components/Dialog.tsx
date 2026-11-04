import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { type DialogSnapshot, dialogOrigin, dropBack, dropIn, originRect, snapshotDialog, squeeze } from '../lib/drop-motion';
import { useLanguage } from '../lib/language';

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'small' | 'default' | 'wide';
  /** Prevent closing (e.g. while saving). */
  busy?: boolean;
  /** Wraps body and footer in a form, so Enter submits. */
  onSubmit?: () => void;
};

/**
 * Native modal <dialog>: focus is trapped and returned by the browser, Escape closes,
 * and the page behind is inert. Becomes a full-screen sheet on phones. Every dialog grows out of
 * the button that opened it like a drop, and drops back into it when it closes (drop-motion.ts).
 */
export function Dialog({ open, onClose, title, children, footer, size = 'default', busy, onSubmit }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { text } = useLanguage();
  const origin = useRef<HTMLElement | null>(null);
  // The closing dialog drops back into its button as a copy. A dialog that unmounts is still on the
  // page in this layout cleanup; one closed through `open` has already lost its content, so a copy is
  // also taken whenever something inside is pressed (Cancel, the close button, Escape, Save).
  const snapshot = useRef<DialogSnapshot | null>(null);
  const takeSnapshot = () => { if (ref.current?.open) snapshot.current = snapshotDialog(ref.current); };
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const openedAt = performance.now();
    snapshot.current = null;
    return () => {
      // Not for the instant remount of React's development checks.
      if (performance.now() - openedAt < 150) return;
      const live = dialog.isConnected && dialog.open && dialog.querySelector('.dialog-body')?.childElementCount ? snapshotDialog(dialog) : null;
      const copy = live ?? snapshot.current;
      if (copy) dropBack(copy, origin.current);
    };
  }, [open]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    origin.current = dialogOrigin();
    dialog.showModal();
    // React's autoFocus runs before showModal(); focus the intended control afterwards.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    squeeze(origin.current);
    dropIn(dialog, originRect(origin.current));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  const content = <>
    <div className="dialog-body">{children}</div>
    {footer && <div className="dialog-footer">{footer}</div>}
  </>;
  return <dialog ref={ref} className={`dialog ${size === 'default' ? '' : `dialog-${size}`}`} aria-labelledby={titleId}
    onPointerDownCapture={takeSnapshot} onKeyDownCapture={takeSnapshot}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="dialog-header">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label={text('إغلاق', 'Close')}><XIcon size={20} /></button>
    </div>
    {onSubmit
      ? <form noValidate onSubmit={event => { event.preventDefault(); onSubmit(); }} style={{ display: 'contents' }}>{content}</form>
      : content}
  </dialog>;
}
