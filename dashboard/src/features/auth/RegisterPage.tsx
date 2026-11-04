import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CheckIcon } from '@phosphor-icons/react';
import { registerOwnerSchema } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { PasswordInput } from '../../components/PasswordInput';
import { authApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { schemaResolver } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { AuthCard } from './AuthCard';

// The second password is checked here only; the API takes the contract's fields.
const registerFormSchema = registerOwnerSchema.extend({ confirmPassword: z.string().min(1) })
  .refine(values => values.password === values.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });

export function RegisterPage() {
  const { text, language, chooseLanguage } = useLanguage();
  usePageTitle('إنشاء حساب', 'Create your account');
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: schemaResolver(registerFormSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });

  // Emails and the account follow the language the owner signs up in.
  const onSubmit = handleSubmit(async ({ confirmPassword: _confirm, ...values }) => {
    setError(null);
    try {
      await authApi.register({ ...values, preferredLanguage: language });
      chooseLanguage(language);
      navigate('/check-email', { state: { email: values.email } });
    } catch (caught) {
      setError(caught);
    }
  });

  return <AuthCard icon={<img src="/brand/bilhanah-mark.svg" alt="" width="445" height="479" />} title={text('ابدأ تجربتك المجانية', 'Start your free trial')} description={text('اعمل حسابك في دقيقة، وجرّب التجربة الكاملة لمطعمك.', 'Create your account in a minute and try the Full Experience.')}>
    <ul className="auth-perks">
      <li><CheckIcon size={14} weight="bold" />{text('٣٠ يوم مجانًا', '30 days free')}</li>
      <li><CheckIcon size={14} weight="bold" />{text('من غير بطاقة', 'No card needed')}</li>
      <li><CheckIcon size={14} weight="bold" />{text('من غير تجديد تلقائي', 'No auto-renewal')}</li>
    </ul>
    {error !== null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
    <form className="form" onSubmit={onSubmit} noValidate>
      <Field label={text('اسمك', 'Your name')} error={errors.fullName} required>
        <input className="input" autoComplete="name" {...register('fullName')} />
      </Field>
      <Field label={text('الإيميل', 'Email')} error={errors.email} required hint={text('هنبعت لك لينك تأكيد على الإيميل ده.', 'We will send a confirmation link to this address.')}>
        <input className="input" type="email" autoComplete="email" inputMode="email" dir="ltr" {...register('email')} />
      </Field>
      <div className="form-grid auth-password-grid">
        <Field label={text('كلمة السر', 'Password')} error={errors.password} required hint={text('٨ حروف على الأقل.', 'At least 8 characters.')}>
          <PasswordInput autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label={text('أكّد كلمة السر', 'Confirm password')} error={errors.confirmPassword} required>
          <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
        </Field>
      </div>
      <Button type="submit" block loading={isSubmitting}>{text('إنشاء الحساب', 'Create account')}</Button>
    </form>
    <p className="auth-alt">{text('عندك حساب بالفعل؟', 'Already have an account?')} <Link className="link" to="/login">{text('سجّل دخولك', 'Sign in')}</Link></p>
  </AuthCard>;
}
