import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { CheckCircleIcon, EnvelopeSimpleIcon, LinkBreakIcon } from '@phosphor-icons/react';
import { AUTH_ERROR_CODES, emailOnlySchema, type VerifyEmailResponse } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { isApiError } from '../../lib/api';
import { authApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { schemaResolver } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useSession } from '../../lib/session';
import { AuthCard } from './AuthCard';
import { runOnce, takeLinkToken } from './link-token';

type State = { kind: 'verifying' } | { kind: 'verified'; result: VerifyEmailResponse } | { kind: 'invalid' } | { kind: 'error'; error: unknown };

export function VerifyEmailPage() {
  const { text } = useLanguage();
  usePageTitle('تأكيد الإيميل', 'Confirm your email');
  const session = useSession();
  const [token] = useState(takeLinkToken);
  const [state, setState] = useState<State>(token ? { kind: 'verifying' } : { kind: 'invalid' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let active = true;
    runOnce(`verify:${token}:${attempt}`, () => authApi.verifyEmail(token))
      .then(result => { if (active) setState({ kind: 'verified', result }); })
      .catch((error: unknown) => {
        if (!active) return;
        setState(isApiError(error, AUTH_ERROR_CODES.INVALID_TOKEN) ? { kind: 'invalid' } : { kind: 'error', error });
      });
    return () => { active = false; };
  }, [token, attempt]);

  if (state.kind === 'verifying') {
    return <AuthCard icon={<span className="spinner" />} title={text('بنأكد إيميلك…', 'Confirming your email…')} />;
  }
  if (state.kind === 'verified' && state.result.passwordSetupRequired) {
    return <AuthCard icon={<EnvelopeSimpleIcon size={30} />} tone="success" title={text('إيميلك اتأكد. فاضل خطوة', 'Email confirmed. One more step')}
      description={text('عشان نحمي حسابك، بعتنا لك لينك تختار بيه كلمة السر. افتح إيميلك واتبع اللينك.', 'To protect your account, we emailed you a link to set your password. Open your inbox and follow it.')}>
      <Alert kind="info" live={false}>{text('الحساب ده اتسجل أكتر من مرة قبل التأكيد، فلازم تختار كلمة سر جديدة من اللينك.', 'This account was registered more than once before confirmation, so a new password must be set from the link.')}</Alert>
    </AuthCard>;
  }
  if (state.kind === 'verified') {
    const signedIn = session.status === 'authenticated';
    return <AuthCard icon={<CheckCircleIcon size={30} weight="fill" />} tone="success" title={text('إيميلك اتأكد', 'Your email is confirmed')}
      description={text('تمام! دلوقتي تقدر تسجّل دخولك وتجهّز منيو مطعمك أو كافيهك.', 'All set! You can now sign in and set up your restaurant or café menu.')}>
      <Link className="button button-primary button-block" to={signedIn ? '/' : '/login'}>{signedIn ? text('كمّل للوحة التحكم', 'Continue to the dashboard') : text('سجّل دخولك', 'Sign in')}</Link>
    </AuthCard>;
  }
  if (state.kind === 'error') {
    return <AuthCard icon={<LinkBreakIcon size={30} />} tone="danger" title={text('مقدرناش نأكد إيميلك', 'We couldn’t confirm your email')}>
      <Alert kind="error">{errorMessage(state.error, text)}</Alert>
      <Button block onClick={() => { setState({ kind: 'verifying' }); setAttempt(value => value + 1); }}>{text('حاول تاني', 'Try again')}</Button>
    </AuthCard>;
  }
  return <InvalidLink />;
}

function InvalidLink() {
  const { text } = useLanguage();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: schemaResolver(emailOnlySchema), defaultValues: { email: '' } });
  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    try { await authApi.resendVerification(email); setSentTo(email); } catch (caught) { setError(caught); }
  });
  return <AuthCard icon={<LinkBreakIcon size={30} />} tone="danger" title={text('اللينك ده مش شغال', 'This link isn’t valid')}
    description={text('لينك التأكيد انتهى أو اتستخدم قبل كده. اكتب إيميلك ونبعت لك لينك جديد.', 'The confirmation link has expired or was already used. Enter your email and we will send a new one.')}>
    {sentTo && <Alert kind="success">{text('لو الإيميل ده محتاج تأكيد، هتلاقي لينك جديد فيه.', 'If this address still needs confirming, a new link is on its way.')}</Alert>}
    {error !== null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
    <form className="form" onSubmit={onSubmit} noValidate>
      <Field label={text('الإيميل', 'Email')} error={errors.email} required>
        <input className="input" type="email" autoComplete="email" dir="ltr" {...register('email')} />
      </Field>
      <Button type="submit" block loading={isSubmitting}>{text('ابعت لينك جديد', 'Send a new link')}</Button>
    </form>
    <p className="auth-alt"><Link className="link" to="/login">{text('ارجع لتسجيل الدخول', 'Back to sign in')}</Link></p>
  </AuthCard>;
}
