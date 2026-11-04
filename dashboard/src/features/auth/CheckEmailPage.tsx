import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { EnvelopeSimpleOpenIcon } from '@phosphor-icons/react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { authApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../lib/language';
import { AuthCard } from './AuthCard';
import { useCooldown } from './useCooldown';

export function CheckEmailPage() {
  const { text, number } = useLanguage();
  usePageTitle('افتح إيميلك', 'Check your email');
  const [params] = useSearchParams();
  const email = (useLocation().state as { email?: string } | null)?.email ?? params.get('email') ?? '';
  const cooldown = useCooldown();
  const [status, setStatus] = useState<{ kind: 'sent' } | { kind: 'error'; error: unknown } | null>(null);
  const [sending, setSending] = useState(false);

  const resend = async () => {
    setSending(true);
    try {
      await authApi.resendVerification(email);
      setStatus({ kind: 'sent' });
      cooldown.start(60);
    } catch (error) {
      setStatus({ kind: 'error', error });
    } finally {
      setSending(false);
    }
  };

  return <AuthCard icon={<EnvelopeSimpleOpenIcon size={30} />} title={text('افتح إيميلك', 'Check your email')}
    description={email
      ? <>{text('بعتنا لينك تأكيد على', 'We sent a confirmation link to')} <strong className="ltr">{email}</strong>. {text('افتحه عشان تكمّل إعداد مطعمك.', 'Open it to continue setting up your restaurant.')}</>
      : text('بعتنا لك لينك تأكيد. افتحه عشان تكمّل إعداد مطعمك.', 'We sent you a confirmation link. Open it to continue setting up your restaurant.')}>
    {status?.kind === 'sent' && <Alert kind="success">{text('بعتنا الرسالة تاني.', 'We sent the email again.')}</Alert>}
    {status?.kind === 'error' && <Alert kind="error">{errorMessage(status.error, text)}</Alert>}
    <ul className="tips">
      <li>{text('الرسالة ممكن تاخد دقيقة أو اتنين توصل.', 'The message can take a minute or two to arrive.')}</li>
      <li>{text('مش لاقيها؟ بص في الـ Spam أو الـ Promotions.', 'Can’t find it? Check your spam or promotions folder.')}</li>
      <li>{text('اللينك يشتغل مرة واحدة بس.', 'The link works only once.')}</li>
    </ul>
    {email && <Button variant="secondary" block onClick={resend} loading={sending} disabled={cooldown.secondsLeft > 0}>
      {cooldown.secondsLeft > 0 ? text(`تقدر تبعت تاني بعد ${number(cooldown.secondsLeft)} ثانية`, `Resend available in ${cooldown.secondsLeft}s`) : text('ابعت الرسالة تاني', 'Resend the email')}
    </Button>}
    <p className="auth-alt">{text('أكدت إيميلك؟', 'Already confirmed?')} <Link className="link" to={email ? `/login?email=${encodeURIComponent(email)}` : '/login'}>{text('سجّل دخولك', 'Sign in')}</Link>
      {' · '}<Link className="link" to="/register">{text('غيّر الإيميل', 'Use a different email')}</Link></p>
  </AuthCard>;
}
