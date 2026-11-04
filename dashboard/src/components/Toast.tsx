import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircleIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { useLanguage } from '../lib/language';

type Toast = { id: number; kind: 'success' | 'error'; message: string };
type ToastApi = { success: (message: string) => void; error: (message: string) => void };
const ToastContext = createContext<ToastApi | null>(null);

/** Short notifications, announced politely (errors assertively) to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const { text } = useLanguage();
  const dismiss = useCallback((id: number) => setToasts(current => current.filter(toast => toast.id !== id)), []);
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++next.current;
    setToasts(current => [...current.filter(toast => toast.message !== message), { id, kind, message }].slice(-3));
    window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
  }, [dismiss]);
  const api = useMemo<ToastApi>(() => ({ success: message => push('success', message), error: message => push('error', message) }), [push]);
  return <ToastContext.Provider value={api}>
    {children}
    <div className="toasts">
      <div className="toast-stack" aria-live="polite">
        {toasts.filter(toast => toast.kind === 'success').map(toast => <ToastView key={toast.id} toast={toast} onClose={dismiss} closeLabel={text('إخفاء', 'Dismiss')} />)}
      </div>
      <div className="toast-stack" aria-live="assertive">
        {toasts.filter(toast => toast.kind === 'error').map(toast => <ToastView key={toast.id} toast={toast} onClose={dismiss} closeLabel={text('إخفاء', 'Dismiss')} />)}
      </div>
    </div>
  </ToastContext.Provider>;
}

function ToastView({ toast, onClose, closeLabel }: { toast: Toast; onClose: (id: number) => void; closeLabel: string }) {
  return <div className={`toast toast-${toast.kind}`}>
    {toast.kind === 'success' ? <CheckCircleIcon size={20} weight="fill" aria-hidden="true" /> : <WarningCircleIcon size={20} weight="fill" aria-hidden="true" />}
    <span>{toast.message}</span>
    <button type="button" className="icon-button" onClick={() => onClose(toast.id)} aria-label={closeLabel}><XIcon size={16} /></button>
  </div>;
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('ToastProvider is required');
  return context;
}
