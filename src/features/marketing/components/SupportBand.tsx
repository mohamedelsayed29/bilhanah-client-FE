import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeftIcon, ChatsCircleIcon, CheckCircleIcon, ClockCountdownIcon, LightningIcon, UsersThreeIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import './support-band.css';

type Bilingual = { ar: string; en: string };
const PILLARS: { icon: Icon; title: Bilingual; text: Bilingual }[] = [
  { icon: ClockCountdownIcon,
    title: { ar: '٢٤ ساعة، ٧ أيام في الأسبوع', en: '24 hours a day, 7 days a week' },
    text: { ar: 'في عز الزحمة أو بعد ما تقفل، هتلاقي حد يرد عليك.', en: 'At the rush hour or after closing, someone is there to answer.' } },
  { icon: ChatsCircleIcon,
    title: { ar: 'شات مباشر من جوه لوحة التحكم', en: 'Live chat inside your dashboard' },
    text: { ar: 'من غير إيميلات ولا انتظار على التليفون. اكتب مشكلتك ونكلّمك علطول.', en: 'No emails, no phone queues. Describe the issue and we reply right there.' } },
  { icon: LightningIcon,
    title: { ar: 'إجابات فورية للأسئلة الشائعة', en: 'Instant answers to common questions' },
    text: { ar: 'مساعد بالهنا بيرد في ثانية على أشهر الأسئلة، ويحوّلك لفريقنا لو احتجت.', en: 'The Bilhanah assistant answers the usual questions in a second, and hands you to our team when needed.' } },
  { icon: UsersThreeIcon,
    title: { ar: 'فريق بيتكلم لغتك', en: 'A team that speaks your language' },
    text: { ar: 'بالعربي المصري أو بالإنجليزي، وفاهمين شغل المطاعم والكافيهات.', en: 'In Egyptian Arabic or English, and we know how restaurants and cafés work.' } },
];

/** "Support around the clock": a light band with what support includes and a live-chat preview. */
export function SupportBand({ onStart }: { onStart: () => void }) {
  const { text } = useLanguage();
  const chat = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  // The chat plays once, when it scrolls into view.
  useEffect(() => {
    const element = chat.current;
    if (!element || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setShown(true); observer.disconnect(); }
    }, { threshold: 0.35 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <section id="support" className="support-band section-space" aria-labelledby="support-title">
    <div className="page-container support-band-inner">
      <div className="support-band-copy">
        <span className="support-band-eyebrow"><span className="support-band-live" aria-hidden="true" />{text('الدعم الفني · متاحين دلوقتي', 'Support · Available now')}</span>
        <h2 id="support-title">{text('دعم فني حقيقي،', 'Real support,')} <span>{text('٢٤ ساعة طول الأسبوع.', 'around the clock.')}</span></h2>
        <p className="support-band-lead">{text(
          'مطعمك مش بيقفل على مواعيد مكاتب، وإحنا كمان. لو حاجة وقفت معاك في أي وقت، فريق بالهنا معاك من جوه لوحة التحكم.',
          'Your restaurant does not keep office hours, and neither do we. If anything gets in your way, at any hour, the Bilhanah team is right inside your dashboard.',
        )}</p>
        <ul className="support-band-pillars">
          {PILLARS.map(pillar => <li key={pillar.title.en}>
            <span className="support-band-icon" aria-hidden="true"><pillar.icon size={22} weight="duotone" /></span>
            <span><strong>{text(pillar.title.ar, pillar.title.en)}</strong><small>{text(pillar.text.ar, pillar.text.en)}</small></span>
          </li>)}
        </ul>
        <div className="support-band-actions">
          <button type="button" className="button button-teal" onClick={onStart}>{text('ابدأ مجانًا', 'Start for free')}<ArrowLeftIcon className="directional-arrow" size={18} /></button>
          <Link className="support-band-link" to="/contact">{text('عندك سؤال قبل ما تبدأ؟ كلّمنا', 'A question before you start? Talk to us')}</Link>
        </div>
      </div>

      <div ref={chat} className={`support-band-chat ${shown ? 'is-shown' : ''}`} aria-hidden="true">
        <div className="sb-window">
          <div className="sb-head">
            <span className="sb-team"><i>{text('س', 'S')}</i><i>{text('م', 'M')}</i><i>{text('أ', 'A')}</i></span>
            <span className="sb-head-text"><strong>{text('فريق دعم بالهنا', 'Bilhanah Support')}</strong><small><b />{text('متاحين ٢٤/٧ · بيرد في دقايق', 'Online 24/7 · replies in minutes')}</small></span>
          </div>
          <div className="sb-body">
            <p className="sb-time">{text('النهارده ١١:٤٢ م', 'Today 11:42 PM')}</p>
            <div className="sb-msg is-customer sb-step-1">{text('شاشة المطبخ مش بتعرض الطلبات الجديدة 😥', 'The kitchen screen is not showing new orders 😥')}</div>
            <div className="sb-row sb-step-2"><span className="sb-avatar">{text('س', 'S')}</span><div className="sb-msg is-agent"><span>{text('سارة · دعم بالهنا', 'Sara · Bilhanah Support')}</span>{text('ولا يهمك، أنا معاك. جرّب تسجّل خروج من الشاشة وتدخل تاني بالكود.', 'No worries, I am on it. Sign the screen out and back in with its code.')}</div></div>
            <div className="sb-msg is-customer sb-step-3">{text('اشتغلت! شكرًا جدًا 🙏', 'It works! Thank you so much 🙏')}</div>
            <div className="sb-row sb-step-4"><span className="sb-avatar">{text('س', 'S')}</span><div className="sb-msg is-agent sb-typing"><i /><i /><i /></div></div>
          </div>
        </div>
        <div className="sb-float is-resolved sb-step-5"><CheckCircleIcon size={18} weight="fill" />{text('المشكلة اتحلّت · BIL-10482', 'Resolved · BIL-10482')}</div>
        <div className="sb-float is-always"><ClockCountdownIcon size={18} weight="duotone" />{text('٢٤/٧ حتى في الإجازات', '24/7, holidays included')}</div>
      </div>
    </div>
  </section>;
}
