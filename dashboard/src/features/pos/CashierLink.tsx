import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowSquareOutIcon, CheckIcon, CopyIcon, LinkSimpleIcon, UserPlusIcon, WhatsappLogoIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';

/** The address of the POS on its own (no dashboard around it), for a cashier's device. */
export const CASHIER_PATH = '/manager/terminal';

/**
 * The cashier link: the owner or a manager copies it, or sends it on WhatsApp, to whoever runs the till.
 * Whoever opens it signs in with their own staff account (with the POS permission) and gets only the POS.
 */
export function CashierLink() {
  const { text } = useLanguage();
  const { role, can, workspace } = useCashierContext();
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${CASHIER_PATH}`;
  const message = text(`ده رابط شاشة الكاشير بتاعة ${workspace}:\n${url}\nادخل بحساب الموظف بتاعك.`, `Here is the POS link for ${workspace}:\n${url}\nSign in with your staff account.`);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* The address is selectable in the field. */ }
  };
  const team = `${role === 'OWNER' ? '/settings/kitchen' : '/manager/staff'}?new=CASHIER`;
  return <section className="card pos-link" aria-labelledby="pos-link-title" data-testid="pos-cashier-link">
    <div className="pos-link-head">
      <span className="pos-link-icon" aria-hidden="true"><LinkSimpleIcon size={22} weight="bold" /></span>
      <div>
        <h2 id="pos-link-title">{text('رابط الكاشير', 'Cashier link')}</h2>
        <p className="pos-muted">{text('ابعته للكاشير يفتح شاشة الكاشير بس، على جهاز مسجّل للمطعم. بيدخل بحسابه أو بالـ PIN بتاعه.', 'Send it to your cashier to open just the POS, on a device registered to the restaurant. They sign in with their account or their PIN.')}</p>
      </div>
    </div>
    <div className="pos-link-row">
      <input className="input ltr pos-link-url" dir="ltr" readOnly value={url} onFocus={event => event.currentTarget.select()} aria-label={text('رابط الكاشير', 'Cashier link')} data-testid="pos-cashier-url" />
      <button type="button" className="button button-primary" onClick={() => void copy()}>{copied ? <CheckIcon size={18} aria-hidden="true" /> : <CopyIcon size={18} aria-hidden="true" />}{copied ? text('اتنسخ', 'Copied') : text('انسخ', 'Copy')}</button>
      <a className="button button-secondary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><WhatsappLogoIcon size={18} aria-hidden="true" />{text('ابعته واتساب', 'Send on WhatsApp')}</a>
      <a className="button button-secondary" href={CASHIER_PATH} target="_blank" rel="noopener"><ArrowSquareOutIcon size={18} aria-hidden="true" />{text('افتحه', 'Open')}</a>
    </div>
    {can('staff.manage') && <div className="pos-link-foot"><Link className="button button-secondary" to={team}><UserPlusIcon size={18} aria-hidden="true" />{text('اعمل حساب كاشير', 'Create a cashier account')}</Link><span className="pos-muted">{text('بنولّدلك كلمة سر قوية، وبعد ما يتعمل بتبعت البيانات بضغطة.', 'We generate a strong password, and you send the details in one tap once it is made.')}</span></div>}
  </section>;
}

function useCashierContext() {
  const workspace = useWorkspace();
  return { role: workspace.role, can: workspace.can, workspace: workspace.restaurant.name };
}
