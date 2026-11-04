import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline' | 'guava';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement>; variant?: Variant; small?: boolean; block?: boolean; loading?: boolean; icon?: ReactNode };

/** Pill button in the brand style; `loading` keeps its width and announces the busy state. */
export function Button({ variant = 'primary', small, block, loading, icon, className = '', children, disabled, type = 'button', ...rest }: Props) {
  const classes = ['button', `button-${variant}`, small && 'button-small', block && 'button-block', className].filter(Boolean).join(' ');
  return <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
    {loading ? <span className="spinner" aria-hidden="true" /> : icon}
    {children}
  </button>;
}
