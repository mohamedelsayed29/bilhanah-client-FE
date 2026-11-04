import { Link } from 'react-router';
import { useLanguage } from '../lib/language';

/** The Bilhanah logo linking home; `mark` shows the symbol alone (the icon-only sidebar). */
export function Brand({ inverse = false, mark = false, to = '/' }: { inverse?: boolean; mark?: boolean; to?: string }) {
  const { text } = useLanguage();
  return <Link to={to} className={`brand ${mark ? 'brand-mark' : ''}`} aria-label={text('بالهنا، الرئيسية', 'Bilhanah home')}>
    {mark
      ? <img src="/brand/bilhanah-mark.svg" alt="" width="445" height="479" decoding="async" />
      : <img src={inverse ? '/brand/bilhanah-logo-light.svg' : '/brand/bilhanah-logo.svg'} alt="" width="1507" height="479" decoding="async" />}
  </Link>;
}
