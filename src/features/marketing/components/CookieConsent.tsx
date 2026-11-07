import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useLanguage } from '../../../lib/language';
import { CONSENT_OPEN, readConsent, saveConsent } from '../../../lib/consent';
import './cookie-consent.css';

/** A cookie with a bite taken out, on a mango disc. */
function CookieArt() {
  return <svg className="cc-art" viewBox="0 0 120 120" aria-hidden="true">
    <circle className="cc-blob" cx="60" cy="60" r="58" />
    <g className="cc-cookie">
      <path d="M66 22a40 40 0 1 0 34 44 11 11 0 0 1-12-10 11 11 0 0 1-12-12 11 11 0 0 1-10-22z" fill="#d89a52" stroke="#b9773a" strokeWidth="2.5" />
      <circle cx="46" cy="52" r="5" fill="#35172f" /><circle cx="66" cy="74" r="5.5" fill="#35172f" /><circle cx="40" cy="78" r="4" fill="#35172f" />
      <circle cx="80" cy="88" r="3.5" fill="#35172f" /><circle cx="58" cy="94" r="3" fill="#35172f" />
      <circle cx="98" cy="50" r="2" fill="#d89a52" /><circle cx="90" cy="40" r="1.6" fill="#b9773a" />
    </g>
  </svg>;
}

/**
 * The cookie banner: bottom corner, shown until the visitor decides; reopened from the footer.
 * "Continue without consent" keeps only what is strictly necessary.
 */
export function CookieConsent() {
  const { text } = useLanguage();
  // ?cookies=1 shows the banner again, as a first visit would see it.
  const [open, setOpen] = useState(() => readConsent() === null || new URLSearchParams(location.search).has('cookies'));
  const [choosing, setChoosing] = useState(false);
  const [preferences, setPreferences] = useState(() => readConsent()?.preferences ?? true);
  const [analytics, setAnalytics] = useState(() => readConsent()?.analytics ?? false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reopen = () => { const current = readConsent(); setPreferences(current?.preferences ?? true); setAnalytics(current?.analytics ?? false); setChoosing(true); setOpen(true); };
    window.addEventListener(CONSENT_OPEN, reopen);
    return () => window.removeEventListener(CONSENT_OPEN, reopen);
  }, []);
  useEffect(() => { if (open && choosing) panel.current?.focus(); }, [open, choosing]);

  if (!open) return null;
  const decide = (choice: { preferences: boolean; analytics: boolean }) => { saveConsent(choice); setOpen(false); setChoosing(false); };
  const toggle = (label: string, body: string, checked: boolean, onChange?: (value: boolean) => void) => <label className={`cc-option ${onChange ? '' : 'is-locked'}`}>
    <span><b>{label}</b><small>{body}</small></span>
    <input type="checkbox" role="switch" checked={checked} disabled={!onChange} onChange={event => onChange?.(event.target.checked)} />
    <i aria-hidden="true" />
  </label>;

  return <div className={`cc ${choosing ? 'is-choosing' : ''}`} role="dialog" aria-modal="false" aria-labelledby="cc-title" ref={panel} tabIndex={-1}>
    {choosing && <div className="cc-options">
      {toggle(text('ضرورية', 'Strictly necessary'), text('تشغيل الموقع والأمان وحفظ اختيارك ده. دايمًا شغالة.', 'Running the site, security, and saving this choice. Always on.'), true)}
      {toggle(text('تفضيلات', 'Preferences'), text('نفتكر اللغة اللي اخترتها للموقع.', 'Remember the language you chose for the site.'), preferences, setPreferences)}
      {toggle(text('تحليلات', 'Analytics'), text('مش بنستخدم أدوات قياس حاليًا، ولو ضفنا حاجة مش هتشتغل غير بموافقتك.', 'We use no measurement tools today; anything we add only runs with your consent.'), analytics, setAnalytics)}
    </div>}
    <div className="cc-row">
      <CookieArt />
      <div className="cc-body">
        <h2 id="cc-title">{choosing ? text('اختار اللي يريحك', 'Choose what suits you') : <>{text('كوكيز؟', 'Cookies?')} <span>{text('بالهنا والشفا.', 'Bon appétit.')}</span></>}</h2>
        <p>{text('بنستخدم الكوكيز الضرورية عشان الموقع يشتغل، وبإذنك نفتكر لغتك. مش بنبيع بياناتك ولا عندنا إعلانات.', 'We use the cookies the site needs, and with your permission we remember your language. We never sell your data and run no ads.')} <Link className="cc-link" to="/privacy">{text('سياسة الخصوصية', 'Privacy policy')}</Link></p>
      </div>
      <div className="cc-actions">
        <button type="button" className="cc-skip" onClick={() => decide({ preferences: false, analytics: false })}>{text('الضرورية بس', 'Necessary only')}</button>
        {!choosing
          ? <button type="button" className="cc-secondary" onClick={() => setChoosing(true)}>{text('اختار بنفسي', 'Let me choose')}</button>
          : <button type="button" className="cc-secondary" onClick={() => decide({ preferences, analytics })}>{text('احفظ اختياري', 'Save my choice')}</button>}
        <button type="button" className="cc-primary" onClick={() => decide({ preferences: true, analytics: true })}>{text('وافق على الكل', 'Accept all')}</button>
      </div>
    </div>
  </div>;
}
