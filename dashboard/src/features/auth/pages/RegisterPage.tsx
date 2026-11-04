import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircleIcon, CircleIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { registerOwnerSchema } from '@bilhanah/contracts';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { Alert } from '../../../components/Alert';
import { PasswordField, TextField } from '../../../components/fields';
import { JourneyStepper } from '../../../components/Stepper';
import { AuthHeading } from '../../../layouts/AuthLayout';
import { api } from '../../../lib/api-client';
import { errorMessage } from '../../../lib/errors';
import { currentLanguage } from '../../../lib/i18n';

const formSchema = registerOwnerSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, { path: ['confirmPassword'] });

const MIN_PASSWORD_LENGTH = 10;

function Rule({ met, children }: { met: boolean; children: string }) {
  return (
    <li className={met ? 'is-met' : ''}>
      {met ? <CheckCircleIcon size={16} weight="fill" aria-hidden /> : <CircleIcon size={16} aria-hidden />}
      {children}
    </li>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<unknown>(null);
  const form = useForm<z.input<typeof formSchema>, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', fullName: '', password: '', confirmPassword: '', preferredLanguage: currentLanguage() },
  });
  const { errors, isSubmitting } = form.formState;
  const password = form.watch('password') ?? '';
  const confirmPassword = form.watch('confirmPassword') ?? '';

  const onSubmit = form.handleSubmit(async ({ confirmPassword: _, ...values }) => {
    setFailure(null);
    try {
      // Emails and the dashboard follow the language the owner is using when they submit.
      await api('/v1/auth/register', { method: 'POST', body: { ...values, preferredLanguage: currentLanguage() }, authenticated: false });
      navigate('/check-email', { state: { email: values.email } });
    } catch (error) {
      setFailure(error);
    }
  });

  return (
    <>
      <JourneyStepper step="account" />
      <AuthHeading title={t('register.title')} subtitle={t('register.subtitle')} />
      <form className="form-stack register-form" onSubmit={onSubmit} noValidate>
        {failure !== null && <Alert tone="error">{errorMessage(failure, t)}</Alert>}
        <TextField
          label={t('fields.fullName.label')}
          autoComplete="name"
          autoFocus
          error={errors.fullName && t('fields.fullName.error')}
          {...form.register('fullName')}
        />
        <TextField
          label={t('fields.email.label')}
          type="email"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          error={errors.email && t('fields.email.error')}
          {...form.register('email')}
        />
        <PasswordField
          label={t('fields.newPassword.label')}
          autoComplete="new-password"
          error={errors.password && t('fields.newPassword.error')}
          {...form.register('password')}
        />
        <PasswordField
          label={t('fields.confirmPassword.label')}
          autoComplete="new-password"
          error={errors.confirmPassword && t('fields.confirmPassword.error')}
          {...form.register('confirmPassword')}
        />
        <ul className="password-rules" aria-live="polite">
          <Rule met={password.length >= MIN_PASSWORD_LENGTH}>{t('register.passwordRules.length')}</Rule>
          <Rule met={password.length > 0 && password === confirmPassword}>{t('register.passwordRules.match')}</Rule>
        </ul>
        <div className="register-submit">
          <button type="submit" className="button button-teal button-block" disabled={isSubmitting}>
            {isSubmitting ? t('register.submitting') : t('register.submit')}
          </button>
          <p className="form-note register-terms">
            <ShieldCheckIcon size={16} aria-hidden />
            {t('register.terms')}
          </p>
        </div>
      </form>
      <p className="auth-switch">
        {t('register.haveAccount')} <Link to="/login">{t('register.login')}</Link>
      </p>
    </>
  );
}
