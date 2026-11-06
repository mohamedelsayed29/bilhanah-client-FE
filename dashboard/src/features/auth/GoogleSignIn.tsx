import { useQuery } from '@tanstack/react-query';
import type { OAuthError } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { authApi } from '../../lib/api/endpoints';
import { API_URL } from '../../lib/config';
import { useLanguage } from '../../lib/language';

/** Which sign-in providers the server offers; Google stays hidden until it is configured there. */
export function useAuthProviders() {
  return useQuery({ queryKey: ['auth', 'providers'], queryFn: authApi.providers, staleTime: 5 * 60_000, retry: false });
}

/** Google's "G", in its own colours (their sign-in branding asks for it unchanged). */
function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>;
}

/**
 * A divider, then "Continue with Google", under the email form. Signing up and signing in are the
 * same: a new Google account gets an owner account, an existing one is signed in. Always shown;
 * until the server has Google credentials, it comes back to the login page saying so.
 */
export function GoogleSignIn() {
  const { text, language } = useLanguage();
  return <>
    <div className="auth-divider"><span>{text('أو', 'or')}</span></div>
    <a className="button button-secondary button-block google-button" href={`${API_URL}/v1/auth/google/start?lang=${language}&remember=1`} data-testid="google-sign-in">
      <GoogleMark />{text('كمّل بحساب جوجل', 'Continue with Google')}
    </a>
  </>;
}

const OAUTH_MESSAGES: Record<OAuthError, [string, string]> = {
  cancelled: ['لغيت الدخول بجوجل. تقدر تجرّب تاني أو تدخل بالإيميل.', 'Google sign-in was cancelled. Try again or use your email.'],
  failed: ['جوجل مردّش زي ما متوقع. جرّب تاني بعد شوية.', 'Google didn’t respond as expected. Please try again shortly.'],
  expired: ['الدخول بجوجل خد وقت طويل أو اتفتح من متصفح تاني. جرّب تاني.', 'Google sign-in took too long or started in another browser. Please try again.'],
  email_unverified: ['الإيميل ده مش متأكد عند جوجل. أكّده عندهم أو ادخل بالإيميل وكلمة السر.', 'Google hasn’t verified this email. Verify it with Google or sign in with email and password.'],
  suspended: ['الحساب ده موقوف. تواصل مع دعم بالهنا.', 'This account is suspended. Please contact Bilhanah support.'],
  not_allowed: ['الحساب ده مينفعش يدخل بجوجل.', 'This account can’t sign in with Google.'],
  disabled: ['الدخول بجوجل مش متاح دلوقتي. ادخل بالإيميل وكلمة السر.', 'Google sign-in isn’t available right now. Use your email and password.'],
};

/** Why Google sign-in sent the browser back here (?oauth_error=…). */
export function OAuthErrorNotice({ code }: { code: string | null }) {
  const { text } = useLanguage();
  if (!code) return null;
  const message = OAUTH_MESSAGES[code as OAuthError] ?? OAUTH_MESSAGES.failed;
  return <Alert kind="error" title={text('مقدرناش ندخلك بجوجل', 'We couldn’t sign you in with Google')}>{text(...message)}</Alert>;
}
