import { useState } from 'react';
import type { ComponentProps } from 'react';
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { useLanguage } from '../lib/language';

/** Password field with a show/hide toggle; forwards react-hook-form's `register` props. */
export function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  const { text } = useLanguage();
  return <div className="input-group">
    <input {...props} type={visible ? 'text' : 'password'} className="input ltr-input" dir="ltr" />
    <span className="input-trailing">
      <button type="button" className="icon-button password-toggle" onClick={() => setVisible(value => !value)}
        aria-label={visible ? text('إخفاء كلمة السر', 'Hide password') : text('إظهار كلمة السر', 'Show password')} aria-pressed={visible}>
        {visible ? <EyeSlashIcon size={20} /> : <EyeIcon size={20} />}
      </button>
    </span>
  </div>;
}
