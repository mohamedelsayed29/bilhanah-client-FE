import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { LinkBreakIcon, LockKeyIcon } from '@phosphor-icons/react';
import { AUTH_ERROR_CODES, passwordSchema } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { PasswordInput } from '../../components/PasswordInput';
import { isApiError } from '../../lib/api';
import { authApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { schemaResolver } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { sessionStore } from '../../lib/session';
import { AuthCard } from './AuthCard';
import { takeLinkToken } from './link-token';

export const newPasswordSchema = z.object({ password: passwordSchema, confirm: z.string() })
  .refine(values => values.password === values.confirm, { path: ['confirm'], message: '@@mismatch' });

export function ResetPasswordPage() {
  const { text } = useLanguage();
  usePageTitle('كلمة سر جديدة', 'Choose a new password');
  const navigate = useNavigate();
  const [token] = useState(takeLinkToken);
  const [error, setError] = useState<unknown>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: schemaResolver(newPasswordSchema), defaultValues: { password: '', confirm: '' } });

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) return;
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      // Resetting signs out every session, including this browser's.
      sessionStore.clear('signed-out');
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (caught) {
      setError(caught);
    }
  });

  if (!token || isApiError(error, AUTH_ERROR_CODES.INVALID_TOKEN)) {
    return <AuthCard icon={<LinkBreakIcon size={30} />} tone="danger" title={text('اللينك ده مش شغال', 'This link isn’t valid')}
      description={text('لينك تغيير كلمة السر انتهى أو اتستخدم قبل كده. اطلب لينك جديد.', 'The reset link has expired or was already used. Ask for a new one.')}>
      <Link className="button button-primary button-block" to="/forgot-password">{text('اطلب لينك جديد', 'Request a new link')}</Link>
    </AuthCard>;
  }
  return <AuthCard icon={<LockKeyIcon size={30} />} title={text('اختار كلمة سر جديدة', 'Choose a new password')} description={text('بعد التغيير هنخرجك من كل الأجهزة، وتدخل بالكلمة الجديدة.', 'After the change you will be signed out everywhere and can sign in with the new password.')}>
    {error !== null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
    <form className="form" onSubmit={onSubmit} noValidate>
      <Field label={text('كلمة السر الجديدة', 'New password')} error={errors.password} required hint={text('٨ حروف على الأقل.', 'At least 8 characters.')}>
        <PasswordInput autoComplete="new-password" {...register('password')} />
      </Field>
      <Field label={text('اكتبها تاني', 'Confirm the new password')} error={errors.confirm} required>
        <PasswordInput autoComplete="new-password" {...register('confirm')} />
      </Field>
      <Button type="submit" block loading={isSubmitting}>{text('احفظ كلمة السر', 'Save password')}</Button>
    </form>
  </AuthCard>;
}
