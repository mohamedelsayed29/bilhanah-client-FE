import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId, useState } from 'react';
import { EyeIcon, EyeSlashIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';

type FieldProps = {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  /** Content shown after the input inside the control row (e.g. a suffix). */
  adornment?: ReactNode;
};

function FieldShell({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="field-optional"> ({t('common.optional')})</span>}
      </label>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          <WarningCircleIcon size={16} aria-hidden />
          {error}
        </p>
      ) : (
        hint && (
          <p className="field-hint" id={`${id}-hint`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export const TextField = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ label, hint, error, optional, adornment, ...input }, ref) {
    const id = useId();
    return (
      <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
        {/* A suffix such as ".bilhanah.com" must follow the text in the input's own direction. */}
        <div className="control" dir={adornment ? input.dir : undefined}>
          <input
            ref={ref}
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, error, hint)}
            {...input}
          />
          {adornment}
        </div>
      </FieldShell>
    );
  },
);

export const PasswordField = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(
  function PasswordField({ label, hint, error, ...input }, ref) {
    const id = useId();
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);
    return (
      <FieldShell id={id} label={label} hint={hint} error={error}>
        <div className="control">
          <input
            ref={ref}
            id={id}
            type={visible ? 'text' : 'password'}
            dir="ltr"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, error, hint)}
            {...input}
          />
          <button
            type="button"
            className="control-action"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? t('common.hidePassword') : t('common.showPassword')}
            aria-pressed={visible}
          >
            {visible ? <EyeSlashIcon size={20} aria-hidden /> : <EyeIcon size={20} aria-hidden />}
          </button>
        </div>
      </FieldShell>
    );
  },
);

export const SelectField = forwardRef<HTMLSelectElement, FieldProps & SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectField({ label, hint, error, children, ...select }, ref) {
    const id = useId();
    return (
      <FieldShell id={id} label={label} hint={hint} error={error}>
        <div className="control">
          <select ref={ref} id={id} aria-describedby={describedBy(id, error, hint)} {...select}>
            {children}
          </select>
        </div>
      </FieldShell>
    );
  },
);
