import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeftIcon, BellRingingIcon, CakeIcon, CashRegisterIcon, ChartLineUpIcon, ChecksIcon, CheckIcon, ClockCountdownIcon,
  CrownSimpleIcon, FlowArrowIcon, GiftIcon, HandWavingIcon, IdentificationCardIcon, LockKeyIcon, NoteIcon, PaperPlaneTiltIcon,
  QrCodeIcon, SparkleIcon, StarIcon, TagSimpleIcon, UserCircleCheckIcon, UserMinusIcon, UsersThreeIcon, WarningIcon, WhatsappLogoIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { useCount, useShowcase } from '../hooks/useShowcase';
import { DASHBOARD_URL } from '../../../lib/config';
import { EarlyAccessForm } from '../components/EarlyAccessForm';
import { PhoneFrame } from '../components/PhoneFrame';
import './crm-page.css';

/**
 * /features/crm: Bilhanah CRM & WhatsApp, announced (coming soon). Every figure, name and message in the
 * animated mock-ups is illustrative; the page says so. Each showcase plays only while on screen, can be
 * paused, and shows its final frame when the visitor prefers reduced motion.
 */

function SectionHead({ kicker, title, lead, id }: { kicker: ReactNode; title: ReactNode; lead: string; id: string }) {
  return <header className="crm-head">
    <p className="crm-kicker">{kicker}</p>
    <h2 id={id}>{title}</h2>
    <p className="crm-lead">{lead}</p>
  </header>;
}

export function CrmPage() {
  const { text } = useLanguage();
  usePageTitle('CRM وواتساب للمطاعم | بالهنا', 'Restaurant CRM & WhatsApp | Bilhanah');
  return <div className="crm-page">
    <section className="crm-hero" aria-labelledby="page-title">
      <div className="page-container crm-hero-copy">
        <p className="crm-eyebrow"><WhatsappLogoIcon size={18} weight="fill" aria-hidden="true" /><span>{text('Bilhanah CRM: العملاء وواتساب للمطاعم', 'Bilhanah CRM: customers & WhatsApp for restaurants')}</span></p>
        <h1 id="page-title" tabIndex={-1}>{text('اعرف كل زبون.', 'Know every guest.')}<br />{text('ورجّعه تاني على واتساب.', 'Bring them back on WhatsApp.')}</h1>
        <p className="crm-hero-lead">{text(
          'ملف واحد لكل زبون من المنيو والكاشير، وصندوق واتساب لفريقك كله، وحملات ورسايل تلقائية بتتبعت في الوقت الصح. كله جوه لوحة بالهنا.',
          'One profile per guest from your menu and POS, a shared WhatsApp inbox for your team, and campaigns and automations that go out at the right moment. All inside your Bilhanah dashboard.')}</p>
        <EarlyAccessForm product="Bilhanah CRM" page="the CRM & WhatsApp page (/features/crm)" />
        <p className="crm-customer">{text('عميل بالهنا بالفعل؟', 'Already a Bilhanah customer?')} <a href={DASHBOARD_URL ? `${DASHBOARD_URL}/loyalty` : '/features/loyalty'}>{text('ابدأ ببرنامج الولاء النهارده', 'Start with loyalty today')}<ArrowLeftIcon className="directional-arrow" size={16} aria-hidden="true" /></a></p>
      </div>
      <div className="page-container crm-hero-visual"><Customer360 /></div>
    </section>

    <IdentitySection />
    <InboxSection />
    <AutomationSection />
    <CampaignSection />
    <SegmentsSection />
    <EverythingSection />
    <TrustSection />

    <section className="crm-final" aria-labelledby="crm-cta-title">
      <div className="page-container">
        <span className="crm-final-mark" aria-hidden="true"><WhatsappLogoIcon size={30} weight="fill" /></span>
        <h2 id="crm-cta-title">{text('كن من أول المطاعم اللي تجرّبه.', 'Be among the first restaurants to try it.')}</h2>
        <p>{text('بنفتح الـ CRM وواتساب لعدد محدود من المطاعم الأول. سيب إيميلك ونكلّمك أول ما يبقى جاهز.', 'We are opening CRM & WhatsApp to a small group of restaurants first. Leave your email and we will reach out as soon as it is ready.')}</p>
        <EarlyAccessForm product="Bilhanah CRM" page="the CRM & WhatsApp page (/features/crm), closing section" />
        <Link className="crm-final-link" to="/pricing">{text('شوف الباقات', 'See pricing')}<ArrowLeftIcon className="directional-arrow" size={16} aria-hidden="true" /></Link>
      </div>
    </section>
    <p className="page-container crm-disclaimer">{text('الأسماء والأرقام والرسايل في الصفحة دي أمثلة توضيحية.', 'Names, figures and messages on this page are illustrative examples.')}</p>
  </div>;
}

// --- Hero: the customer profile filling in ------------------------------------------------------------

function Customer360() {
  const { text, number } = useLanguage();
  const show = useShowcase(7, 1500);
  const { step, reduced } = show;
  const orders = useCount(step >= 1 ? 24 : 0, reduced);
  const spent = useCount(step >= 1 ? 7850 : 0, reduced);
  const points = useCount(step >= 3 ? 1240 : 0, reduced);
  const customers = [
    { name: text('منى أحمد', 'Mona Ahmed'), meta: text('VIP · من يومين', 'VIP · 2 days ago'), tone: 'vip', active: true },
    { name: text('كريم سامي', 'Karim Samy'), meta: text('منتظم · امبارح', 'Regular · yesterday'), tone: 'regular' },
    { name: text('ياسمين فؤاد', 'Yasmin Fouad'), meta: text('جديدة · النهارده', 'New · today'), tone: 'new' },
    { name: text('عمر خالد', 'Omar Khaled'), meta: text('غايب من ٤٥ يوم', 'Away 45 days'), tone: 'away' },
  ];
  const timeline: { icon: Icon; title: string; meta: string; tone: string }[] = [
    { icon: QrCodeIcon, title: text('طلب من منيو QR · ترابيزة ٧', 'Ordered from the QR menu · Table 7'), meta: text('٣٤٠ ج.م', 'EGP 340'), tone: 'coral' },
    { icon: CashRegisterIcon, title: text('دفع على الكاشير', 'Paid at the POS'), meta: text('كارت', 'Card'), tone: 'plum' },
    { icon: GiftIcon, title: text('كسب ٣٤ نقطة', 'Earned 34 points'), meta: text('الرصيد ١٬٢٤٠', 'Balance 1,240'), tone: 'mango' },
    { icon: WhatsappLogoIcon, title: text('واتساب: طلبك جاهز', 'WhatsApp: your order is ready'), meta: text('اتقرت', 'Read'), tone: 'green' },
    { icon: StarIcon, title: text('قيّم الزيارة ٥ نجوم', 'Rated the visit 5 stars'), meta: text('«الأكل تحفة»', '“Lovely food”'), tone: 'mango' },
  ];
  return <div className="crm-showcase" ref={show.ref}>
    <div className="crm-window" aria-hidden="true">
      <div className="crm-window-bar"><i /><i /><i /><span>bilhanah.app/crm/customers</span></div>
      <div className="c360">
        <aside className="c360-list">
          <div className="c360-search">{text('ابحث بالاسم أو الموبايل', 'Search name or phone')}</div>
          {customers.map((customer, index) => <div key={customer.name} className={`c360-row ${customer.active ? 'is-active' : ''}`} style={{ '--i': index } as CSSProperties}>
            <span className={`c360-avatar tone-${customer.tone}`}>{customer.name.charAt(0)}</span>
            <span><b>{customer.name}</b><small>{customer.meta}</small></span>
          </div>)}
        </aside>
        <div className="c360-profile">
          <div className="c360-who">
            <span className="c360-avatar is-big tone-vip">{customers[0]!.name.charAt(0)}</span>
            <div><b>{customers[0]!.name}</b><small dir="ltr">+20 100 ••• 4567</small></div>
            <span className="c360-chip is-vip"><CrownSimpleIcon size={13} weight="fill" />VIP</span>
            <span className="c360-chip"><WhatsappLogoIcon size={13} weight="fill" />{text('موافقة واتساب', 'WhatsApp opt-in')}</span>
          </div>
          <div className="c360-stats">
            <div><small>{text('الطلبات', 'Orders')}</small><b>{number(orders)}</b></div>
            <div><small>{text('إجمالي الصرف', 'Total spent')}</small><b>{number(spent)} <em>{text('ج.م', 'EGP')}</em></b></div>
            <div><small>{text('متوسط الطلب', 'Avg. order')}</small><b>{number(orders ? Math.round(spent / orders) : 0)} <em>{text('ج.م', 'EGP')}</em></b></div>
            <div><small>{text('النقاط', 'Points')}</small><b>{number(points)}</b></div>
          </div>
          <p className="c360-sub">{text('رحلة الزبون', 'Timeline')}</p>
          <ol className="c360-timeline">
            {timeline.map((entry, index) => <li key={entry.title} className={`tone-${entry.tone} ${step >= index + 2 ? 'is-in' : ''}`}>
              <span className="c360-dot"><entry.icon size={14} weight="bold" /></span>
              <span><b>{entry.title}</b><small>{entry.meta}</small></span>
            </li>)}
          </ol>
        </div>
      </div>
    </div>
  </div>;
}

// --- One profile from every channel ------------------------------------------------------------------

function IdentitySection() {
  const { text, number } = useLanguage();
  const show = useShowcase(3, 2200);
  const { step, reduced } = show;
  const orders = useCount([22, 23, 24][step]!, reduced);
  const sources: { icon: Icon; title: string; body: string }[] = [
    { icon: QrCodeIcon, title: text('منيو QR', 'QR menu'), body: text('طلب من الترابيزة', 'Ordered at the table') },
    { icon: CashRegisterIcon, title: text('الكاشير', 'POS'), body: text('طلب على الكاونتر', 'Ordered at the counter') },
    { icon: WhatsappLogoIcon, title: text('واتساب', 'WhatsApp'), body: text('رسالة للمطعم', 'Messaged the restaurant') },
  ];
  return <section id="crm-profile" className="page-container crm-section crm-split" aria-labelledby="crm-identity-title">
    <SectionHead id="crm-identity-title" kicker={text('ملف العميل 360°', 'Customer 360°')}
      title={text('زبون واحد، ملف واحد، من كل مكان', 'One guest, one profile, from everywhere')}
      lead={text('طلب النهارده من منيو الـQR والأسبوع الجاي دفع على الكاشير؟ برقم موبايله الاتنين بيروحوا لنفس الملف، من غير تكرار ومن غير خلط بين المطاعم.',
        'Ordered from the QR menu today and paid at the POS next week? Their phone number links both to the same profile: no duplicates, and never mixed between restaurants.')} />
    <div className="crm-showcase" ref={show.ref}>
      <div className="idf" aria-hidden="true">
        <div className="idf-sources">{sources.map((source, index) => <div key={source.title} className={`idf-source ${step === index ? 'is-live' : ''}`}>
          <span><source.icon size={20} weight="bold" /></span><b>{source.title}</b><small>{source.body}</small>
        </div>)}</div>
        <div className="idf-wires">{sources.map((source, index) => <i key={source.title} className={step === index ? 'is-live' : ''} />)}</div>
        <div className="idf-profile">
          <span className="c360-avatar is-big tone-vip">{text('م', 'M')}</span>
          <b>{text('منى أحمد', 'Mona Ahmed')}</b>
          <small dir="ltr">+20 100 ••• 4567</small>
          <div className="idf-count"><b>{number(orders)}</b><span>{text('طلب', 'orders')}</span></div>
          <span key={step} className="idf-toast">{step === 2 ? text('+ رسالة جديدة', '+ new message') : text('+ طلب جديد', '+ new order')}</span>
        </div>
      </div>
    </div>
  </section>;
}

// --- Shared WhatsApp inbox -----------------------------------------------------------------------------

function InboxSection() {
  const { text } = useLanguage();
  const show = useShowcase(7, 1700);
  const { step } = show;
  const conversations = [
    { name: text('منى أحمد', 'Mona Ahmed'), last: text('ينفع أحجز ترابيزة لـ٤؟', 'Can I book a table for 4?'), time: '8:41', unread: step < 3 ? 2 : 0, active: true },
    { name: text('كريم سامي', 'Karim Samy'), last: text('شكرًا جدًا 🙏', 'Thanks a lot 🙏'), time: '8:12', unread: 0 },
    { name: text('ياسمين فؤاد', 'Yasmin Fouad'), last: text('الطلب وصل؟', 'Has my order arrived?'), time: '7:55', unread: 1 },
    { name: text('عمر خالد', 'Omar Khaled'), last: text('عرض الويك إند لسه شغال؟', 'Is the weekend offer still on?'), time: text('امبارح', 'Yesterday'), unread: 0 },
  ];
  return <section className="crm-section crm-band" aria-labelledby="crm-inbox-title">
    <div className="page-container">
      <SectionHead id="crm-inbox-title" kicker={<><WhatsappLogoIcon size={16} weight="fill" aria-hidden="true" />{text('صندوق واتساب مشترك', 'Shared WhatsApp inbox')}</>}
        title={text('رقم واتساب واحد، والفريق كله بيرد', 'One WhatsApp number, your whole team replying')}
        lead={text('كل المحادثات في مكان واحد: وزّعها على الموظفين، اكتب ملاحظات داخلية الزبون مش بيشوفها، واعرف مين الزبون وطلباته وهو بيكلمك.',
          'Every conversation in one place: assign it to a teammate, leave internal notes the guest never sees, and see who the guest is and what they order while you chat.')} />
      <div className="crm-showcase" ref={show.ref}>
        <div className="crm-window inbox" aria-hidden="true">
          <div className="crm-window-bar"><i /><i /><i /><span>bilhanah.app/crm/inbox</span><em className="wa-badge"><WhatsappLogoIcon size={14} weight="fill" />WhatsApp Business</em></div>
          <div className="inbox-grid">
            <aside className="inbox-list">
              <div className="inbox-tabs"><b>{text('مفتوحة', 'Open')}</b><span>{text('مستنية', 'Pending')}</span><span>{text('اتحلّت', 'Resolved')}</span></div>
              {conversations.map(conversation => <div key={conversation.name} className={`inbox-row ${conversation.active ? 'is-active' : ''}`}>
                <span className="c360-avatar">{conversation.name.charAt(0)}</span>
                <span className="inbox-row-copy"><b>{conversation.name}</b><small>{conversation.last}</small></span>
                <span className="inbox-row-meta"><small>{conversation.time}</small>{conversation.unread > 0 && <em>{conversation.unread}</em>}</span>
              </div>)}
            </aside>
            <div className="inbox-chat">
              <div className="inbox-chat-head">
                <span className="c360-avatar">{text('م', 'M')}</span>
                <span><b className="wa-name">{text('منى أحمد', 'Mona Ahmed')}<WhatsappLogoIcon size={14} weight="fill" /></b><small>{step >= 3 ? text('مع: سارة (الاستقبال)', 'Assigned: Sara (front desk)') : text('مش متوزّعة', 'Unassigned')}</small></span>
                <span className="inbox-window"><ClockCountdownIcon size={13} weight="bold" />{text('نافذة الرد: ٢٣ ساعة', 'Reply window: 23h')}</span>
              </div>
              <div className="inbox-thread">
                <div className={`bubble in ${step >= 0 ? 'is-in' : ''}`}>{text('مساء الخير! ينفع أحجز ترابيزة لـ٤ بكرة الساعة ٨؟', 'Good evening! Can I book a table for 4 tomorrow at 8?')}<time>8:41</time></div>
                <div className={`bubble in ${step >= 1 ? 'is-in' : ''}`}>{text('ولو فيه مكان جنب الشباك يبقى أحسن 😊', 'A spot by the window would be lovely 😊')}<time>8:41</time></div>
                <div className={`bubble note ${step >= 2 ? 'is-in' : ''}`}><NoteIcon size={13} weight="bold" />{text('ملاحظة داخلية: زبونة VIP، ادّيها ترابيزة ٧', 'Internal note: VIP guest, give her table 7')}</div>
                {step === 3 && <div className="bubble typing"><i /><i /><i /></div>}
                <div className={`bubble out ${step >= 4 ? 'is-in' : ''}`}>{text('أكيد يا منى! حجزنالك ترابيزة ٧ جنب الشباك بكرة الساعة ٨ 🌿', 'Of course, Mona! Table 7 by the window is yours tomorrow at 8 🌿')}
                  <time>8:43 <Ticks state={step >= 6 ? 'read' : step >= 5 ? 'delivered' : 'sent'} /></time></div>
              </div>
              <div className="inbox-composer"><span>{text('اكتب رد…', 'Type a reply…')}</span><b><TagSimpleIcon size={13} weight="bold" />{text('قوالب', 'Templates')}</b><i><WhatsappLogoIcon size={17} weight="fill" /></i></div>
            </div>
            <aside className="inbox-side">
              <span className="c360-avatar is-big tone-vip">{text('م', 'M')}</span>
              <b>{text('منى أحمد', 'Mona Ahmed')}</b>
              <span className="c360-chip is-vip"><CrownSimpleIcon size={12} weight="fill" />VIP</span>
              <dl>
                <div><dt>{text('الطلبات', 'Orders')}</dt><dd>24</dd></div>
                <div><dt>{text('الصرف', 'Spent')}</dt><dd>{text('٧٬٨٥٠ ج.م', 'EGP 7,850')}</dd></div>
                <div><dt>{text('آخر زيارة', 'Last visit')}</dt><dd>{text('من يومين', '2 days ago')}</dd></div>
                <div><dt>{text('النقاط', 'Points')}</dt><dd>1,240</dd></div>
              </dl>
              <p>{text('بتحب: مكرونة بالجمبري، ليمون نعناع', 'Loves: shrimp pasta, mint lemonade')}</p>
            </aside>
          </div>
        </div>
      </div>
      <ul className="crm-ticks-legend">
        <li><Ticks state="sent" />{text('اتبعتت', 'Sent')}</li>
        <li><Ticks state="delivered" />{text('وصلت', 'Delivered')}</li>
        <li><Ticks state="read" />{text('اتقرت', 'Read')}</li>
        <li><NoteIcon size={16} weight="bold" aria-hidden="true" />{text('ملاحظات داخلية للفريق بس', 'Team-only internal notes')}</li>
      </ul>
    </div>
  </section>;
}

function Ticks({ state }: { state: 'sent' | 'delivered' | 'read' }) {
  return state === 'sent' ? <CheckIcon className="ticks" size={14} weight="bold" aria-hidden="true" /> : <ChecksIcon className={`ticks ${state === 'read' ? 'is-read' : ''}`} size={14} weight="bold" aria-hidden="true" />;
}

// --- Automations ---------------------------------------------------------------------------------------

type Recipe = { key: string; icon: Icon; name: string; trigger: string; condition: string; actions: string[]; message: string; buttons: string[]; reply: string; runs: number };

function AutomationSection() {
  const { text, number } = useLanguage();
  const recipes: Recipe[] = [
    { key: 'winback', icon: HandWavingIcon, name: text('رجّع الغايبين', 'Win-back'),
      trigger: text('الزبون مجاش من ٣٠ يوم', 'Guest has not visited for 30 days'),
      condition: text('موافق على رسايل التسويق', 'Has opted in to marketing'),
      actions: [text('ابعت قالب «وحشتنا»', 'Send the “We miss you” template'), text('ضيف تاج: رجوع', 'Add tag: Win-back')],
      message: text('وحشتنا يا كريم! 🍝 مستنينك الأسبوع ده، وليك حلو مجاني مع طلبك. اكتب STOP لو مش عايز رسايل.', 'We miss you, Karim! 🍝 Come by this week and dessert is on us. Reply STOP to opt out.'),
      buttons: [text('احجز ترابيزة', 'Book a table'), text('وقّف العروض', 'Stop promotions')], reply: text('هعدّي الجمعة إن شاء الله 😍', 'I’ll come by on Friday 😍'), runs: 312 },
    { key: 'birthday', icon: CakeIcon, name: text('عيد الميلاد', 'Birthday'),
      trigger: text('النهارده عيد ميلاد الزبون', 'It is the guest’s birthday'),
      condition: text('موافق على رسايل التسويق', 'Has opted in to marketing'),
      actions: [text('ضيف ١٠٠ نقطة هدية', 'Add 100 gift points'), text('ابعت قالب «عيد ميلاد سعيد»', 'Send the “Happy birthday” template')],
      message: text('كل سنة وانتي طيبة يا ياسمين 🎂 ضفنالك ١٠٠ نقطة هدية، استخدميها في زيارتك الجاية.', 'Happy birthday, Yasmin 🎂 We added 100 gift points for your next visit.'),
      buttons: [text('شوف نقاطي', 'See my points')], reply: text('ميرسي جدًا! 🥹', 'Thank you so much! 🥹'), runs: 46 },
    { key: 'followup', icon: StarIcon, name: text('بعد الطلب', 'Order follow-up'),
      trigger: text('الطلب اكتمل', 'An order is completed'),
      condition: text('أول طلب للزبون', 'It is the guest’s first order'),
      actions: [text('استنى ساعتين', 'Wait 2 hours'), text('ابعت قالب «قيّم زيارتك»', 'Send the “Rate your visit” template')],
      message: text('شكرًا إنك اخترتنا يا عمر 🙏 قولنا رأيك في الزيارة في ثانية: ★★★★★', 'Thanks for choosing us, Omar 🙏 Tell us how it went in a second: ★★★★★'),
      buttons: [text('قيّم زيارتك', 'Rate your visit')], reply: text('الأكل كان تحفة ⭐️⭐️⭐️⭐️⭐️', 'The food was amazing ⭐️⭐️⭐️⭐️⭐️'), runs: 528 },
    { key: 'vip', icon: CrownSimpleIcon, name: text('زبون VIP', 'VIP recognition'),
      trigger: text('الزبون عدّى ٥٬٠٠٠ ج.م صرف', 'Guest passes EGP 5,000 spent'),
      condition: text('لسه مش VIP', 'Not VIP yet'),
      actions: [text('ضيف تاج VIP', 'Add tag: VIP'), text('بلّغ مدير الفرع', 'Notify the branch manager')],
      message: text('أهلًا بيكي في نادي VIP يا منى 👑 من النهارده ليكي أولوية في الحجز ومفاجآت مخصوص.', 'Welcome to our VIP club, Mona 👑 Priority bookings and special surprises from today.'),
      buttons: [text('احجز بأولوية', 'Book with priority')], reply: text('ده أحلى خبر النهارده 💛', 'Best news of my day 💛'), runs: 19 },
  ];
  // One timeline through every recipe: trigger, condition, two actions, the message, read, then a pause.
  const nodes = 4;
  const frames = nodes + 3;
  const show = useShowcase(recipes.length * frames, 1100);
  const recipeIndex = Math.floor(show.step / frames);
  const step = show.step % frames;
  const recipe = recipes[recipeIndex]!;
  const choose = (index: number) => show.setStep(index * frames + (show.reduced ? frames - 1 : 0));
  const flow: { kind: 'trigger' | 'condition' | 'action'; label: string; title: string }[] = [
    { kind: 'trigger', label: text('لما', 'When'), title: recipe.trigger },
    { kind: 'condition', label: text('لو', 'If'), title: recipe.condition },
    ...recipe.actions.map(action => ({ kind: 'action' as const, label: text('اعمل', 'Then'), title: action })),
  ];
  return <section className="page-container crm-section" aria-labelledby="crm-auto-title">
    <SectionHead id="crm-auto-title" kicker={text('الرسايل التلقائية', 'Automations')}
      title={text('رسايل بتتبعت لوحدها، في اللحظة الصح', 'Messages that send themselves, at the right moment')}
      lead={text('اختار الحدث، حط الشرط، وحدد اللي يحصل: رسالة واتساب، نقاط، تاج، أو تنبيه للفريق. وكل تشغيل متسجّل، ومفيش زبون بيوصله نفس الرسالة مرتين.',
        'Pick the event, set the condition and choose what happens: a WhatsApp message, points, a tag or a heads-up to your team. Every run is logged, and no guest gets the same message twice.')} />
    <div className="auto-tabs" role="tablist" aria-label={text('أمثلة', 'Examples')}>
      {recipes.map((entry, index) => <button key={entry.key} type="button" role="tab" aria-selected={index === recipeIndex} onClick={() => choose(index)}>
        <entry.icon size={16} weight="bold" aria-hidden="true" />{entry.name}
      </button>)}
    </div>
    <div className="crm-showcase" ref={show.ref}>
      <div className="auto" role="tabpanel" aria-label={recipe.name}>
        <div className="auto-builder">
          <div className="auto-bar">
            <span className="auto-bar-icon" aria-hidden="true"><recipe.icon size={18} weight="bold" /></span>
            <b>{recipe.name}</b>
            <span className="auto-live"><i aria-hidden="true" />{text('شغّالة', 'Active')}</span>
            <small>{text(`${number(recipe.runs)} رسالة الشهر ده`, `${number(recipe.runs)} sent this month`)}</small>
          </div>
          <ol className="auto-flow">
            {flow.map((node, index) => <li key={`${recipe.key}-${index}`} className={`auto-node is-${node.kind} ${step >= index ? 'is-on' : ''} ${step === index ? 'is-now' : ''}`}>
              <span className="auto-node-icon" aria-hidden="true">{node.kind === 'trigger' ? <BellRingingIcon size={18} weight="bold" /> : node.kind === 'condition' ? <FlowArrowIcon size={18} weight="bold" /> : index === 2 ? <WhatsappLogoIcon size={18} weight="fill" /> : <SparkleIcon size={18} weight="bold" />}</span>
              <span><small>{node.label}</small><b>{node.title}</b></span>
              <em className="auto-node-state" aria-hidden="true">{step > index ? <CheckIcon size={12} weight="bold" /> : number(index + 1)}</em>
              {index < flow.length - 1 && <i className={`auto-wire ${step > index ? 'is-on' : ''}`} aria-hidden="true" />}
            </li>)}
            <li className="auto-add" aria-hidden="true">+ {text('خطوة جديدة', 'Add a step')}</li>
          </ol>
        </div>
        <PhoneFrame className="auto-device" screenClassName="wa-screen">
          <div className="wa-head">
            <span className="wa-back">‹</span>
            <img src="/brand/bilhanah-mark.svg" alt="" />
            <span className="wa-who"><b>{text('بيت الزيتون', 'Olive House')}<i className="wa-verified">✓</i></b><small>{text('حساب أعمال', 'Business account')}</small></span>
          </div>
          <div className="wa-chat">
            <span className="wa-day">{text('النهارده', 'Today')}</span>
            <div key={`${recipe.key}-m`} className={`wa-msg is-in ${step >= nodes ? 'is-on' : ''}`}>
              <p>{recipe.message}</p><time>9:00</time>
              <div className="wa-buttons">{recipe.buttons.map(button => <span key={button}>{button}</span>)}</div>
            </div>
            <div key={`${recipe.key}-r`} className={`wa-msg is-out ${step >= nodes + 1 ? 'is-on' : ''}`}>
              <p>{recipe.reply}</p><time>9:02 <Ticks state="read" /></time>
            </div>
          </div>
          <div className="wa-input"><span className="wa-plus">+</span><span className="wa-field">{text('رسالة', 'Message')}</span><span className="wa-mic"><WhatsappLogoIcon size={14} weight="fill" /></span></div>
        </PhoneFrame>
      </div>
    </div>
  </section>;
}

// --- Campaigns -----------------------------------------------------------------------------------------

function CampaignSection() {
  const { text, number } = useLanguage();
  const show = useShowcase(6, 1400);
  const { step, reduced } = show;
  const sent = useCount(step >= 4 ? 1240 : 0, reduced);
  const delivered = useCount(step >= 4 ? 1198 : 0, reduced);
  const read = useCount(step >= 5 ? 812 : 0, reduced);
  const orders = useCount(step >= 5 ? 64 : 0, reduced);
  const wizard = [text('الجمهور', 'Audience'), text('القالب', 'Template'), text('التكلفة', 'Cost'), text('إرسال', 'Send')];
  const bars = [
    { label: text('اتبعتت', 'Sent'), value: sent, of: 1240 },
    { label: text('وصلت', 'Delivered'), value: delivered, of: 1240 },
    { label: text('اتقرت', 'Read'), value: read, of: 1240 },
  ];
  return <section className="crm-section crm-band is-dark" aria-labelledby="crm-camp-title">
    <div className="page-container crm-split">
      <SectionHead id="crm-camp-title" kicker={<><WhatsappLogoIcon size={16} weight="fill" aria-hidden="true" />{text('حملات واتساب', 'WhatsApp campaigns')}</>}
        title={text('حملة واتساب في ٤ خطوات، والنتيجة قدامك', 'A WhatsApp campaign in 4 steps, results in front of you')}
        lead={text('اختار الشريحة، اختار قالب معتمد من واتساب، شوف التكلفة المتوقعة قبل ما تبعت، وتابع اللي وصل واتقرا والطلبات اللي جت من الحملة. والزبون اللي مش موافق مش هيوصله حاجة.',
          'Pick a segment, choose a WhatsApp-approved template, see the estimated cost before you send, then follow what was delivered and read and the orders it brought. Guests who have not opted in receive nothing.')} />
      <div className="crm-showcase" ref={show.ref}>
        <div className="camp" aria-hidden="true">
          <ol className="camp-steps">{wizard.map((label, index) => <li key={label} className={step > index ? 'is-done' : step === index ? 'is-now' : ''}>
            <span>{step > index ? <CheckIcon size={12} weight="bold" /> : number(index + 1)}</span>{label}
          </li>)}</ol>
          <div className="camp-card">
            <div className="camp-row"><span><UsersThreeIcon size={16} weight="bold" />{text('غايبين من ٣٠ يوم', 'Away 30+ days')}</span><b>{text('١٬٢٤٠ زبون موافق', '1,240 opted-in guests')}</b></div>
            <div className={`camp-row ${step >= 1 ? 'is-in' : ''}`}><span><TagSimpleIcon size={16} weight="bold" />{text('قالب: وحشتنا', 'Template: We miss you')}</span><b className="camp-approved">{text('معتمد', 'Approved')}</b></div>
            <div className={`camp-row ${step >= 2 ? 'is-in' : ''}`}><span><ChartLineUpIcon size={16} weight="bold" />{text('التكلفة المتوقعة', 'Estimated cost')}</span><b>{text('بتظهر قبل الإرسال', 'Shown before sending')}</b></div>
            <div className={`camp-send ${step >= 3 ? 'is-on' : ''}`}><WhatsappLogoIcon size={18} weight="fill" />{step >= 4 ? text('بتتبعت…', 'Sending…') : text('ابعت الحملة', 'Send campaign')}</div>
          </div>
          <div className={`camp-results ${step >= 4 ? 'is-in' : ''}`}>
            {bars.map(bar => <div key={bar.label} className="camp-bar"><span>{bar.label}</span><i><b style={{ transform: `scaleX(${bar.value / bar.of})` }} /></i><strong>{number(bar.value)}</strong></div>)}
            <div className="camp-orders"><GiftIcon size={18} weight="bold" /><span>{text('طلبات جت من الحملة', 'Orders from the campaign')}</span><strong>{number(orders)}</strong></div>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

// --- Segments, everything, trust --------------------------------------------------------------------------

function SegmentsSection() {
  const { text } = useLanguage();
  const segments: { icon: Icon; name: string; rule: string; tone: string }[] = [
    { icon: SparkleIcon, name: text('جداد', 'New'), rule: text('أول طلب في آخر ١٤ يوم', 'First order in the last 14 days'), tone: 'green' },
    { icon: UserCircleCheckIcon, name: text('منتظمين', 'Regulars'), rule: text('بيزوروك كل أسبوع تقريبًا', 'Visit about every week'), tone: 'plum' },
    { icon: CrownSimpleIcon, name: 'VIP', rule: text('عدّوا حد الصرف أو الزيارات اللي تحدده', 'Past the spend or visit threshold you set'), tone: 'mango' },
    { icon: ChartLineUpIcon, name: text('بيصرفوا كتير', 'High spenders'), rule: text('إجمالي صرف فوق رقم معيّن', 'Total spend above your threshold'), tone: 'coral' },
    { icon: WarningIcon, name: text('في خطر', 'At risk'), rule: text('زياراتهم بتقل عن العادي', 'Visiting less than they used to'), tone: 'coral' },
    { icon: ClockCountdownIcon, name: text('غايبين', 'Inactive'), rule: text('مجوش من ٣٠ يوم', 'No visit in 30 days'), tone: 'plum' },
    { icon: UserMinusIcon, name: text('خسرناهم', 'Lost'), rule: text('مجوش من ٩٠ يوم', 'No visit in 90 days'), tone: 'muted' },
    { icon: TagSimpleIcon, name: text('شريحتك أنت', 'Your own'), rule: text('صرف، طلبات، صنف، فرع، نقاط، تاج… و/أو', 'Spend, orders, dish, branch, points, tags… AND / OR'), tone: 'green' },
  ];
  return <section className="page-container crm-section" aria-labelledby="crm-seg-title">
    <SectionHead id="crm-seg-title" kicker={text('الشرائح', 'Segments')}
      title={text('شرائح جاهزة، بتتحدث لوحدها', 'Ready-made segments that keep themselves up to date')}
      lead={text('الزبون بيدخل ويخرج من الشريحة حسب تصرفه الفعلي، فحملتك دايمًا رايحة للناس الصح.', 'Guests move in and out of segments as they actually behave, so your campaigns always reach the right people.')} />
    <ul className="seg-grid">{segments.map((segment, index) => <li key={segment.name} className={`tone-${segment.tone}`} style={{ '--i': index } as CSSProperties}>
      <span aria-hidden="true"><segment.icon size={20} weight="bold" /></span><b>{segment.name}</b><small>{segment.rule}</small>
    </li>)}</ul>
  </section>;
}

function EverythingSection() {
  const { text } = useLanguage();
  const features: { icon: Icon; title: string; body: string }[] = [
    { icon: IdentificationCardIcon, title: text('ملف لكل زبون', 'Guest profiles'), body: text('الطلبات والصرف وأول وآخر زيارة والأصناف المفضلة.', 'Orders, spend, first and last visit, favourite dishes.') },
    { icon: UsersThreeIcon, title: text('من غير تكرار', 'No duplicates'), body: text('الموبايل بيتوحّد، ودمج الملفات المكررة بإيدك.', 'Normalized phone numbers, and manual merging of duplicates.') },
    { icon: NoteIcon, title: text('ملاحظات وتاجات', 'Notes & tags'), body: text('فريقك يكتب ملاحظات داخلية ويصنّف الزباين.', 'Your team leaves internal notes and tags guests.') },
    { icon: WhatsappLogoIcon, title: text('صندوق واتساب', 'WhatsApp inbox'), body: text('توزيع، حالات، بحث، وتحديث لحظي.', 'Assignment, statuses, search and live updates.') },
    { icon: TagSimpleIcon, title: text('قوالب معتمدة', 'Approved templates'), body: text('تزامن مع واتساب، وحالة الموافقة واضحة.', 'Synced with WhatsApp, approval status at a glance.') },
    { icon: PaperPlaneTiltIcon, title: text('حملات', 'Campaigns'), body: text('جدولة، تكلفة متوقعة، وإلغاء في أي وقت.', 'Scheduling, cost estimates and cancel anytime.') },
    { icon: FlowArrowIcon, title: text('رسايل تلقائية', 'Automations'), body: text('عيد ميلاد، رجوع، متابعة، VIP، ومحطات.', 'Birthday, win-back, follow-up, VIP and milestones.') },
    { icon: GiftIcon, title: text('الولاء والمكافآت', 'Loyalty & rewards'), body: text('مربوط ببرنامج النقاط اللي عندك بالفعل.', 'Connected to the points program you already run.') },
    { icon: StarIcon, title: text('الآراء والتقييمات', 'Feedback & reviews'), body: text('طلب تقييم بعد الزيارة، ومتابعة الزعلانين.', 'Ask for a rating after a visit and follow up unhappy guests.') },
    { icon: ChartLineUpIcon, title: text('إحصائيات العملاء', 'CRM analytics'), body: text('الراجعين، معدل الرجوع، قيمة الزبون، أداء الرسايل.', 'Returning guests, retention, lifetime value, messaging performance.') },
  ];
  return <section className="crm-section crm-band" aria-labelledby="crm-all-title">
    <div className="page-container">
      <SectionHead id="crm-all-title" kicker={text('كل اللي جوه', 'Everything inside')} title={text('منصة واحدة لعلاقتك بزباينك', 'One platform for your guest relationships')}
        lead={text('مربوطة بالمنيو والكاشير والولاء والتقييمات اللي بتستخدمها النهارده.', 'Connected to the menu, POS, loyalty and reviews you use today.')} />
      <ul className="all-grid">{features.map(feature => <li key={feature.title}>
        <span aria-hidden="true"><feature.icon size={22} weight="duotone" /></span><b>{feature.title}</b><small>{feature.body}</small>
      </li>)}</ul>
    </div>
  </section>;
}

function TrustSection() {
  const { text } = useLanguage();
  const points: { icon: Icon; title: string; body: string }[] = [
    { icon: WhatsappLogoIcon, title: text('واتساب الرسمي', 'Official WhatsApp'), body: text('مبني على WhatsApp Business Platform الرسمية من Meta، برقم مطعمك أنت.', 'Built on Meta’s official WhatsApp Business Platform, with your restaurant’s own number.') },
    { icon: UserCircleCheckIcon, title: text('موافقة الزبون أولًا', 'Consent first'), body: text('مفيش رسايل تسويق من غير موافقة، والزبون يوقفها بكلمة STOP.', 'No marketing without opt-in, and guests stop it by replying STOP.') },
    { icon: LockKeyIcon, title: text('بياناتك ليك لوحدك', 'Your data stays yours'), body: text('كل مطعم معزول تمامًا، وبيانات الربط مشفّرة.', 'Every restaurant is fully isolated, and connection credentials are encrypted.') },
    { icon: UsersThreeIcon, title: text('صلاحيات للفريق', 'Team permissions'), body: text('تحدد مين يشوف المحادثات ومين يرد ومين يبعت حملات.', 'Decide who sees conversations, who replies and who sends campaigns.') },
  ];
  return <section className="page-container crm-section" aria-labelledby="crm-trust-title">
    <SectionHead id="crm-trust-title" kicker={text('الأمان والخصوصية', 'Security & privacy')} title={text('معمول باحترام لزبونك', 'Built with respect for your guests')}
      lead={text('بنتبع سياسات واتساب ونحافظ على خصوصية بيانات زباينك.', 'We follow WhatsApp’s policies and keep your guests’ data private.')} />
    <ul className="trust-grid">{points.map(point => <li key={point.title}>
      <span aria-hidden="true"><point.icon size={22} weight="bold" /></span><div><b>{point.title}</b><small>{point.body}</small></div>
    </li>)}</ul>
  </section>;
}
