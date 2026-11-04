import { useTranslation } from 'react-i18next';

export function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="loading-screen" role="status">
      <span className="spinner" aria-hidden />
      <span className="visually-hidden">{t('common.loading')}</span>
    </div>
  );
}
