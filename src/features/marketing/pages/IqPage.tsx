import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeftIcon, ArrowUpIcon, CaretDownIcon, ChartBarIcon, CheckIcon, GearSixIcon, HeadsetIcon, HouseIcon, SparkleIcon, UserIcon,
} from '@phosphor-icons/react';
import { IqIcon } from '../../../components/IqIcon';
import { EarlyAccessForm } from '../components/EarlyAccessForm';
import { PhoneFrame } from '../components/PhoneFrame';
import { DASHBOARD_URL } from '../../../lib/config';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { useShowcase } from '../hooks/useShowcase';
import { useReducedMotion } from '../hooks/useReducedMotion';
import './iq-page.css';

/**
 * /features/iq: Bilhanah IQ, the restaurant's AI assistant (coming soon). Questions, answers and figures in the
 * mock-ups are illustrative; the page says so. Motion pauses off screen, on request, and with reduced motion.
 */

/** The IQ mark (components/IqIcon). */
function IqMark({ size = 56, animated = false }: { size?: number; animated?: boolean }) {
  return <IqIcon className="iq-mark" size={size} animated={animated} />;
}

export function IqPage() {
  const { text } = useLanguage();
  usePageTitle('Bilhanah IQ: مساعد ذكي لمطعمك | بالهنا', 'Bilhanah IQ: your restaurant’s AI assistant | Bilhanah');
  return <div className="iq-page">
    <Hero />
    <Thinking />
    <Pillars />
    <AskList />
    <AskAnything />
    <Faq />
    <section className="iq-final" aria-labelledby="iq-final-title">
      <div className="page-container">
        <IqMark size={52} />
        <h2 id="iq-final-title">{text('مطعمك يستاهل مساعد فاهمه.', 'Your restaurant deserves an assistant that gets it.')}</h2>
        <p>{text('Bilhanah IQ هيبقى جوه لوحة بالهنا، مبني على أرقام مطعمك أنت.', 'Bilhanah IQ will live inside your Bilhanah dashboard, built on your own restaurant’s numbers.')}</p>
        <div className="iq-actions">
          <Link className="button button-teal" to="/contact">{text('اطلب وصول مبكر', 'Get early access')}<ArrowLeftIcon className="directional-arrow" size={18} aria-hidden="true" /></Link>
          <Link className="button button-outline" to="/pricing">{text('شوف الباقات', 'See pricing')}</Link>
        </div>
      </div>
    </section>
    <p className="page-container iq-disclaimer">{text('الأسئلة والإجابات والأرقام في الصفحة دي أمثلة توضيحية لمنتج لسه بيتبني.', 'Questions, answers and figures on this page are illustrative examples of a product still being built.')}</p>
  </div>;
}

// --- Hero: drifting questions ----------------------------------------------------------------------------

function Hero() {
  const { text } = useLanguage();
  const reduced = useReducedMotion();
  const tiles: ({ kind: 'ask'; q: string; who: string } | { kind: 'photo'; src: string })[] = [
    { kind: 'photo', src: '/media/hero-live-menu.jpg' },
    { kind: 'ask', q: text('«اعملّي قايمة تحضير النهارده على حسب مبيعات الأسبوع اللي فات.»', '“Make today’s prep list from last week’s sales.”'), who: text('شيف · مطعم مشويات', 'Chef · grill house') },
    { kind: 'ask', q: text('«أنهي يوم في الأسبوع تكلفة الموظفين فيه أعلى من المبيعات؟»', '“Which weekday has the highest staff cost for its sales?”'), who: text('صاحب كافيه', 'Café owner') },
    { kind: 'photo', src: '/media/business/chains.jpg' },
    { kind: 'ask', q: text('«اقترح أطباق موسم على حسب الأكتر مبيعًا.»', '“Suggest seasonal specials from my best sellers.”'), who: text('مدير فرع', 'Branch manager') },
    { kind: 'photo', src: '/media/explore.jpg' },
    { kind: 'ask', q: text('«إيه اللي مخلّي متوسط الطلب نازل الشهر ده؟»', '“What is pulling my average order down this month?”'), who: text('صاحب سلسلة مطاعم', 'Restaurant group owner') },
    { kind: 'ask', q: text('«مين الأصناف اللي تكلفتها عالية ومبيعها قليل؟»', '“Which dishes cost a lot and barely sell?”'), who: text('صاحب مطعم', 'Restaurant owner') },
    { kind: 'photo', src: '/media/business/takeaway.jpg' },
  ];
  const row = (hidden: boolean) => <ul className="iq-marquee-row" aria-hidden={hidden || undefined}>
    {tiles.map((tile, index) => <li key={index} className={`iq-tile is-${tile.kind}`} style={{ '--n': index } as CSSProperties}>
      {tile.kind === 'photo' ? <img src={tile.src} alt="" loading="lazy" /> : <><p>{tile.q}</p><span><i />{tile.who}</span></>}
    </li>)}
  </ul>;
  return <section className="iq-hero" aria-labelledby="iq-title">
    <div className="page-container iq-hero-copy">
      <p className="iq-eyebrow"><IqMark size={18} animated /><span>{text('Bilhanah IQ: ذكاء اصطناعي للمطاعم والمحلات', 'Bilhanah IQ: AI for restaurants and retail')}</span></p>
      <h1 id="iq-title" tabIndex={-1}>{text('اسأل مطعمك أي حاجة.', 'Ask your restaurant anything.')}<br />{text('والإجابة في ثواني.', 'Get answers in seconds.')}</h1>
      <p className="iq-lead">{text('Bilhanah IQ مساعد ذكي جوه لوحة بالهنا، بيقرا طلباتك والمنيو والمخزون والحضور، فبيفهم مطعمك من أول يوم من غير أي إعداد.',
        'Bilhanah IQ is an AI assistant inside your Bilhanah dashboard. It reads your orders, menu, stock and attendance, so it understands your restaurant from day one, with nothing to set up.')}</p>
      <EarlyAccessForm product="Bilhanah IQ" page="the Bilhanah IQ page (/features/iq)" />
      <p className="iq-customer">{text('عميل بالهنا بالفعل؟', 'Already a Bilhanah customer?')} <a href={DASHBOARD_URL ? `${DASHBOARD_URL}/insights` : '/contact'}>{text('شوف إحصائيات مطعمك', 'See your restaurant’s insights')}<ArrowLeftIcon className="directional-arrow" size={16} aria-hidden="true" /></a></p>
    </div>
    <div className={`iq-marquee ${reduced ? 'is-paused' : ''}`}>
      <div className="iq-marquee-track">{row(false)}{row(true)}</div>
    </div>
  </section>;
}

// --- One question, thought through ----------------------------------------------------------------------------

function Thinking() {
  const { text, number } = useLanguage();
  // 0 the question · 1–2 analyzing · 3 the answer · 4 the owner approves · 5 done (then it starts again).
  const show = useShowcase(6, 2200);
  const { step, reduced } = show;
  const analyzing = step === 1 || step === 2;
  const detail = useTyped(analyzing ? text('بيبص على مبيعاتك في الصيف اللي فات، والأصناف الأكتر مبيعًا، وطريقة طلب زباينك…', 'Looking at last summer’s sales, your best sellers and how your guests order…') : '', reduced);
  const phase = step <= 0 ? 0 : step <= 3 ? 1 : 2;
  const beats = [
    { title: text('اسأل بكلامك', 'Ask in your own words'), body: text('من غير تقارير ولا فلاتر: اكتب السؤال زي ما بتقوله لمدير الفرع.', 'No reports or filters: type the question the way you would ask your manager.') },
    { title: text('يحلل أرقامك', 'It digs into your numbers'), body: text('IQ بيقرا الطلبات والمنيو والتكلفة، ويرجعلك بإجابة مفهومة واقتراح واضح.', 'IQ reads your orders, menu and costs, and comes back with a clear answer and a concrete idea.') },
    { title: text('وافق بضغطة', 'Approve with one tap'), body: text('عجبك الاقتراح؟ وافق، وIQ ينفّذه في المنيو. ومفيش حاجة بتتغير من غير موافقتك.', 'Like the idea? Approve it and IQ puts it on your menu. Nothing changes without your say-so.') },
  ];
  return <section className="page-container iq-think" aria-labelledby="iq-think-title">
    <div className="iq-chat" ref={show.ref} aria-hidden="true">
      <div className="iq-chat-head"><IqIcon size={26} /><span>{text('اقترح أصناف للموسم', 'Suggest seasonal specials')}<CaretDownIcon size={14} weight="bold" /></span></div>
      <div className="iq-chat-body">
        <div className="iq-chat-q">{text('اقترح أصناف للصيف على حسب الأكتر مبيعًا.', 'Suggest summer specials from my best sellers.')}</div>
        {step >= 1 && <div className={`iq-analyzing ${analyzing ? 'is-live' : ''}`}>
          <p className="iq-analyzing-title"><IqIcon size={22} animated={analyzing} /><span className="iq-shimmer">{analyzing ? text('بيحلل', 'Analyzing') : text('خلّص التحليل', 'Analysis done')}</span>{analyzing && <i className="iq-dots"><b /><b /><b /></i>}</p>
          {analyzing && <p className="iq-analyzing-detail">{detail}<i className="iq-caret" /></p>}
        </div>}
        <div className={`iq-chat-answer ${step >= 3 ? 'is-in' : ''}`}>
          <p className="iq-chat-label"><ChartBarIcon size={16} weight="duotone" />{text('اللي أرقامك بتقوله', 'What your numbers say')}</p>
          <p>{text('في الأسابيع الحر الصيف اللي فات، المشروبات الساقعة زادت ٤٠٪، والليمون بالنعناع كان الأكتر مبيعًا عندك.', 'In last summer’s hot weeks your cold drinks rose 40%, and mint lemonade was your best seller.')}</p>
          <p><b>{text('الاقتراح: كومبو الصيف', 'Suggestion: the Summer combo')}</b></p>
          <p>{text(`ليمون نعناع فروزن مع سلطة جرجير بالرمان بـ ${number(165)} ج.م، ورشّحه كإضافة مع أطباق المشويات.`, `Frozen mint lemonade with a rocket and pomegranate salad for EGP ${number(165)}, suggested as an add-on with your grills.`)}</p>
        </div>
        <div className={`iq-chat-me ${step >= 4 ? 'is-in' : ''}`}>{text('تمام، ضيفه للمنيو.', 'Great, add it to the menu.')}</div>
        <div className={`iq-chat-done ${step >= 5 ? 'is-in' : ''}`}><CheckIcon size={14} weight="bold" />{text('اتضاف «كومبو الصيف» لمنيو كل الفروع. تقدر ترجّعه في أي وقت.', 'Added “Summer combo” to the menu at every branch. You can undo it any time.')}</div>
      </div>
      <div className="iq-chat-input"><span>{text('اسأل سؤال…', 'Ask a question…')}</span><i><ArrowUpIcon size={16} weight="bold" /></i></div>
    </div>
    <div className="iq-think-copy">
      <h2 id="iq-think-title" className="visually-hidden">{text('إزاي بيشتغل', 'How it works')}</h2>
      <ol>{beats.map((beat, index) => <li key={beat.title} className={phase === index ? 'is-on' : ''}>
        <h3>{beat.title}</h3>
        <p>{beat.body}</p>
      </li>)}</ol>
    </div>
  </section>;
}

// --- Three pillars ----------------------------------------------------------------------------------------------

function Pillars() {
  const { text } = useLanguage();
  const pillars = [
    { title: [text('بيتعلم', 'Learns from'), text('من أرقامك', 'your numbers')], body: text('مبني على طلباتك ومنيوك ومخزونك وحضور فريقك، مش على كلام عام.', 'Built on your orders, menu, stock and team attendance, not generic advice.'), tone: 'a' },
    { title: [text('بيعرف', 'Knows'), text('قبل ما تسأل', 'before you ask')], body: text('ينبهك لو خامة هتخلص قبل الزحمة، أو يوم بطيء جاي، أو صنف بيخسّر.', 'Warns you when stock will run out before the rush, a slow day is coming, or a dish loses money.'), tone: 'b' },
    { title: [text('بتتصرف', 'Act'), text('من مكان واحد', 'in one place')], body: text('علّم صنف خلص، عدّل وردية، أو جهّز عرض، كله بموافقتك وفي نفس الشات.', 'Mark a dish sold out, adjust a shift or prepare an offer, all with your approval, in the same chat.'), tone: 'c' },
  ];
  return <section className="page-container iq-pillars" aria-label={text('اللي بيميّز IQ', 'What sets IQ apart')}>
    {pillars.map(pillar => <article key={pillar.body} className={`tone-${pillar.tone}`}>
      <h2><span>{pillar.title[0]}</span><span>{pillar.title[1]}</span></h2>
      <p>{pillar.body}</p>
    </article>)}
  </section>;
}

// --- Ask, and see the answer --------------------------------------------------------------------------------------

function AskList() {
  const { text, number } = useLanguage();
  const show = useShowcase(4, 4500);
  const { step, setStep } = show;
  const asks = [
    { label: text('توقّع مبيعاتي', 'Forecast my sales'), photo: '/media/hero-live-menu.jpg' },
    { label: text('نظّم ورديات الفريق', 'Plan my team’s shifts'), photo: '/media/business/chains.jpg' },
    { label: text('حدّث المنيو', 'Update my menu'), photo: '/media/explore.jpg' },
    { label: text('ادّيني ملخص النهارده', 'Give me today’s briefing'), photo: '/media/ready.jpg' },
  ];
  const bars = [{ name: text('مشويات مشكلة', 'Mixed grill'), v: 100 }, { name: text('مكرونة جمبري', 'Shrimp pasta'), v: 62 }, { name: text('ليمون نعناع', 'Mint lemonade'), v: 48 }];
  return <section id="iq-ask" className="page-container iq-ask" aria-labelledby="iq-ask-title">
    <div className="iq-ask-panel" ref={show.ref}>
      <div className="iq-ask-copy">
        <h2 id="iq-ask-title">{text('خليك فاهم مطعمك لحظة بلحظة', 'Stay on top of your restaurant in real time')}</h2>
        <ul className="iq-ask-list">{asks.map((ask, index) => <li key={ask.label}>
          <button type="button" aria-pressed={step === index} onClick={() => setStep(index)}>
            <span>{ask.label}</span><ArrowLeftIcon className="directional-arrow" size={22} aria-hidden="true" />
          </button>
        </li>)}</ul>
      </div>
      <div className="iq-ask-visual" aria-hidden="true">
        {asks.map((ask, index) => <img key={ask.photo} src={ask.photo} alt="" className={step === index ? 'is-on' : ''} loading="lazy" />)}
        <div className="iq-ask-shade" />
        <div key={step} className="iq-ui">
          {step === 0 && <>
            <div className="iq-ui-prompt"><IqMark size={34} /><span>{text('توقّع مبيعات ', 'Forecast ')}<mark>{text('الجمعة', 'Friday')}</mark>{text(' الجاية', '’s sales')}</span></div>
            <div className="iq-ui-card">
              <small className="iq-ui-steps"><SparkleIcon size={12} weight="fill" />{text('قرا ١٢ جمعة قبلها', 'Read the last 12 Fridays')}</small>
              <b>{text('المبيعات المتوقعة', 'Projected sales')}</b>
              <p><strong>{text(`${number(18400)}–${number(19900)} ج.م`, `EGP ${number(18400)}–${number(19900)}`)}</strong>{text('، أعلى ١٢٪ من جمعة عادية بسبب الإجازة.', ', about 12% above a usual Friday because of the holiday.')}</p>
            </div>
          </>}
          {step === 1 && <>
            <div className="iq-ui-prompt"><IqMark size={34} /><span>{text('مد وردية ', 'Extend ')}<mark>{text('أحمد', 'Ahmed')}</mark>{text(' ساعة يوم الجمعة', '’s Friday shift by an hour')}</span></div>
            <div className="iq-ui-card">
              <dl className="iq-ui-table"><div><dt>{text('الموظف', 'Employee')}</dt><dd>{text('أحمد سامي', 'Ahmed Samy')}</dd></div><div><dt>{text('نهاية الوردية', 'Shift ends')}</dt><dd>{text('١٢:٣٠ ص', '12:30 a.m.')}</dd></div></dl>
              <span className="iq-ui-btn"><CheckIcon size={14} weight="bold" />{text('وافق واحفظ', 'Approve & save')}</span>
            </div>
          </>}
          {step === 2 && <>
            <div className="iq-ui-prompt"><IqMark size={34} /><span>{text('علّم ', 'Mark ')}<mark>{text('مكرونة جمبري', 'Shrimp pasta')}</mark>{text(' خلصت في فرع المعادي', ' sold out at the Maadi branch')}</span></div>
            <div className="iq-ui-card">
              <b>{text('هيختفي من منيو الفرع لحد ما ترجّعه', 'Hidden from the branch menu until you bring it back')}</b>
              <p>{text('اقتراح: رشّح «مكرونة فراخ» مكانه، نفس الفئة وهامش أعلى.', 'Suggestion: recommend “Chicken pasta” instead: same category, better margin.')}</p>
              <span className="iq-ui-btn"><CheckIcon size={14} weight="bold" />{text('وافق', 'Approve')}</span>
            </div>
          </>}
          {step === 3 && <div className="iq-ui-card is-brief">
            <b>{text('النهارده لحد دلوقتي', 'Today so far')}</b>
            <div className="iq-ui-stats">
              <div><small>{text('المبيعات', 'Sales')}</small><strong>{text(`${number(12480)} ج.م`, `EGP ${number(12480)}`)}</strong></div>
              <div><small>{text('الطلبات', 'Orders')}</small><strong>{number(86)}</strong></div>
              <div><small>{text('متوسط الطلب', 'Avg. order')}</small><strong>{number(145)}</strong></div>
            </div>
            <small className="iq-ui-sub">{text('الأكتر مبيعًا', 'Top dishes')}</small>
            <ul className="iq-ui-bars">{bars.map(bar => <li key={bar.name}><span>{bar.name}</span><i><b style={{ '--v': bar.v / 100 } as CSSProperties} /></i></li>)}</ul>
          </div>}
        </div>
      </div>
    </div>
  </section>;
}

// --- "Ask anything" over the phone dashboard ------------------------------------------------------------------------

function AskAnything() {
  const { text, number } = useLanguage();
  const reduced = useReducedMotion();
  const show = useShowcase(4, 3200);
  const questions = [
    text('هو الأسبوع الجاي هيبقى زحمة؟', 'Is next week going to be busy?'),
    text('أنهي فرع بيبيع أكتر الساعة ٩ بالليل؟', 'Which branch sells most at 9 p.m.?'),
    text('إيه الخامات اللي هتخلص قبل الويك إند؟', 'What will run out before the weekend?'),
    text('اكتبلي عرض لزباين مجوش من شهر.', 'Write an offer for guests away for a month.'),
  ];
  const typed = useTyped(questions[show.step]!, reduced);
  return <section className="iq-anything" aria-labelledby="iq-anything-title">
    <div className="page-container">
      <h2 id="iq-anything-title">{text('مش مجرد سؤال وجواب.', 'Way more than questions and answers.')}</h2>
      <p className="iq-sub">{text('اسأل بالعربي أو الإنجليزي، من الموبايل أو الكمبيوتر، في أي وقت.', 'Ask in Arabic or English, from your phone or computer, any time.')}</p>
    </div>
    <div className="iq-stage" ref={show.ref} aria-hidden="true">
      <img className="iq-side is-l2" src="/media/business/grills.jpg" alt="" loading="lazy" />
      <img className="iq-side is-l1" src="/media/hero-live-food.jpg" alt="" loading="lazy" />
      <img className="iq-side is-r1" src="/media/hero-live-scan.jpg" alt="" loading="lazy" />
      <img className="iq-side is-r2" src="/media/business/cafe.jpg" alt="" loading="lazy" />
      <PhoneFrame className="iq-device" screenClassName="iq-screen">
          <div className="iq-app-head">
            <img src="/brand/bilhanah-mark.svg" alt="" />
            <span><b>{text('بيت الزيتون', 'Olive House')}</b><small>{text('كل الفروع · النهارده', 'All branches · Today')}</small></span>
            <i className="iq-avatar">{text('س', 'S')}</i>
          </div>
          <div className="iq-phone-card"><small>{text('مبيعات الأسبوع', 'Sales this week')}</small><b>{text(`${number(84320)} ج.م`, `EGP ${number(84320)}`)}</b><em>↑ 6%</em><Spark tone="coral" /></div>
          <div className="iq-phone-card"><small>{text('تكلفة الموظفين', 'Staff cost')}</small><b>{text(`${number(21900)} ج.م`, `EGP ${number(21900)}`)}</b><em>26%</em><Spark tone="plum" /></div>
          <div className="iq-live">
            <p>{text('طلبات دلوقتي', 'Live orders')}<span>{number(3)}</span></p>
            <ul>
              <li><b>#{number(48)}</b><span>{text('ترابيزة ٤', 'Table 4')}</span><em className="is-prep">{text('بيتحضّر', 'Preparing')}</em></li>
              <li><b>#{number(47)}</b><span>{text('استلام', 'Pickup')}</span><em className="is-ready">{text('جاهز', 'Ready')}</em></li>
              <li><b>#{number(46)}</b><span>{text('ترابيزة ٩', 'Table 9')}</span><em>{text('جديد', 'New')}</em></li>
            </ul>
          </div>
          <nav className="iq-phone-nav"><span className="is-on"><HouseIcon size={18} weight="fill" />{text('الرئيسية', 'Overview')}</span><span><IqIcon size={18} />IQ</span><span><HeadsetIcon size={18} />{text('الدعم', 'Support')}</span><span><UserIcon size={18} />{text('الحساب', 'Account')}</span></nav>
      </PhoneFrame>
      <div className="iq-askbar">
        <IqMark size={40} />
        <span className="iq-askbar-text">{typed || text('اسأل أي حاجة…', 'Ask anything…')}<i className="iq-caret" /></span>
        <span className="iq-askbar-send"><ArrowUpIcon size={20} weight="bold" /></span>
      </div>
    </div>
    <div className="page-container iq-anything-foot">
      <ul className="iq-chips">
        <li><ChartBarIcon size={16} weight="bold" aria-hidden="true" />{text('تقارير بسؤال', 'Reports by asking')}</li>
        <li><GearSixIcon size={16} weight="bold" aria-hidden="true" />{text('إجراءات بموافقتك', 'Actions with your approval')}</li>
        <li><SparkleIcon size={16} weight="bold" aria-hidden="true" />{text('عربي وإنجليزي', 'Arabic & English')}</li>
      </ul>
    </div>
  </section>;
}

/** Types `value` out letter by letter (all at once with reduced motion). */
function useTyped(value: string, reduced: boolean) {
  const [length, setLength] = useState(reduced ? value.length : 0);
  useEffect(() => {
    if (reduced) { setLength(value.length); return; }
    setLength(0);
    let index = 0;
    const timer = window.setInterval(() => { index += 1; setLength(index); if (index >= value.length) window.clearInterval(timer); }, 45);
    return () => window.clearInterval(timer);
  }, [value, reduced]);
  return value.slice(0, length);
}

function Spark({ tone }: { tone: 'coral' | 'plum' }) {
  const values = tone === 'coral' ? [5, 8, 6, 9, 7, 11, 9, 12, 10, 14, 12, 16] : [9, 6, 10, 7, 12, 8, 11, 9, 13, 10, 12, 11];
  return <span className={`iq-spark is-${tone}`}>{values.map((value, index) => <i key={index} style={{ '--h': value / 16, '--n': index } as CSSProperties} />)}</span>;
}

// --- Questions ------------------------------------------------------------------------------------------------------

function Faq() {
  const { text } = useLanguage();
  const items = [
    { q: text('هل IQ هيغيّر حاجة من غير موافقتي؟', 'Will IQ change anything without my approval?'), a: text('لأ. أي إجراء زي تعديل وردية أو تعليم صنف خلص بيتعرض عليك الأول، وما بيتنفذش غير لما توافق.', 'No. Any action, such as changing a shift or marking a dish sold out, is shown to you first and only happens once you approve it.') },
    { q: text('بيعتمد على بيانات إيه؟', 'What data does it use?'), a: text('بيانات مطعمك جوه بالهنا: الطلبات، المنيو، المخزون، الحضور، الولاء والتقييمات، حسب الخدمات اللي مفعّلها وصلاحيات الشخص اللي بيسأل.', 'Your restaurant’s data in Bilhanah: orders, menu, stock, attendance, loyalty and reviews, depending on the services you use and the permissions of whoever is asking.') },
    { q: text('بياناتي بتتشارك مع مطاعم تانية؟', 'Is my data shared with other restaurants?'), a: text('لأ. كل مطعم بيانات معزولة، وIQ بيجاوبك من بيانات مطعمك أنت بس.', 'No. Every restaurant’s data is isolated, and IQ answers from your restaurant’s data only.') },
    { q: text('هيبقى متاح إمتى وفي أنهي باقة؟', 'When will it be available, and in which plan?'), a: text('لسه بنبنيه. اطلب وصول مبكر من صفحة التواصل، وهنكلّمك أول ما يبقى جاهز ومعاه تفاصيل الباقات.', 'We are still building it. Ask for early access on the contact page and we will reach out as soon as it is ready, with plan details.') },
  ];
  return <section className="page-container iq-faq" aria-labelledby="iq-faq-title">
    <h2 id="iq-faq-title">{text('أسئلة شائعة', 'Frequently asked questions')}</h2>
    <div className="iq-faq-list">{items.map(item => <details key={item.q}>
      <summary>{item.q}<span aria-hidden="true" /></summary>
      <p>{item.a}</p>
    </details>)}</div>
  </section>;
}
