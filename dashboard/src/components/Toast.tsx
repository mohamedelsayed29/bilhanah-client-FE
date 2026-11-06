import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BellRingingIcon, CheckCircleIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { useLanguage } from '../lib/language';

/** A button on the toast (e.g. "Open" on a new low rating); the toast closes when it is pressed. */
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; kind: 'success' | 'error' | 'notice'; message: string; action?: ToastAction };
type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  /** Something that needs a look (not a failure), announced politely and kept on screen a little longer. */
  notice: (message: string, action?: ToastAction) => void;
};
const ToastContext = createContext<ToastApi | null>(null);

/** Short notifications, announced politely (errors assertively) to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const { text } = useLanguage();
  const dismiss = useCallback((id: number) => setToasts(current => current.filter(toast => toast.id !== id)), []);
  const push = useCallback((kind: Toast['kind'], message: string, action?: ToastAction) => {
    const id = ++next.current;
    setToasts(current => [...current.filter(toast => toast.message !== message), { id, kind, message, action }].slice(-3));
    window.setTimeout(() => dismiss(id), kind === 'success' ? 4000 : kind === 'notice' ? 9000 : 7000);
  }, [dismiss]);
  const api = useMemo<ToastApi>(() => ({
    success: message => push('success', message),
    error: message => push('error', message),
    notice: (message, action) => push('notice', message, action),
  }), [push]);
  return <ToastContext.Provider value={api}>
    {children}
    <div className="toasts">
      <div className="toast-stack" aria-live="polite">
        {toasts.filter(toast => toast.kind !== 'error').map(toast => <ToastView key={toast.id} toast={toast} onClose={dismiss} closeLabel={text('إخفاء', 'Dismiss')} />)}
      </div>
      <div className="toast-stack" aria-live="assertive">
        {toasts.filter(toast => toast.kind === 'error').map(toast => <ToastView key={toast.id} toast={toast} onClose={dismiss} closeLabel={text('إخفاء', 'Dismiss')} />)}
      </div>
    </div>
  </ToastContext.Provider>;
}

function ToastView({ toast, onClose, closeLabel }: { toast: Toast; onClose: (id: number) => void; closeLabel: string }) {
  const Icon = toast.kind === 'success' ? CheckCircleIcon : toast.kind === 'notice' ? BellRingingIcon : WarningCircleIcon;
  return <div className={`toast toast-${toast.kind}`}>
    <Icon size={20} weight="fill" aria-hidden="true" />
    <span>{toast.message}</span>
    {toast.action && <button type="button" className="toast-action" onClick={() => { onClose(toast.id); toast.action!.onClick(); }}>{toast.action.label}</button>}
    <button type="button" className="icon-button" onClick={() => onClose(toast.id)} aria-label={closeLabel}><XIcon size={16} /></button>
  </div>;
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('ToastProvider is required');
  return context;
}
