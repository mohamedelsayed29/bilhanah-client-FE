import { useId } from 'react';
import type { ReactNode } from 'react';

type Props = { checked: boolean; onChange: (checked: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; className?: string };

/** A labelled on/off switch (role="switch"). */
export function Switch({ checked, onChange, label, description, disabled, className = '' }: Props) {
  const id = useId();
  return <div className={`switch-row ${className}`}>
    <div>
      <strong id={`${id}-label`}>{label}</strong>
      {description && <small id={`${id}-description`}>{description}</small>}
    </div>
    <button type="button" role="switch" className="switch" aria-checked={checked} aria-labelledby={`${id}-label`}
      aria-describedby={description ? `${id}-description` : undefined} disabled={disabled} onClick={() => onChange(!checked)} />
  </div>;
}
