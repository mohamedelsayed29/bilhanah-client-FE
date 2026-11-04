import { cloneElement, isValidElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { WarningCircleIcon } from '@phosphor-icons/react';
import type { FieldError } from 'react-hook-form';
import { fieldErrorText } from '../lib/forms';
import { useLanguage } from '../lib/language';

export type ControlProps = { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; 'aria-required'?: boolean };
type Props = {
  label: ReactNode;
  /** The control, or a function that places the control props itself (e.g. inside an input group). */
  children: ReactElement<Partial<ControlProps>> | ((control: ControlProps) => ReactNode);
  hint?: ReactNode;
  error?: FieldError | { message?: string };
  optional?: boolean;
  required?: boolean;
  className?: string;
  /** Extra ids the control is described by (e.g. a live status line). */
  describedBy?: string;
};

/** Label, control, hint and translated error, wired together with ids for screen readers. */
export function Field({ label, children, hint, error, optional, required, className = '', describedBy }: Props) {
  const id = useId();
  const { text } = useLanguage();
  const controlId = (isValidElement(children) ? children.props.id : undefined) ?? `${id}-control`;
  const hintId = hint ? `${id}-hint` : undefined;
  const message = fieldErrorText(error, text);
  const errorId = message ? `${id}-error` : undefined;
  const control: ControlProps = {
    id: controlId,
    'aria-invalid': message ? true : undefined,
    'aria-describedby': [describedBy, hintId, errorId].filter(Boolean).join(' ') || undefined,
    'aria-required': required || undefined,
  };
  return <div className={`field ${className}`}>
    <label className="field-label" htmlFor={controlId}>{label}{optional && <span className="optional">{text('(اختياري)', '(optional)')}</span>}</label>
    {typeof children === 'function' ? children(control) : cloneElement(children, control)}
    {hint && <p className="field-hint" id={hintId}>{hint}</p>}
    {message && <p className="field-error" id={errorId}><WarningCircleIcon size={15} weight="fill" aria-hidden="true" />{message}</p>}
  </div>;
}
