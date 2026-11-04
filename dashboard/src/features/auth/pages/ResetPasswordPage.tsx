import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircleIcon } from '@phosphor-icons/react';
import { newPasswordSchema } from '@bilhanah/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { z } from 'zod';
import { Alert } from '../../../components/Alert';
import { PasswordField } from '../../../components/fields';
import { AuthHeading } from '../../../layouts/AuthLayout';
import { ApiError, api } from '../../../lib/api-client';
import { errorMessage } from '../../../lib/errors';
import { useHashToken } from '../useHashToken';

const formSchema = z
  .object({ password: newPasswordSchema, confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, { path: ['confirmPassword'] });

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const token = useHashToken();
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setFailure(null);
    try {
      await api('/v1/auth/reset-password', { method: 'POST', body: { token, password }, authenticated: false });
      setDone(true);
    } catch (error) {
      setFailure(error);
    }
  });

  if (done) {
    return (
      <>
        <span className="page-icon page-icon-success" aria-hidden>
          <CheckCircleIcon size={30} />
        </span>
        <AuthHeading title={t('reset.successTitle')} subtitle={t('reset.successBody')} />
        <Link to="/login" className="button button-teal button-block">
          {t('verify.continue')}
        </Link>
      </>
    );
  }

  const tokenRejected = failure instanceof ApiError && failure.code === 'INVALID_TOKEN';

  return (
    <>
      <AuthHeading title={t('reset.title')} subtitle={t('reset.subtitle')} />
      {!token ? (
        <div className="form-stack">
          <Alert tone="error">{t('reset.missingBody')}</Alert>
          <Link to="/forgot-password" className="button button-teal button-block">
            {t('reset.requestNew')}
          </Link>
        </div>
      ) : (
        <form className="form-stack" onSubmit={onSubmit} noValidate>
          {failure !== null && (
            <Alert tone="error">
              {errorMessage(failure, t)}
              {tokenRejected && (
                <>
                  {' '}
                  <Link to="/forgot-password" className="inline-link">
                    {t('reset.requestNew')}
                  </Link>
                </>
              )}
            </Alert>
          )}
          <PasswordField
            label={t('fields.newPassword.label')}
            autoComplete="new-password"
            autoFocus
            hint={t('fields.newPassword.hint')}
            error={errors.password && t('fields.newPassword.error')}
            {...form.register('password')}
          />
          <PasswordField
            label={t('fields.confirmPassword.label')}
            autoComplete="new-password"
            error={errors.confirmPassword && t('fields.confirmPassword.error')}
            {...form.register('confirmPassword')}
          />
          <button type="submit" className="button button-teal button-block" disabled={isSubmitting}>
            {isSubmitting ? t('reset.submitting') : t('reset.submit')}
          </button>
        </form>
      )}
    </>
  );
}
