import { useEffect, useId, useRef } from 'react';
import type { CSSProperties } from 'react';
import { ArrowRightIcon, CaretLeftIcon, InfoIcon, MapPinIcon, NavigationArrowIcon, PhoneIcon, StorefrontIcon } from '@phosphor-icons/react';
import type { PublicBranch } from '@bilhanah/contracts';
import { arabicCount, useLanguage } from '../../lib/language';
import { branchesOf, branchTitle, openingPhrase, openState, useMinuteClock } from './branches';
import { joinAddress, readableTextOn } from './menu-format';
import { actionColor, browserBarColor, useMenuTheme } from './menu-theme';
import { MenuMasthead, type AvailableRestaurant } from './MenuView';
import { useWebAppIdentity } from './web-app';

/** Why the picker shows instead of the branch the diner was sent to. */
export type BranchNotice = 'link' | 'remembered' | 'gone';

export type BranchPickerProps = {
  restaurant: AvailableRestaurant;
  /** The branch the diner already chose, when they came back to change it. */
  current: string | null;
  notice: BranchNotice | null;
  onChoose: (slug: string) => void;
  /** Back to the current branch's menu, when there is one. */
  onBack: (() => void) | null;
};

/** Before the menu of a restaurant with several branches: where each one is, whether it is open, and a way to reach it. */
export function BranchPicker({ restaurant, current, notice, onChoose, onBack }: BranchPickerProps) {
  const { text, number } = useLanguage();
  const theme = useMenuTheme();
  const brand = actionColor(theme, restaurant.brandColor);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const branches = branchesOf(restaurant);
  // Ordering is a plan feature: a restaurant that takes no orders anywhere does not say so on every branch.
  const anyOrdering = branches.some(branch => branch.acceptingOrders);
  const now = useMinuteClock();

  useEffect(() => {
    document.title = text(`${restaurant.name} | الفروع`, `${restaurant.name} | Branches`);
  }, [restaurant.name, text]);
  useWebAppIdentity(restaurant.name, browserBarColor(theme, brand));
  // Coming back from a menu to change the branch: start at the question, for screen readers too.
  useEffect(() => { if (current) headingRef.current?.focus({ preventScroll: true }); }, [current]);

  const style = { '--brand': brand, '--on-brand': readableTextOn(brand) } as CSSProperties;
  const noticeText = notice && {
    link: text('الفرع اللي في اللينك مبقاش متاح. اختار فرع من دول.', 'The branch in this link is no longer available. Choose one of these.'),
    remembered: text('الفرع اللي اخترته المرة اللي فاتت مبقاش متاح. اختار فرع تاني.', 'The branch you chose last time is no longer available. Choose another one.'),
    gone: text('الفرع ده مبقاش متاح. اختار فرع تاني.', 'That branch is no longer available. Choose another one.'),
  }[notice];

  return <div className="menu-page branch-page" style={style}>
    <MenuMasthead restaurant={restaurant}>
      <div className="menu-meta">
        <span className="menu-address"><StorefrontIcon size={17} aria-hidden="true" /><span>{text(arabicCount(branches.length, ['فرع', 'فرعين', 'فروع'], number), `${branches.length} branches`)}</span></span>
      </div>
    </MenuMasthead>

    <main className="menu-container branch-body" aria-labelledby="branch-heading">
      {onBack && <button type="button" className="branch-back" onClick={onBack}><ArrowRightIcon size={18} className="directional-arrow" />{text('رجوع للمنيو', 'Back to the menu')}</button>}
      {noticeText && <p className="branch-notice" role="status"><InfoIcon size={20} weight="fill" aria-hidden="true" /><span>{noticeText}</span></p>}
      <h2 id="branch-heading" className="branch-heading" ref={headingRef} tabIndex={-1}>{text('اختار الفرع', 'Choose a branch')}</h2>
      <p className="branch-hint">{text('لكل فرع مواعيده وأسعاره، وطلبك بيروح للفرع اللي تختاره.', 'Each branch has its own hours and prices, and your order goes to the branch you choose.')}</p>
      <ul className="branch-list">
        {branches.map(branch => <BranchOption key={branch.slug} branch={branch} timeZone={restaurant.timezone} now={now} showOrdering={anyOrdering} current={branch.slug === current} onChoose={() => onChoose(branch.slug)} />)}
      </ul>
    </main>

    <footer className="menu-footer"><a href="https://bilhanah.com" target="_blank" rel="noopener">{text('منيو رقمي من بالهنا', 'Digital menu by Bilhanah')}</a></footer>
  </div>;
}

function BranchOption({ branch, timeZone, now, showOrdering, current, onChoose }: { branch: PublicBranch; timeZone: string; now: Date; showOrdering: boolean; current: boolean; onChoose: () => void }) {
  const { language, text } = useLanguage();
  const id = useId();
  const hours = openState(branch.openingHours, now, timeZone);
  const hoursText = hours && (hours.open
    ? text('مفتوح دلوقتي', 'Open now')
    : hours.next ? text(`مقفول · بيفتح ${openingPhrase(hours.next, language)}`, `Closed · opens ${openingPhrase(hours.next, language)}`) : text('مقفول دلوقتي', 'Closed now'));

  return <li className={`branch-option ${current ? 'is-current' : ''}`}>
    <button type="button" className="branch-choose" onClick={onChoose} aria-labelledby={`${id}-name`} aria-describedby={`${id}-details`} aria-current={current ? 'true' : undefined}>
      <span className="branch-name"><bdi id={`${id}-name`}>{branch.name}</bdi>{current && <span className="branch-current">{text('الفرع الحالي', 'Current branch')}</span>}</span>
      <span className="branch-details" id={`${id}-details`}>
        {/* Owners write the address in either language: it keeps its own direction and punctuation. */}
        <span className="branch-address"><MapPinIcon size={16} aria-hidden="true" /><bdi dir="auto">{joinAddress(branch.address, branch.city)}</bdi></span>
        {(hoursText || showOrdering) && <span className="branch-status">
          {hoursText && <span className={hours?.open ? 'branch-open' : 'branch-closed'}>{hoursText}</span>}
          {hoursText && showOrdering && <span aria-hidden="true">·</span>}
          {showOrdering && <span>{branch.acceptingOrders ? text('بياخد طلبات أونلاين', 'Taking orders online') : text('مش بياخد طلبات دلوقتي', 'Not taking orders now')}</span>}
        </span>}
      </span>
      <CaretLeftIcon size={18} className="branch-chevron directional-arrow" aria-hidden="true" />
    </button>
    <div className="branch-links">
      <a className="branch-link" href={`tel:${branch.phone}`} aria-label={text(`اتصل ب${branchTitle(branch.name, 'ar')}`, `Call ${branch.name}`)}><PhoneIcon size={18} aria-hidden="true" /><span>{text('اتصل', 'Call')}</span></a>
      {branch.mapUrl && <a className="branch-link" href={branch.mapUrl} target="_blank" rel="noopener noreferrer" aria-label={text(`الطريق إلى ${branchTitle(branch.name, 'ar')}`, `Directions to ${branch.name}`)}><NavigationArrowIcon size={18} aria-hidden="true" /><span>{text('الاتجاهات', 'Directions')}</span></a>}
    </div>
  </li>;
}
