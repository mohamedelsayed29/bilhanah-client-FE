import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { EnvelopeSimpleIcon } from '@phosphor-icons/react';
import { emailOnlySchema } from '@bilhanah/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { z } from 'zod';
import { Alert } from '../../../components/Alert';
import { TextField } from '../../../components/fields';
import { AuthHeading } from '../../../layouts/AuthLayout';
import { api } from '../../../lib/api-client';
import { errorMessage } from '../../../lib/errors';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const form = useForm<z.input<typeof emailOnlySchema>, unknown, z.output<typeof emailOnlySchema>>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await api('/v1/auth/forgot-password', { method: 'POST', body: values, authenticated: false });
      setSentTo(values.email);
    } catch (error) {
      setFailure(error);
    }
  });

  if (sentTo) {
    return (
      <>
        <span className="page-icon" aria-hidden>
          <EnvelopeSimpleIcon size={30} />
        </span>
        <AuthHeading title={t('forgot.sentTitle')} subtitle={t('forgot.sentBody', { email: sentTo })} />
        <Link to="/login" className="inline-link center">
          {t('common.backToLogin')}
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading title={t('forgot.title')} subtitle={t('forgot.subtitle')} />
      <form className="form-stack" onSubmit={onSubmit} noValidate>
        {failure !== null && <Alert tone="error">{errorMessage(failure, t)}</Alert>}
        <TextField
          label={t('fields.email.label')}
          type="email"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          autoFocus
          error={errors.email && t('fields.email.error')}
          {...form.register('email')}
        />
        <button type="submit" className="button button-teal button-block" disabled={isSubmitting}>
          {isSubmitting ? t('forgot.submitting') : t('forgot.submit')}
        </button>
        <Link to="/login" className="inline-link center">
          {t('common.backToLogin')}
        </Link>
      </form>
    </>
  );
}
