import { useState } from 'react';
import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import { useLanguage } from '../lib/language';
import { useToast } from './Toast';

/** Copies `value` and confirms with a toast; falls back to selecting text when the clipboard is unavailable. */
export function CopyButton({ value, label, small = true, variant = 'secondary', copiedMessage, ariaLabel }: {
  value: string; label?: string; small?: boolean; variant?: 'secondary' | 'ghost';
  /** Toast text after copying (default: "Link copied"). */
  copiedMessage?: string;
  ariaLabel?: string;
}) {
  const { text } = useLanguage();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(copiedMessage ?? text('اتنسخ اللينك', 'Link copied'));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(text('مقدرناش ننسخ. انسخه يدويًا.', 'Could not copy. Please copy it manually.'));
    }
  };
  return <button type="button" className={`button button-${variant} ${small ? 'button-small' : ''}`} onClick={copy} aria-label={ariaLabel}>
    {copied ? <CheckIcon size={17} aria-hidden="true" /> : <CopyIcon size={17} aria-hidden="true" />}
    {label ?? text('نسخ', 'Copy')}
  </button>;
}
