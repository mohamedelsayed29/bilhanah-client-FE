import { useEffect, useRef, useState } from 'react';
import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { JourneyStepper } from '../../../components/Stepper';
import { AuthHeading } from '../../../layouts/AuthLayout';
import { api } from '../../../lib/api-client';
import { useHashToken } from '../useHashToken';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const token = useHashToken();
  const [state, setState] = useState<'verifying' | 'verified' | 'failed'>(token ? 'verifying' : 'failed');
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: never submit twice (e.g. React Strict Mode re-running effects).
    if (!token || started.current) return;
    started.current = true;
    api('/v1/auth/verify-email', { method: 'POST', body: { token }, authenticated: false })
      .then(() => setState('verified'))
      .catch(() => setState('failed'));
  }, [token]);

  if (state === 'verifying') {
    return (
      <div className="loading-inline" role="status">
        <span className="spinner" aria-hidden />
        {t('verify.verifying')}
      </div>
    );
  }

  if (state === 'verified') {
    return (
      <>
        <JourneyStepper step="verify" done />
        <span className="page-icon page-icon-success" aria-hidden>
          <CheckCircleIcon size={30} />
        </span>
        <AuthHeading title={t('verify.successTitle')} subtitle={t('verify.successBody')} />
        <Link to="/login" className="button button-teal button-block">
          {t('verify.continue')}
        </Link>
      </>
    );
  }

  return (
    <>
      <JourneyStepper step="verify" />
      <span className="page-icon page-icon-error" aria-hidden>
        <WarningCircleIcon size={30} />
      </span>
      <AuthHeading title={t('verify.failedTitle')} subtitle={token ? t('verify.failedBody') : t('verify.missingBody')} />
      <div className="form-stack">
        <Link to="/login" className="button button-teal button-block">
          {t('verify.continue')}
        </Link>
        <p className="form-note center">{t('checkEmail.spam')}</p>
      </div>
    </>
  );
}
