import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@bilhanah/contracts';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { Alert } from '../../../components/Alert';
import { PasswordField, TextField } from '../../../components/fields';
import { AuthHeading } from '../../../layouts/AuthLayout';
import { ApiError } from '../../../lib/api-client';
import { errorMessage } from '../../../lib/errors';
import { useSession } from '../../../lib/session';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [failure, setFailure] = useState<unknown>(null);
  const form = useForm<z.input<typeof loginSchema>, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: params.get('email') ?? '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await login(values);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith('/') ? from : '/', { replace: true });
    } catch (error) {
      setFailure(error);
    }
  });

  const unverified = failure instanceof ApiError && failure.code === 'EMAIL_NOT_VERIFIED';

  return (
    <>
      <AuthHeading title={t('login.title')} subtitle={t('login.subtitle')} />
      <form className="form-stack" onSubmit={onSubmit} noValidate>
        {failure !== null && (
          <Alert tone="error">
            {errorMessage(failure, t)}
            {unverified && (
              <>
                {' '}
                <Link to="/check-email" state={{ email: form.getValues('email') }} className="inline-link">
                  {t('login.resend')}
                </Link>
              </>
            )}
          </Alert>
        )}
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
        <PasswordField
          label={t('fields.password.label')}
          autoComplete="current-password"
          error={errors.password && t('fields.password.error')}
          {...form.register('password')}
        />
        <div className="form-row-end">
          <Link to="/forgot-password" className="inline-link">
            {t('login.forgot')}
          </Link>
        </div>
        <button type="submit" className="button button-teal button-block" disabled={isSubmitting}>
          {isSubmitting ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
      <p className="auth-switch">
        {t('login.noAccount')} <Link to="/register">{t('login.register')}</Link>
      </p>
    </>
  );
}
