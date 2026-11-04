import type { ReactNode } from 'react';
import { QuestionIcon, WarningIcon } from '@phosphor-icons/react';
import { useLanguage } from '../lib/language';
import { Button } from './Button';
import { Dialog } from './Dialog';

type Props = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** `primary` for confirmations that are not destructive (e.g. approving a payment). */
  tone?: 'danger' | 'primary';
  children?: ReactNode;
};

/** In-app confirmation for destructive actions (never window.confirm). */
export function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel, busy, tone = 'danger', children }: Props) {
  const { text } = useLanguage();
  return <Dialog open={open} onClose={onCancel} title={title} size="small" busy={busy}
    footer={<>
      <Button variant="secondary" onClick={onCancel} disabled={busy} data-autofocus>{text('إلغاء', 'Cancel')}</Button>
      <Button variant={tone} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
    </>}>
    <div className={`confirm-body ${tone === 'primary' ? 'confirm-primary' : ''}`}>
      <span className="confirm-icon" aria-hidden="true">{tone === 'primary' ? <QuestionIcon size={22} weight="bold" /> : <WarningIcon size={22} weight="bold" />}</span>
      <div><p>{description}</p>{children}</div>
    </div>
  </Dialog>;
}
