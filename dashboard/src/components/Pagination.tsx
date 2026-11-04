import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useLanguage } from '../lib/language';

/** Previous / next with "Page 2 of 5 · 93 results". Arrows follow the reading direction. */
export function Pagination({ page, pageSize, total, onChange, label }: { page: number; pageSize: number; total: number; onChange: (page: number) => void; label: string }) {
  const { text, number, language } = useLanguage();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize && page === 1) return null;
  const Previous = language === 'ar' ? CaretRightIcon : CaretLeftIcon;
  const Next = language === 'ar' ? CaretLeftIcon : CaretRightIcon;
  return <nav className="pagination" aria-label={label}>
    <button type="button" className="button button-secondary button-small" disabled={page <= 1} onClick={() => onChange(page - 1)}>
      <Previous size={16} aria-hidden="true" />{text('السابق', 'Previous')}
    </button>
    <span className="pagination-status" aria-live="polite">
      {text(`صفحة ${number(page)} من ${number(pages)}`, `Page ${page} of ${pages}`)}
      <small> · {text(`${number(total)} نتيجة`, `${total} result${total === 1 ? '' : 's'}`)}</small>
    </span>
    <button type="button" className="button button-secondary button-small" disabled={page >= pages} onClick={() => onChange(page + 1)}>
      {text('التالي', 'Next')}<Next size={16} aria-hidden="true" />
    </button>
  </nav>;
}
