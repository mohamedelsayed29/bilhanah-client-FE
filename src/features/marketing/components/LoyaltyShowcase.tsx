import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowsClockwiseIcon, CheckIcon, GiftIcon, LockSimpleIcon, ShoppingBagIcon, StarIcon, TrendUpIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import { useReducedMotion } from '../hooks/useReducedMotion';
import './loyalty-showcase.css';

const SCENE_MS = 3800;

/** Counts from the previous value to `to` (instant when motion is reduced). */
function useCount(to: number, reduced: boolean) {
  const [value, setValue] = useState(to);
  const from = useRef(to);
  useEffect(() => {
    if (reduced) { setValue(to); from.current = to; return; }
    const start = performance.now(); const begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(begin + (to - begin) * eased));
      if (t < 1) frame = requestAnimationFrame(tick); else from.current = to;
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); from.current = to; };
  }, [to, reduced]);
  return value;
}

/**
 * A short film of the loyalty program, played like a video: a guest earns points on an order, reaches a
 * reward, redeems it, and comes back — on the real diner screens' wording — while the owner's figures move.
 * Points: 1 per EGP 10, so a 630 order earns 63. Owner figures are illustrative.
 */
export function LoyaltyFilm() {
  const { text, number } = useLanguage();
  const reduced = useReducedMotion();
  const [scene, setScene] = useState(0);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const running = visible && !reduced;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setScene(current => (current + 1) % 4), SCENE_MS);
    return () => window.clearTimeout(timer);
  }, [running, scene]);

  const balances = [300, 300, 0, 63];
  const balance = useCount(balances[scene], reduced);
  const repeat = useCount([38, 39, 40, 42][scene], reduced);
  const returning = useCount([41200, 42100, 43350, 44980][scene], reduced);
  const captions = [
    { title: text('الزبون يطلب ويكسب', 'The guest orders and earns'), body: text('كل طلب بيضيف نقاط لرقم موبايله، من غير أبلكيشن.', 'Every order adds points to their phone number, no app needed.') },
    { title: text('النقاط بتتجمع', 'Points add up'), body: text('يشوف رصيده وقد إيه فاضل على المكافأة الجاية.', 'They see their balance and how close the next reward is.') },
    { title: text('يستبدل مكافأة', 'They redeem a reward'), body: text('وقت الطلب يختار المكافأة، والخصم بيتحسب لوحده.', 'At checkout they pick a reward; the discount is applied for them.') },
    { title: text('ويرجع تاني', 'And they come back'), body: text('وانت بتشوف نسبة الزباين الراجعين بتزيد.', 'And you watch your repeat-customer rate grow.') },
  ];

  return <div className="lf" ref={ref}>
    <div className="lf-stage">
      <img className="lf-photo" src="/media/ready.jpg" alt={text('زباين مبسوطين في مطعم بيستخدم بالهنا', 'Happy guests at a restaurant using Bilhanah')} />
      <div className="lf-shade" aria-hidden="true" />

      <div className="lf-phone-wrap" aria-hidden="true">
        <div className="lf-phone">
          <i className="lf-btn lf-btn-action" /><i className="lf-btn lf-btn-up" /><i className="lf-btn lf-btn-down" /><i className="lf-btn lf-btn-power" />
          <div className="lf-screen">
            <div className="lf-island" />
            <div className="lf-status" dir="ltr">
              <b>9:41</b>
              <span>
                <svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
                <svg viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.5 7a6.4 6.4 0 0 1 9 0l-1.4 1.4a4.4 4.4 0 0 0-6.2 0zM1.3 4.8a9.5 9.5 0 0 1 13.4 0L13.3 6.2a7.5 7.5 0 0 0-10.6 0z" /></svg>
                <svg className="lf-battery" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4" /><rect x="2.5" y="2.5" width="17" height="8" rx="2" /><path d="M25 4.5v4a2 2 0 0 0 0-4z" opacity=".4" /></svg>
              </span>
            </div>
            <div className="lf-site">
              <img src="/brand/bilhanah-mark.svg" alt="" />
              <span><b>{text('مطعم بالهنا', 'Bilhanah Restaurant')}</b><small>{text('نقاط الولاء', 'Loyalty points')}</small></span>
            </div>
            <div className="lf-card">
              <small>{text('رصيدك', 'Your balance')}</small>
              <strong>{number(balance)} <em>{text('نقطة', 'points')}</em></strong>
              <div className="lf-meter"><i style={{ width: `${Math.min(100, (balance / 300) * 100)}%` }} /></div>
              <span>{balance >= 300 ? text('تقدر تستبدل مشروب مجاني دلوقتي', 'You can redeem a free drink now') : text(`فاضلك ${number(300 - balance)} نقطة على مشروب مجاني`, `${number(300 - balance)} points to a free drink`)}</span>
            </div>
            <div className="lf-scene" key={scene}>
              {scene === 0 && <div className="lf-earned">
                <span className="lf-check"><CheckIcon weight="bold" /></span>
                <p>{text('اتأكد طلبك', 'Order confirmed')} · {number(630)} {text('ج.م', 'EGP')}</p>
                <b>+{number(63)} {text('نقطة', 'points')}</b>
              </div>}
              {scene === 1 && <ul className="lf-rewards">
                <li className="is-ready"><GiftIcon weight="duotone" /><span>{text('مشروب مجاني', 'Free drink')}</span><b>{number(300)}</b></li>
                <li><GiftIcon weight="duotone" /><span>{text('خصم ٥٠ ج.م', 'EGP 50 off')}</span><b>{number(500)}</b></li>
                <li><GiftIcon weight="duotone" /><span>{text('حلو مجاني', 'Free dessert')}</span><b>{number(700)}</b></li>
              </ul>}
              {scene === 2 && <div className="lf-redeem">
                <p>{text('استبدل مكافأة', 'Redeem a reward')}</p>
                <div className="lf-chosen"><GiftIcon weight="duotone" /><span>{text('لاتيه مجاني', 'Free latte')}</span><b>−{number(75)} {text('ج.م', 'EGP')}</b></div>
                <span className="lf-done"><CheckIcon weight="bold" />{text('اتستبدلت', 'Redeemed')}</span>
              </div>}
              {scene === 3 && <div className="lf-back">
                <p>{text('أهلاً تاني يا سارة', 'Welcome back, Sara')}</p>
                <span><StarIcon weight="fill" />{text('زيارتك الخامسة', 'Your fifth visit')}</span>
                <small>{text('+٦٣ نقطة من أول طلب النهارده', '+63 points from today’s first order')}</small>
              </div>}
            </div>
            <div className="lf-how">
              <p>{text('إزاي بتكسب', 'How you earn')}</p>
              <span>{text('نقطة لكل ١٠ ج.م في كل طلب', '1 point for every EGP 10 you order')}</span>
            </div>
            <div className="lf-safari"><span><LockSimpleIcon weight="fill" />bilhanah.app</span></div>
            <div className="lf-home" />
          </div>
          <div className="lf-glare" />
        </div>
      </div>

      <div className="lf-owner" aria-hidden="true">
        <p className="lf-owner-title">{text('لوحة الولاء', 'Loyalty dashboard')}</p>
        <div className="lf-kpi"><small>{text('الزباين الراجعين', 'Repeat customers')}</small><b>{number(repeat)}%</b><span><TrendUpIcon weight="bold" />{text('بيزيد', 'rising')}</span></div>
        <div className="lf-kpi"><small>{text('إيراد الزباين الراجعين', 'Returning-customer revenue')}</small><b>{number(returning)} <em>{text('ج.م', 'EGP')}</em></b></div>
        <div className="lf-spark">{[30, 34, 33, 38, 41, 40, 46, 52].map((height, index) => <i key={index} style={{ height: `${height + scene * 4}%` }} />)}</div>
        <small className="lf-note">{text('أرقام توضيحية', 'Illustrative figures')}</small>
      </div>

      <div className="lf-caption" aria-live="polite">
        <strong>{captions[scene].title}</strong>
        <span>{captions[scene].body}</span>
      </div>
    </div>

    <div className="lf-controls">
      <ol className="lf-chapters">{captions.map((item, index) => <li key={item.title}>
        <button type="button" onClick={() => setScene(index)} aria-current={index === scene ? 'step' : undefined}>
          <span className="lf-seg"><i key={`${index}-${scene}-${running}`} className={index < scene ? 'is-done' : index === scene ? (running ? 'is-running' : 'is-done') : ''} style={{ animationDuration: `${SCENE_MS}ms` }} /></span>
          <span className="lf-seg-label">{item.title}</span>
        </button>
      </li>)}</ol>
    </div>
  </div>;
}

/** Why loyalty grows sales, and a calculator on the restaurant's own numbers. */
export function LoyaltyGrowth() {
  const { text, number } = useLanguage();
  const [guests, setGuests] = useState(1200);
  const [average, setAverage] = useState(170);
  const [share, setShare] = useState(10);
  const monthly = Math.round(guests * (share / 100) * average);
  const reasons = [
    { icon: ArrowsClockwiseIcon, title: text('زيارات أكتر', 'More visits'), body: text('نقاط الزبون مستنياه، فعنده سبب يرجعلك بدل ما يروح لغيرك.', 'Their points are waiting, so guests have a reason to come back to you.') },
    { icon: ShoppingBagIcon, title: text('طلب أكبر', 'Bigger orders'), body: text('اللي فاضله نقاط قليلة على المكافأة بيزوّد صنف عشان يوصلها.', 'A guest a few points short of a reward adds a dish to reach it.') },
    { icon: UsersThreeIcon, title: text('تعرف زبونك', 'Know your guests'), body: text('تشوف مين بيرجع ومين بطّل يجي، وتعرف تكلمه.', 'See who comes back and who stopped coming, and reach out.') },
  ];
  const slider = (label: string, value: number, set: (value: number) => void, min: number, max: number, step: number, unit: string) => <label className="lg-field">
    <span><b>{label}</b><output>{number(value)}{unit}</output></span>
    <input type="range" min={min} max={max} step={step} value={value} style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties} onChange={event => set(Number(event.target.value))} />
  </label>;
  return <section className="lg" aria-labelledby="growth-title"><div className="page-container">
    <div className="lg-head">
      <h2 id="growth-title">{text('إزاي الولاء بيزوّد مبيعاتك؟', 'How does loyalty grow your sales?')}</h2>
      <p>{text('الزبون اللي بيرجع أرخص وأربح من زبون جديد. وده اللي البرنامج بيعمله:', 'A returning guest is cheaper and more profitable than a new one. Here is what the program does:')}</p>
    </div>
    <ul className="lg-reasons">{reasons.map(({ icon: ReasonIcon, title, body }) => <li key={title}>
      <span className="lg-icon"><ReasonIcon size={24} weight="duotone" aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{body}</p>
    </li>)}</ul>
    <figure className="lg-quote">
      <blockquote>{text('زيادة الاحتفاظ بالعملاء ٥٪ بس، ممكن ترفع الأرباح من ٢٥٪ لـ ٩٥٪.', 'Keeping just 5% more customers can raise profits by 25% to 95%.')}</blockquote>
      <figcaption>{text('أبحاث Bain & Company', 'Bain & Company research')}</figcaption>
    </figure>
    <div className="lg-calc-head">
      <h2>{text('احسبها بأرقام مطعمك', 'Work it out with your numbers')}</h2>
      <p>{text('حرّك الأرقام وشوف المبيعات الزيادة لو جزء من زباينك رجع زيارة واحدة زيادة في الشهر.', 'Move the numbers to see the extra sales if some of your guests come back one extra time a month.')}</p>
    </div>
    <div className="lg-calc">
      <div className="lg-inputs">
        {slider(text('عدد الزباين في الشهر', 'Guests a month'), guests, setGuests, 100, 6000, 100, '')}
        {slider(text('متوسط الطلب', 'Average order'), average, setAverage, 40, 600, 10, text(' ج.م', ' EGP'))}
        {slider(text('نسبة اللي بيرجعوا زيارة زيادة', 'Share who return one extra time'), share, setShare, 1, 30, 1, '%')}
      </div>
      <div className="lg-result" aria-live="polite">
        <small>{text('مبيعات زيادة في الشهر', 'Extra sales a month')}</small>
        <strong>{number(monthly)} <em>{text('ج.م', 'EGP')}</em></strong>
        <p>{text(`حوالي ${number(monthly * 12)} ج.م في السنة`, `About EGP ${number(monthly * 12)} a year`)}</p>
        <small className="lg-note">{text('حساب تقريبي بأرقامك انت، مش وعد بنتيجة.', 'A rough estimate from your own numbers, not a promise.')}</small>
      </div>
    </div>
  </div></section>;
}
