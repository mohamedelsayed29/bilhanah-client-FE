import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { API_URL } from '../../../lib/config';
import { useLanguage } from '../../../lib/language';
import './early-access.css';

/**
 * Email-only early access for a product that is not released yet (Bilhanah IQ, CRM & WhatsApp). It goes to
 * the team through the contact endpoint, so nothing new is stored.
 */
export function EarlyAccessForm({ product, page }: { product: string; page: string }) {
  const { text } = useLanguage();
  const id = useId();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState('sending');
    try {
      const response = await fetch(`${API_URL}/v1/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${product} early access`,
          email: String(data.get('email') ?? '').trim(),
          topic: 'other',
          message: `Early access request for ${product}, sent from ${page}.`,
          website: String(data.get('website') ?? '') || undefined,
        }),
      });
      if (!response.ok) throw new Error(`Early access request failed with ${response.status}`);
      form.reset();
      setState('sent');
    } catch (error) {
      console.error(error);
      setState('failed');
    }
  };
  return <form className="ea-form" onSubmit={submit} aria-describedby={`${id}-status`}>
    <label className="visually-hidden" htmlFor={`${id}-email`}>{text('الإيميل', 'Email address')}</label>
    <input id={`${id}-email`} name="email" type="email" autoComplete="email" required placeholder={text('الإيميل*', 'Email address*')} disabled={state === 'sending'} />
    {/* Honeypot: hidden from people, filled in by bots. */}
    <input className="ea-hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
    <button type="submit" className="button button-teal" disabled={state === 'sending'}>{state === 'sending' ? text('بيتبعت…', 'Sending…') : text('اطلب وصول مبكر', 'Get early access')}</button>
    <p id={`${id}-status`} className={`ea-status is-${state}`} role="status">{state === 'sent'
      ? text(`وصلنا! هنبعتلك أول ما ${product} يبقى جاهز.`, `Got it! We’ll email you as soon as ${product} is ready.`)
      : state === 'failed' ? text('معرفناش نبعت دلوقتي. جرّب تاني أو كلّمنا من صفحة التواصل.', 'We couldn’t send that right now. Try again, or reach us on the contact page.') : ''}</p>
  </form>;
}
