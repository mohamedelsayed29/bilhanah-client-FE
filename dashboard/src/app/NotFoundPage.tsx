import { Link } from 'react-router';
import { HouseIcon } from '@phosphor-icons/react';
import { Brand } from '../components/Brand';
import { useLanguage, usePageTitle } from '../lib/language';

export function NotFoundPage() {
  const { text } = useLanguage();
  usePageTitle('الصفحة مش موجودة', 'Page not found');
  return <main className="state-page" id="main-content">
    <div className="state-card">
      <Brand />
      <span className="state-code" aria-hidden="true">404</span>
      <h1>{text('الصفحة دي مش موجودة', 'This page doesn’t exist')}</h1>
      <p>{text('يمكن اللينك اتكتب غلط أو الصفحة اتنقلت.', 'The link may be mistyped, or the page has moved.')}</p>
      <div className="form-actions"><Link className="button button-primary" to="/"><HouseIcon size={18} aria-hidden="true" />{text('ارجع للوحة التحكم', 'Back to the dashboard')}</Link></div>
    </div>
  </main>;
}
