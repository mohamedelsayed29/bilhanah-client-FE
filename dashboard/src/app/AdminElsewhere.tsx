import { ShieldCheckIcon } from '@phosphor-icons/react';
import { ADMIN_APP_URL } from '../lib/config';
import { useLanguage, usePageTitle } from '../lib/language';

/** /admin in the restaurants' dashboard: the admin console is its own app, with its own sign-in. */
export function AdminElsewhere() {
  const { text } = useLanguage();
  usePageTitle('لوحة الإدارة', 'Admin console');
  return <main className="state-page"><div className="state-card">
    <span className="empty-state-icon" aria-hidden="true"><ShieldCheckIcon size={30} /></span>
    <h1>{text('لوحة الإدارة في مكان تاني', 'The admin console lives elsewhere')}</h1>
    <p>{text('دي لوحة المطاعم. إدارة بالهنا ليها عنوان ودخول منفصلين.', 'This is the restaurants’ dashboard. Bilhanah administration has its own address and sign-in.')}</p>
    <a className="button button-primary" href={`${ADMIN_APP_URL}/admin/login`}>{text('افتح لوحة الإدارة', 'Open the admin console')}</a>
  </div></main>;
}
