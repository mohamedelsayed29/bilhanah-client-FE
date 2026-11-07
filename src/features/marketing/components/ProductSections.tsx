import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeftIcon, BuildingsIcon, CalendarCheckIcon, CashRegisterIcon, ChairIcon, ChartLineUpIcon, CheckIcon, ChefHatIcon,
  ClockIcon, CoffeeIcon, DeviceMobileIcon, DevicesIcon, ForkKnifeIcon, GiftIcon, HeadsetIcon, HeartStraightIcon, MinusIcon, MoneyIcon,
  PackageIcon, QrCodeIcon, SparkleIcon, StarIcon, StorefrontIcon, TranslateIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import { usePlans } from '../hooks/usePlans';
import type { PlanId } from '../data/plans';
import { serviceGroups, services } from '../data/services';
import type { Service, ServiceKey } from '../data/services';
import './product-sections.css';

export const serviceIcons: Record<string, Icon> = {
  qr: QrCodeIcon, phone: DeviceMobileIcon, sparkle: SparkleIcon, register: CashRegisterIcon, chef: ChefHatIcon,
  table: ChairIcon, branch: StorefrontIcon, gift: GiftIcon, star: StarIcon, chart: ChartLineUpIcon,
  box: PackageIcon, cash: MoneyIcon, clock: ClockIcon,
};

const planOrder: PlanId[] = ['menu', 'orders', 'advanced'];
const planRank = (plan: PlanId) => planOrder.indexOf(plan);

function usePlanName() {
  const { language } = useLanguage();
  const plans = usePlans();
  return (id: PlanId) => plans.find(plan => plan.id === id)?.name[language] ?? id;
}

/** Plain facts about the product; no invented figures. */
export function TrustBar() {
  const { text, number } = useLanguage();
  const items: { icon: Icon; label: string }[] = [
    { icon: CalendarCheckIcon, label: text(`${number(30)} يوم تجربة مجانية`, `${number(30)}-day free trial`) },
    { icon: HeadsetIcon, label: text('دعم فني ٢٤/٧', '24/7 support') },
    { icon: TranslateIcon, label: text('عربي وإنجليزي', 'Arabic & English') },
    { icon: DevicesIcon, label: text('شغال على أي جهاز', 'Works on any device') },
    { icon: DeviceMobileIcon, label: text('من غير أبلكيشن للزبون', 'No app for your guests') },
  ];
  return <section className="trust-bar" aria-label={text('ليه تثق في بالهنا', 'Why trust Bilhanah')}>
    <ul className="page-container trust-list">{items.map(({ icon: ItemIcon, label }) => <li key={label}><ItemIcon size={20} weight="duotone" aria-hidden="true" /><span>{label}</span></li>)}</ul>
  </section>;
}

/** Everything Bilhanah does, in four groups. */
export function Services() {
  const { text, language } = useLanguage();
  const planName = usePlanName();
  return <section id="services" className="services-section page-container section-space" aria-labelledby="services-title">
    <div className="product-heading">
      <p className="product-eyebrow">{text('خدماتنا', 'What we offer')}</p>
      <h2 id="services-title">{text('كل اللي مطعمك محتاجه، في منصة واحدة', 'Everything your restaurant needs, on one platform')}</h2>
      <p>{text('من أول ما الزبون يعمل سكان، لحد ما تقفل الوردية وتشوف أرقامك.', 'From the guest’s first scan to closing the shift and reading your numbers.')}</p>
    </div>
    <div className="service-groups">{serviceGroups.map(group => <article id={group.id} className={`service-group tone-${group.tone}`} key={group.id}>
      <header><h3>{group.title[language]}</h3><p>{group.line[language]}</p></header>
      <ul>{services.filter(service => service.group === group.id).map(service => {
        const ServiceIcon = serviceIcons[service.icon];
        const body = <>
          <span className="service-icon" aria-hidden="true"><ServiceIcon size={22} weight="duotone" /></span>
          <span className="service-copy"><strong>{service.name[language]}</strong><small>{service.line[language]}</small></span>
          <span className="service-plan">{service.from === 'menu' ? text('كل الباقات', 'Every plan') : text(`من ${planName(service.from)}`, `From ${planName(service.from)}`)}</span>
        </>;
        return <li key={service.key}>{service.slug ? <Link className="service-item" to={`/features/${service.slug}`}>{body}</Link> : <div className="service-item">{body}</div>}</li>;
      })}</ul>
    </article>)}</div>
  </section>;
}

/** The icon that stands for each group of services. */
const groupIcons: Record<string, Icon> = { guests: DeviceMobileIcon, operations: CashRegisterIcon, loyalty: HeartStraightIcon, numbers: ChartLineUpIcon };

/** The home page's short version: the four groups, each linking on to /features. */
export function ServicesTeaser() {
  const { text, number, language } = useLanguage();
  return <section id="services" className="services-section is-compact page-container" aria-labelledby="services-title">
    <div className="product-heading">
      <p className="product-eyebrow">{text('خدماتنا', 'What we offer')}</p>
      <h2 id="services-title">{text('كل اللي مطعمك محتاجه، في منصة واحدة', 'Everything your restaurant needs, on one platform')}</h2>
      <p>{text('شغّل اللي محتاجه بس، وزوّد وقت ما تحب.', 'Switch on only what you need, and add more whenever you like.')}</p>
    </div>
    <div className="teaser-grid">{serviceGroups.map((group, index) => {
      const GroupIcon = groupIcons[group.id];
      return <Link className={`teaser-card tone-${group.tone}`} to={`/features#${group.id}`} key={group.id}>
        <span className="teaser-top">
          <span className="teaser-icon" aria-hidden="true"><GroupIcon size={22} weight="duotone" /></span>
          <span className="teaser-num">{number(0)}{number(index + 1)}</span>
        </span>
        <h3>{group.title[language]}</h3>
        <span className="teaser-line">{group.line[language]}</span>
        <ul>{services.filter(service => service.group === group.id).map(service => {
          const ServiceIcon = serviceIcons[service.icon];
          return <li key={service.key}><ServiceIcon size={17} weight="duotone" aria-hidden="true" />{service.name[language]}</li>;
        })}</ul>
        <span className="teaser-more">{text('اعرف أكتر', 'Learn more')}<ArrowLeftIcon className="directional-arrow" size={15} aria-hidden="true" /></span>
      </Link>;
    })}</div>
  </section>;
}

/** Pick the services you want and see which plan covers them. */
export function ModularServices({ onSelect }: { onSelect: (plan: PlanId) => void }) {
  const { text, number, language } = useLanguage();
  const plans = usePlans();
  const [on, setOn] = useState<Set<ServiceKey>>(() => new Set<ServiceKey>(['menu']));
  const toggle = (key: ServiceKey) => setOn(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    // Same rules as the dashboard: loyalty needs ordering, and the diner features need the digital menu.
    if (next.has('loyalty')) next.add('ordering');
    if (next.has('ordering') || next.has('reviews') || next.has('upsell')) next.add('menu');
    return next;
  });
  const needed = useMemo(() => services.filter(service => on.has(service.key))
    .reduce<PlanId>((best, service) => planRank(service.from) > planRank(best) ? service.from : best, 'menu'), [on]);
  const plan = plans.find(item => item.id === needed)!;
  const required = (service: Service) => (service.key === 'menu' && ['ordering', 'reviews', 'upsell', 'loyalty'].some(key => on.has(key as ServiceKey)))
    || (service.key === 'ordering' && on.has('loyalty'));
  return <section id="build" className="modular-section section-space" aria-labelledby="modular-title"><div className="page-container modular-inner">
    <div className="modular-copy">
      <p className="product-eyebrow">{text('على قد احتياجك', 'Only what you need')}</p>
      <h2 id="modular-title">{text('ابدأ بالمنيو بس، أو شغّل كل حاجة', 'Start with the menu, or switch everything on')}</h2>
      <p>{text('كل خدمة بتتفعّل وتتقفل من لوحة التحكم. عندك كاشير أو منيو خاص بيك؟ استخدم من بالهنا اللي ناقصك بس، وبياناتك مبتتمسحش لما تقفل خدمة.', 'Each service is switched on and off from the dashboard. Have your own POS or menu? Use only what you are missing from Bilhanah; switching a service off never deletes its data.')}</p>
      <div className="modular-result" aria-live="polite">
        <span>{text('الباقة اللي تكفيك', 'The plan that covers it')}</span>
        <strong>{plan.name[language]}</strong>
        <p><b>{number(plan.price)}</b> {text('جنيه في الشهر', 'EGP a month')}{on.has('branches') && <small>{text(' · الفروع حسب الباقة', ' · branches depend on the plan')}</small>}</p>
        <button className="button button-teal" onClick={() => onSelect(plan.id)}>{text('ابدأ تجربتك', 'Start your trial')}<ArrowLeftIcon className="directional-arrow" size={18} /></button>
      </div>
    </div>
    <ul className="modular-switches" aria-label={text('اختار الخدمات', 'Choose services')}>{services.map(service => {
      const ServiceIcon = serviceIcons[service.icon];
      const checked = on.has(service.key);
      const locked = required(service);
      return <li key={service.key}><label className={`modular-switch ${checked ? 'is-on' : ''}`}>
        <ServiceIcon size={20} weight="duotone" aria-hidden="true" />
        <span>{service.name[language]}{locked && <small>{text('مطلوبة للي اخترته', 'Needed by your choice')}</small>}</span>
        <input type="checkbox" role="switch" checked={checked} disabled={locked} onChange={() => toggle(service.key)} />
        <i aria-hidden="true" />
      </label></li>;
    })}</ul>
  </div></section>;
}

export { OrderJourney } from './OrderJourney';

/** What each plan includes, row by row; follows PLAN_FEATURES in the contracts. */
export function PlanComparison() {
  const { text, number, language } = useLanguage();
  const plans = usePlans();
  const rows: { label: string; values: (string | boolean)[] }[] = [
    ...services.filter(service => service.key !== 'branches').map(service => ({
      label: service.name[language],
      values: planOrder.map(plan => planRank(plan) >= planRank(service.from)),
    })),
    { label: text('تنبيه الزبون لما الطلب يجهز', 'Order-ready alerts for guests'), values: [false, false, true] },
    { label: text('عدد الفروع', 'Branches'), values: [number(1), text(`حتى ${number(3)}`, `Up to ${number(3)}`), text(`حتى ${number(10)}`, `Up to ${number(10)}`)] },
    { label: text('دعم فني ٢٤/٧', '24/7 support'), values: [true, true, true] },
  ];
  return <section className="compare-section page-container" aria-labelledby="compare-title">
    <h3 id="compare-title">{text('قارن الباقات بالتفصيل', 'Compare plans in detail')}</h3>
    <div className="compare-scroll" tabIndex={0}>
      <table className="compare-table">
        <thead><tr><th scope="col">{text('الخدمة', 'Service')}</th>{plans.map(plan => <th scope="col" key={plan.id} className={plan.featured ? 'is-featured' : ''}>{plan.name[language]}<small>{number(plan.price)} {text('جنيه/شهر', 'EGP/mo')}</small></th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={planOrder[index]} className={plans[index]?.featured ? 'is-featured' : ''}>
          {typeof value === 'string' ? value : value
            ? <CheckIcon size={18} weight="bold" className="compare-yes" aria-label={text('متاح', 'Included')} />
            : <MinusIcon size={18} className="compare-no" aria-label={text('مش متاح', 'Not included')} />}
        </td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="compare-note">{text('الكاشير (POS) بيتفعّل للمطعم من إدارة المنصة. الخزنة والحضور متاحين في كل الباقات.', 'The POS is enabled for each restaurant by the platform team. Cash drawer and attendance come with every plan.')}</p>
  </section>;
}

/** Who Bilhanah is for, with a sensible starting point for each. */
export function Audiences({ onSelect }: { onSelect: (plan: PlanId) => void }) {
  const { text, language } = useLanguage();
  const planName = usePlanName();
  const items: { icon: Icon; title: string; body: string; plan: PlanId; picks: ServiceKey[] }[] = [
    { icon: CoffeeIcon, title: text('الكافيهات', 'Cafés'), body: text('منيو بالصور والأحجام، طلب من الترابيزة، ونقاط تخلّي الزبون يرجع كل يوم.', 'A menu with photos and sizes, table ordering, and points that bring regulars back daily.'), plan: 'orders', picks: ['menu', 'ordering', 'loyalty', 'cash'] },
    { icon: ForkKnifeIcon, title: text('المطاعم الصغيرة', 'Small restaurants'), body: text('ابدأ بالمنيو الرقمي، وزوّد الطلبات والمطبخ والكاشير لما تكون جاهز.', 'Start with the digital menu and add ordering, the kitchen and the POS when ready.'), plan: 'menu', picks: ['menu', 'reports', 'cash', 'attendance'] },
    { icon: BuildingsIcon, title: text('السلاسل والفروع', 'Chains & branches'), body: text('حتى ١٠ فروع، فريق وصلاحيات لكل فرع، ومخزون وتقارير لكل فرع ولكلهم مع بعض.', 'Up to 10 branches, a team and permissions for each, and stock and reports per branch and overall.'), plan: 'advanced', picks: ['branches', 'pos', 'inventory', 'reports'] },
    { icon: StorefrontIcon, title: text('الفود كورت والأكشاك', 'Food courts & kiosks'), body: text('طلب للاستلام وتنبيه الزبون لما طلبه يجهز، من غير زحمة قدام الكاونتر.', 'Pickup orders and a ready alert for the guest, with no crowd at the counter.'), plan: 'advanced', picks: ['ordering', 'kitchen', 'pos', 'reviews'] },
  ];
  return <section className="audience-section page-container section-space" aria-labelledby="audience-title">
    <div className="product-heading">
      <p className="product-eyebrow">{text('لمين بالهنا؟', 'Who is it for?')}</p>
      <h2 id="audience-title">{text('مناسب لكل شكل أكل وشرب', 'Made for every kind of food business')}</h2>
    </div>
    <div className="audience-grid">{items.map(({ icon: ItemIcon, title, body, plan, picks }) => <article className="audience-card" key={title}>
      <ItemIcon className="audience-icon" size={26} aria-hidden="true" />
      <h3>{title}</h3><p>{body}</p>
      <p className="audience-picks"><span>{text('بيستخدموا', 'They use')}</span>{picks.map(key => services.find(item => item.key === key)!.name[language]).join(' · ')}</p>
      <button className="text-link" onClick={() => onSelect(plan)}>{text(`ابدأ بباقة ${planName(plan)}`, `Start with ${planName(plan)}`)}<ArrowLeftIcon className="directional-arrow" size={17} /></button>
    </article>)}</div>
  </section>;
}
