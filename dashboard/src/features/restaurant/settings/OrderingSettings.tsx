import { Link } from 'react-router';
import { ArmchairIcon, BagIcon, BellRingingIcon, TimerIcon } from '@phosphor-icons/react';
import { type OrderingSettings as Ordering, type OwnerRestaurant, SERVICE_REQUEST_THROTTLE } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Switch } from '../../../components/Switch';
import { errorMessage } from '../../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { useBranchList } from '../../branches/workspace';
import { useRestaurant } from '../queries';
import { PerBranchNotice } from './PerBranchNotice';
import { useSaveRestaurant } from './useSaveRestaurant';

export type OrderingPatch = Partial<Record<'orderingEnabled' | 'acceptsDineIn' | 'acceptsPickup' | 'ordersPaused', boolean>>;

/** Ordering on/off, dine-in and pickup, and what diners see. Each switch saves right away. */
export function OrderingSettings() {
  const { text } = useLanguage();
  usePageTitle('الطلبات', 'Ordering');
  const restaurant = useRestaurant();
  const list = useBranchList();
  const save = useSaveRestaurant();
  // Service requests are set for the whole restaurant, so they show even when ordering is set per branch.
  const service = <>
    <PrepTimeSetting restaurant={restaurant} busy={save.isPending} onChange={minutes => save.mutate({ orderPrepMinutes: minutes })} />
    <ServiceRequestSwitches restaurant={restaurant} busy={save.isPending} onChange={patch => save.mutate(patch)} />
  </>;
  if (list.branches.filter(branch => branch.isActive).length > 1) return <><PerBranchNotice kind="ordering" />{service}</>;
  return <div className="settings-grid ordering-settings">
    <div className="settings-main">
      <OrderingSwitches ordering={restaurant.ordering} busy={save.isPending} error={save.isError ? save.error : null} onChange={patch => save.mutate(patch)} owner tablesPath="/tables" />
      {service}
    </div>
    <aside className="settings-aside" aria-labelledby="diners-title">
      <h2 id="diners-title">{text('الزبون هيشوف إيه؟', 'What diners see')}</h2>
      <ul className="tips">
        <li>{text('زرار «أضف للطلب» جنب كل صنف متاح، وسلة فيها الإجمالي.', 'An “Add” button on every available dish and a basket with the total.')}</li>
        <li>{text('الصالة: بيختار طاولته (أو بتتحدد من الكود). التيك أواي: بيكتب اسمه ورقمه.', 'Dine-in: the table comes from the code (or they pick it). Pickup: they enter a name and phone number.')}</li>
        <li>{text('بعد الطلب بيتابع حالته لحظة بلحظة: اتقبل، بيتحضّر، جاهز.', 'After ordering they follow its status live: accepted, preparing, ready.')}</li>
        <li>{text('لو وقّفت الطلبات مؤقتًا أو المطعم مقفول حسب المواعيد، بيشوف المنيو بس.', 'While orders are paused or you are closed (opening hours), they see the menu only.')}</li>
        <li>{text('الأصناف اللي خلصت مش بتتطلب.', 'Sold-out dishes cannot be ordered.')}</li>
      </ul>
    </aside>
  </div>;
}

/**
 * The ordering switches (on/off, dine-in, pickup) for the restaurant or one branch.
 * `owner`: offers the plans page when ordering is not part of the plan.
 */
export function OrderingSwitches({ ordering, busy, error, onChange, owner, tablesPath }: {
  ordering: Ordering; busy: boolean; error: unknown; onChange: (patch: OrderingPatch) => void; owner: boolean; tablesPath: string;
}) {
  const { text } = useLanguage();
  const locked = !ordering.included;
  const types = [
    { key: 'acceptsDineIn' as const, checked: ordering.acceptsDineIn, icon: ArmchairIcon, label: text('طلبات الصالة', 'Dine-in'), hint: text('الزبون يمسح كود الطاولة ويطلب، والطلب يوصلك عليه اسم الطاولة.', 'Diners scan the table’s code and order; you see the table name on the order.') },
    { key: 'acceptsPickup' as const, checked: ordering.acceptsPickup, icon: BagIcon, label: text('تيك أواي', 'Pickup'), hint: text('الزبون يطلب ويسيب اسمه ورقم موبايله، ويستلم من المطعم.', 'Diners order with their name and phone number and collect at the counter.') },
  ];
  const onlyOne = types.filter(type => type.checked).length === 1;

  return <>
      {error != null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
      {locked && <Alert kind="info" live={false} title={text('الطلبات مش ضمن باقتك', 'Ordering is not part of your plan')}
        actions={owner ? <Link className="button button-primary button-small" to="/subscription">{text('شوف الباقات', 'See plans')}</Link> : undefined}>
        {text('باقة «منيو» فيها المنيو بس. اشترك في «منيو وطلبات» عشان الزباين يطلبوا من موبايلهم.', 'The “Menu” plan includes the menu only. Choose “Menu & Orders” to let diners order from their phones.')}
      </Alert>}
      <section className={`section ${locked ? 'is-locked' : ''}`} aria-labelledby="ordering-title">
        <div className="section-head"><div>
          <h2 id="ordering-title">{text('الطلب من المنيو', 'Ordering from your menu')}</h2>
          <p>{text('لما تشغّلها، الزبون يقدر يختار الأصناف من المنيو ويبعت الطلب، ويوصلك على لوحة الطلبات لحظتها.', 'When on, diners pick dishes on your menu and send the order; it reaches your order board instantly.')}</p>
        </div></div>
        <Switch checked={ordering.enabled} disabled={locked || busy} onChange={orderingEnabled => onChange({ orderingEnabled })}
          label={text('استقبل طلبات', 'Take orders')}
          description={ordering.enabled ? text('شغالة: الزباين شايفين زرار الطلب.', 'On: diners see the order button.') : text('مقفولة: الزباين شايفين المنيو بس.', 'Off: diners see the menu only.')} />
      </section>
      <section className="section" aria-labelledby="types-title">
        <div className="section-head"><div><h2 id="types-title">{text('أنواع الطلبات', 'Order types')}</h2><p>{text('اختار نوع واحد على الأقل.', 'Choose at least one.')}</p></div></div>
        <div className="order-types">
          {types.map(type => <label key={type.key} className={`order-type ${type.checked ? 'is-checked' : ''}`}>
            <input type="checkbox" checked={type.checked} disabled={locked || busy || (type.checked && onlyOne)}
              onChange={event => onChange({ [type.key]: event.target.checked })} />
            <span><strong>{type.label}</strong><small>{type.hint}</small></span>
          </label>)}
        </div>
        {ordering.acceptsDineIn && <p className="muted ordering-tables-hint">{text('لطلبات الصالة، ضيف طاولاتك واطبع كود لكل طاولة:', 'For dine-in, add your tables and print a code for each:')} <Link className="link-action" to={tablesPath}>{text('الطاولات', 'Tables')}</Link></p>}
      </section>
  </>;
}

const COOLDOWNS = [0, 30, 60, 120, 300, 600] as const;
const HOURLY_LIMITS = [5, 10, 20, 40, 60, 100] as const;
type ServicePatch = { serviceRequestsEnabled?: boolean; serviceRequestCooldownSeconds?: number; serviceRequestHourlyLimit?: number };

/**
 * Table service requests from the menu: on or off, and how they are throttled. A closed request
 * of the same type cannot be repeated from a table within the cooldown, and a table sends at most
 * the hourly limit; an open one of the same type is simply shown again.
 */
const PREP_TIMES = [10, 15, 20, 25, 30, 45, 60] as const;

/** The usual time from accepting an order to ready: diners see it as an estimate, staff can change it per order. */
function PrepTimeSetting({ restaurant, busy, onChange }: { restaurant: OwnerRestaurant; busy: boolean; onChange: (minutes: number | null) => void }) {
  const { text, number } = useLanguage();
  const current = restaurant.orderPrepMinutes;
  const choices = current === null || PREP_TIMES.includes(current as typeof PREP_TIMES[number]) ? PREP_TIMES : [...PREP_TIMES, current].sort((a, b) => a - b);
  return <section className="section" aria-labelledby="prep-settings-title" data-testid="prep-settings">
    <h2 id="prep-settings-title"><TimerIcon size={20} aria-hidden="true" /> {text('وقت التحضير المتوقع', 'Expected preparation time')}</h2>
    <label className="field">
      <span className="field-label">{text('الطلب بيجهز عادةً خلال', 'Orders are usually ready in')}</span>
      <select className="select" value={current ?? ''} disabled={busy} onChange={event => onChange(event.target.value ? Number(event.target.value) : null)}>
        <option value="">{text('من غير وقت متوقع', 'No estimate')}</option>
        {choices.map(value => <option key={value} value={value}>{text(`${number(value)} دقيقة`, `${value} min`)}</option>)}
      </select>
      <span className="field-hint">{text('أول ما تقبل الطلب، الزبون يشوف في صفحة المتابعة إمتى متوقع يجهز. تقدر تغيّر الوقت لكل طلب وانت بتقبله.', 'Once you accept an order, the diner sees when to expect it on the tracking page. You can change the time for each order as you accept it.')}</span>
    </label>
  </section>;
}

function ServiceRequestSwitches({ restaurant, busy, onChange }: { restaurant: OwnerRestaurant; busy: boolean; onChange: (patch: ServicePatch) => void }) {
  const { text, number } = useLanguage();
  const settings = restaurant.serviceRequests;
  const cooldownLabel = (seconds: number) => (seconds === 0 ? text('من غير انتظار', 'No wait')
    : seconds < 60 ? text(`${number(seconds)} ثانية`, `${seconds} seconds`) : text(`${number(seconds / 60)} دقيقة`, `${seconds / 60} min`));
  const cooldowns = COOLDOWNS.includes(settings.cooldownSeconds as typeof COOLDOWNS[number]) ? COOLDOWNS : [...COOLDOWNS, settings.cooldownSeconds].sort((a, b) => a - b);
  const limits = HOURLY_LIMITS.includes(settings.hourlyLimit as typeof HOURLY_LIMITS[number]) ? HOURLY_LIMITS : [...HOURLY_LIMITS, settings.hourlyLimit].sort((a, b) => a - b);
  return <section className="section" aria-labelledby="service-settings-title" data-testid="service-settings">
    <h2 id="service-settings-title"><BellRingingIcon size={20} aria-hidden="true" /> {text('طلبات الخدمة', 'Service requests')}</h2>
    <Switch checked={settings.enabled} disabled={busy} onChange={enabled => onChange({ serviceRequestsEnabled: enabled })}
      label={text('الزبون يقدر ينادي الويتر من المنيو', 'Diners can call the staff from the menu')}
      description={text('اللي قاعد على ترابيزة بيطلب الويتر أو الحساب أو مية أو مناديل أو تنضيف، والطلب يوصل لصفحة «طلبات الخدمة».', 'Seated diners ask for a waiter, the bill, water, napkins or cleaning; requests reach the Service requests page.')} />
    {settings.enabled && <div className="form-grid">
      <label className="field">
        <span className="field-label">{text('الانتظار قبل تكرار نفس الطلب', 'Wait before the same request again')}</span>
        <select className="select" value={settings.cooldownSeconds} disabled={busy} onChange={event => onChange({ serviceRequestCooldownSeconds: Number(event.target.value) })}>
          {cooldowns.filter(value => value <= SERVICE_REQUEST_THROTTLE.cooldownSeconds.max).map(value => <option key={value} value={value}>{cooldownLabel(value)}</option>)}
        </select>
        <span className="field-hint">{text('بعد ما الطلب يخلص، نفس الترابيزة متقدرش تطلبه تاني قبل الوقت ده.', 'Once handled, the same table cannot ask for it again before this.')}</span>
      </label>
      <label className="field">
        <span className="field-label">{text('أقصى عدد طلبات للترابيزة في الساعة', 'Most requests per table an hour')}</span>
        <select className="select" value={settings.hourlyLimit} disabled={busy} onChange={event => onChange({ serviceRequestHourlyLimit: Number(event.target.value) })}>
          {limits.map(value => <option key={value} value={value}>{number(value)}</option>)}
        </select>
      </label>
    </div>}
  </section>;
}
