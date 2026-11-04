import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { SignOutIcon } from '@phosphor-icons/react';
import { useLanguage } from '../lib/language';
import { Button } from './Button';
import { Dialog } from './Dialog';

/** Asks before signing out. Confirming goes to /logout, which ends the session. */
function SignOutDialog({ open, onCancel, onConfirm, note }: { open: boolean; onCancel: () => void; onConfirm: () => void; note?: ReactNode }) {
  const { text } = useLanguage();
  const cancel = onCancel;
  return <Dialog open={open} onClose={cancel} size="small" title={text('تسجيل الخروج', 'Sign out')}
    footer={<>
      <Button variant="secondary" onClick={cancel} data-autofocus>{text('إلغاء', 'Cancel')}</Button>
      <Button onClick={onConfirm} icon={<SignOutIcon size={18} weight="bold" className="directional" aria-hidden="true" />}>{text('اخرج', 'Sign out')}</Button>
    </>}>
    <div className="signout-body">
      <span className="signout-icon" aria-hidden="true"><SignOutIcon size={26} weight="bold" className="directional" /></span>
      <p className="signout-question">{text('متأكد إنك عايز تخرج؟', 'Are you sure you want to sign out?')}</p>
      <p className="signout-note">{note ?? text('هتخرج من حسابك على الجهاز ده، وتقدر تدخل تاني في أي وقت بالإيميل وكلمة السر.', 'You will be signed out on this device. You can sign back in any time with your email and password.')}</p>
    </div>
  </Dialog>;
}

/**
 * A sign-out control that confirms first: pass `ask` as the button's onClick (the dialog grows out
 * of that button), and render `dialog` once.
 */
export function useSignOut(note?: ReactNode) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ask = () => setOpen(true);
  const dialog = <SignOutDialog open={open} note={note} onCancel={() => setOpen(false)} onConfirm={() => { setOpen(false); navigate('/logout'); }} />;
  return { ask, dialog };
}
