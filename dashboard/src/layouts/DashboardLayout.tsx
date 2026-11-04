import { HouseIcon, SignOutIcon, StorefrontIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { Brand } from '../components/Brand';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useCurrentUser, useSession } from '../lib/session';

export function DashboardLayout({ navigation = true }: { navigation?: boolean }) {
  const { t } = useTranslation();
  const { logout } = useSession();
  const user = useCurrentUser();
  return (
    <div className="dashboard-layout">
      <a className="skip-link" href="#main-content">
        {t('common.skipToContent')}
      </a>
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Brand />
          {navigation && (
            <nav aria-label={t('nav.main')} className="dashboard-nav">
              <NavLink to="/" end>
                <HouseIcon size={19} aria-hidden />
                {t('nav.overview')}
              </NavLink>
              <NavLink to="/settings">
                <StorefrontIcon size={19} aria-hidden />
                {t('nav.settings')}
              </NavLink>
            </nav>
          )}
          <div className="dashboard-header-actions">
            <span className="dashboard-user" title={user.email}>
              {user.fullName}
            </span>
            <LanguageSwitch />
            <button type="button" className="button button-outline button-small" onClick={() => void logout()}>
              <SignOutIcon className="directional-icon" size={18} aria-hidden />
              <span>{t('common.signOut')}</span>
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" className="dashboard-main">
        <Outlet />
      </main>
    </div>
  );
}
