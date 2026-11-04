import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { EnvelopeSimpleOpenIcon, KeyIcon } from '@phosphor-icons/react';
import { emailOnlySchema } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { authApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { schemaResolver } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { AuthCard } from './AuthCard';

export function ForgotPasswordPage() {
  const { text } = useLanguage();
  usePageTitle('نسيت كلمة السر', 'Forgot password');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: schemaResolver(emailOnlySchema), defaultValues: { email: '' } });
  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    try { await authApi.forgotPassword(email); setSentTo(email); } catch (caught) { setError(caught); }
  });
  if (sentTo) {
    return <AuthCard icon={<EnvelopeSimpleOpenIcon size={30} />} title={text('افتح إيميلك', 'Check your email')}
      description={<>{text('لو فيه حساب على', 'If there is an account for')} <strong className="ltr">{sentTo}</strong>{text('، هتلاقي لينك تغيّر بيه كلمة السر.', ', you will find a link to reset your password.')}</>}>
      <p className="auth-alt"><Link className="link" to="/login">{text('ارجع لتسجيل الدخول', 'Back to sign in')}</Link></p>
    </AuthCard>;
  }
  return <AuthCard icon={<KeyIcon size={30} />} title={text('نسيت كلمة السر؟', 'Forgot your password?')} description={text('اكتب إيميلك ونبعت لك لينك تختار بيه كلمة سر جديدة.', 'Enter your email and we will send you a link to choose a new password.')}>
    {error !== null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
    <form className="form" onSubmit={onSubmit} noValidate>
      <Field label={text('الإيميل', 'Email')} error={errors.email} required>
        <input className="input" type="email" autoComplete="email" dir="ltr" {...register('email')} />
      </Field>
      <Button type="submit" block loading={isSubmitting}>{text('ابعت اللينك', 'Send the link')}</Button>
    </form>
    <p className="auth-alt"><Link className="link" to="/login">{text('ارجع لتسجيل الدخول', 'Back to sign in')}</Link></p>
  </AuthCard>;
}
