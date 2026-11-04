import { useState } from 'react';
import { EnvelopeSimpleIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { Alert } from '../../../components/Alert';
import { JourneyStepper } from '../../../components/Stepper';
import { AuthHeading } from '../../../layouts/AuthLayout';
import { api } from '../../../lib/api-client';
import { errorMessage } from '../../../lib/errors';

export function CheckEmailPage() {
  const { t } = useTranslation();
  const email = (useLocation().state as { email?: string } | null)?.email;
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | { error: unknown }>('idle');

  const resend = async () => {
    if (!email) return;
    setState('sending');
    try {
      await api('/v1/auth/resend-verification', { method: 'POST', body: { email }, authenticated: false });
      setState('sent');
    } catch (error) {
      setState({ error });
    }
  };

  return (
    <>
      <JourneyStepper step="verify" />
      <span className="page-icon" aria-hidden>
        <EnvelopeSimpleIcon size={30} />
      </span>
      <AuthHeading
        title={t('checkEmail.title')}
        subtitle={email ? t('checkEmail.body', { email }) : t('checkEmail.bodyNoEmail')}
      />
      <div className="form-stack">
        <p className="form-note">{t('checkEmail.spam')}</p>
        {state === 'sent' && <Alert tone="success">{t('checkEmail.resent')}</Alert>}
        {typeof state === 'object' && <Alert tone="error">{errorMessage(state.error, t)}</Alert>}
        {email && (
          <button type="button" className="button button-outline button-block" onClick={resend} disabled={state === 'sending'}>
            {t('checkEmail.resend')}
          </button>
        )}
        <Link to="/login" className="inline-link center">
          {t('common.backToLogin')}
        </Link>
      </div>
    </>
  );
}
