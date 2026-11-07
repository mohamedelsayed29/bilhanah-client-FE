import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeftIcon, CheckIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import { useReducedMotion } from '../hooks/useReducedMotion';
import './order-journey.css';

const STEP_MS = 3600;

/**
 * One order end to end. The steps advance on their own while the section is on screen (each with a
 * filling bar), and the ticket beside them shows what that step looks like in Bilhanah.
 * Order: 2 × burger 370, salad 95, latte 35 = 500; service 60; tax 70; total 630.
 */
export function OrderJourney({ moreLink = false }: { moreLink?: boolean }) {
  const { text, number } = useLanguage();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const playing = visible && !paused && !reduced;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setStep(current => (current + 1) % 4), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, step]);

  const steps = [
    { title: text('الزبون يطلب', 'The guest orders'), body: text('سكان من الترابيزة أو الكاشير يسجّله، والطلب يوصل باسم الطاولة.', 'A scan at the table or the cashier enters it; it arrives with the table’s name.') },
    { title: text('المطبخ يحضّر', 'The kitchen prepares'), body: text('على شاشة المحطة الصح في نفس اللحظة، والزبون بيتابع.', 'On the right station’s screen at once, while the guest follows along.') },
    { title: text('الكاشير يحاسب', 'The cashier settles'), body: text('كاش وكارت ومحفظة، والفلوس للخزنة والنقاط للزبون.', 'Cash, card and wallet; money to the drawer, points to the guest.') },
    { title: text('الأرقام تتحدّث', 'The numbers update'), body: text('المبيعات والمخزون والتقييم، من غير ما حد يكتب حاجة.', 'Sales, stock and ratings, without anyone typing a thing.') },
  ];
  const status = [text('طلب جديد', 'New order'), text('بيتحضّر', 'Preparing'), text('اتدفع', 'Paid'), text('في التقرير', 'In your report')];
  const items = [[text('برجر البيت', 'House burger'), 2, 370], [text('سلطة الحديقة', 'Garden salad'), 1, 95], [text('لاتيه', 'Latte'), 1, 35]] as const;

  return <section ref={ref} id="journey" className="journey section-space" aria-labelledby="journey-title" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    <div className="page-container">
      <div className="journey-head">
        <div>
          <p className="journey-eyebrow">{text('رحلة الطلب', 'The order journey')}</p>
          <h2 id="journey-title">{text('طلب واحد، والكل متصل', 'One order, everyone connected')}</h2>
        </div>
        <p>{text('من غير ورق ولا لف بين الصالة والمطبخ والكاشير. كل خطوة بتحصل لوحدها.', 'No paper and no running between the floor, the kitchen and the cashier. Each step just happens.')}</p>
      </div>
      <div className="journey-body">
        <ol className="journey-list">{steps.map((item, index) => <li key={item.title}>
          <button type="button" className={`journey-step ${index === step ? 'is-active' : ''} ${index < step ? 'is-done' : ''}`} aria-current={index === step ? 'step' : undefined} onClick={() => setStep(index)}>
            <span className="journey-step-num">{number(0)}{number(index + 1)}</span>
            <span className="journey-step-copy"><strong>{item.title}</strong><span>{item.body}</span></span>
            <span className="journey-bar" aria-hidden="true"><i key={`${index}-${step}`} className={index === step && playing ? 'is-running' : ''} style={{ animationDuration: `${STEP_MS}ms` }} /></span>
          </button>
        </li>)}</ol>

        <div className="journey-ticket" aria-live="polite">
          <header>
            <span><b>{text(`طلب #${number(1048)}`, `Order #${number(1048)}`)}</b><small>{text('ترابيزة ٤ · صالة', 'Table 4 · Dine-in')}</small></span>
            <em key={step} className={`journey-status s${step}`}>{status[step]}</em>
          </header>
          <ul className="journey-items">{items.map(([name, qty, total]) => <li key={name}><span>{number(qty)}×</span><span>{name}</span><b>{number(total)}</b></li>)}</ul>
          <div className="journey-stage" key={step}>
            {step === 0 && <p className="journey-note">{text('وصل للوحة الطلبات وللمطبخ', 'Reached the order board and the kitchen')}<small>{text('من ثانيتين', '2 seconds ago')}</small></p>}
            {step === 1 && <div className="journey-kitchen">
              <p><span>{text('محطة الجريل', 'Grill station')}</span><b>{text('برجر × ٢', 'Burger × 2')}</b></p>
              <p><span>{text('محطة البارد', 'Cold station')}</span><b>{text('سلطة × ١', 'Salad × 1')}</b></p>
              <div className="journey-progress"><i /></div>
            </div>}
            {step === 2 && <dl className="journey-bill">
              <div><dt>{text('خدمة وضريبة', 'Service & tax')}</dt><dd>{number(130)}</dd></div>
              <div><dt>{text('كاش', 'Cash')}</dt><dd>{number(400)}</dd></div>
              <div><dt>{text('كارت', 'Card')}</dt><dd>{number(230)}</dd></div>
              <div className="is-total"><dt>{text('الإجمالي', 'Total')}</dt><dd>{number(630)} {text('ج.م', 'EGP')}</dd></div>
            </dl>}
            {step === 3 && <div className="journey-report">
              <p><span>{text('صافي اليوم', 'Net today')}</span><b>+{number(630)} {text('ج.م', 'EGP')}</b></p>
              <p><span>{text('نقاط الزبون', 'Guest points')}</span><b>+{number(63)}</b></p>
              <p><span>{text('المخزون', 'Stock')}</span><b>{text('اتخصم تلقائي', 'Deducted')}</b></p>
            </div>}
          </div>
          <ol className="journey-track" aria-hidden="true">{status.map((label, index) => <li key={label} className={index <= step ? 'is-on' : ''}><i>{index < step && <CheckIcon weight="bold" />}</i><span>{label}</span></li>)}</ol>
        </div>
      </div>
      {moreLink && <Link className="journey-more" to="/how-it-works">{text('شوف التفاصيل خطوة بخطوة', 'See it step by step')}<ArrowLeftIcon className="directional-arrow" size={16} /></Link>}
    </div>
  </section>;
}
