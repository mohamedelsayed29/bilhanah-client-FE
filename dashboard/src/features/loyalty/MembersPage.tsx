import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { CaretLeftIcon, CaretRightIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Pagination } from '../../components/Pagination';
import { Skeleton } from '../../components/Skeleton';
import { loyaltyApi } from '../../lib/api/endpoints';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useDebounced } from '../../lib/use-debounced';
import { useWorkspace } from '../branches/workspace';
import { Chips, SearchBox } from '../inventory/controls';
import { loyaltyKeys, useLoyaltyFormat, useLoyaltySettings } from './shared';

type Sort = 'recent' | 'balance' | 'lifetime' | 'joined';
const PAGE_SIZE = 25;

/** Every member of the program: find one by name or phone, sorted by activity, balance or tenure. */
export function LoyaltyMembersPage() {
  const { text, language, number } = useLanguage();
  usePageTitle('أعضاء برنامج الولاء', 'Loyalty members');
  const { to } = useWorkspace();
  const format = useLoyaltyFormat();
  const settings = useLoyaltySettings();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim(), 300);
  const params = { q: q || undefined, sort, page, pageSize: PAGE_SIZE };
  const members = useQuery({ queryKey: loyaltyKeys.members(params), queryFn: () => loyaltyApi.members(params), placeholderData: keepPreviousData });
  const tiers = settings.data?.tiersEnabled;
  const Caret = language === 'ar' ? CaretLeftIcon : CaretRightIcon;
  return <section className="card ly-members" aria-labelledby="ly-members-title" data-testid="ly-members-page">
    <header className="ly-card-head">
      <div><h2 id="ly-members-title">{text('أعضاء البرنامج', 'Program members')}</h2>
        <p className="muted">{text('الزبون بيبقى عضو أول ما يطلب برقم موبايله. دوّر بالاسم أو آخر أرقام الموبايل.', 'A diner becomes a member on their first order with a phone number. Search by name or the last digits of the phone.')}</p></div>
    </header>
    <div className="ly-toolbar">
      <SearchBox value={search} onChange={value => { setSearch(value); setPage(1); }} label={text('دوّر باسم أو رقم موبايل', 'Search by name or phone')} />
      <Chips value={sort} onChange={value => { setSort(value); setPage(1); }} label={text('الترتيب', 'Sort')} options={[
        { value: 'recent', label: text('آخر نشاط', 'Recent activity') },
        { value: 'balance', label: text('أعلى رصيد', 'Highest balance') },
        { value: 'lifetime', label: text('أكتر نقاط', 'Most earned') },
        { value: 'joined', label: text('الأحدث', 'Newest') },
      ]} />
    </div>
    {members.isError && !members.data && <ErrorPanel error={members.error} onRetry={() => void members.refetch()} />}
    {members.isPending && <div className="ly-pad"><Skeleton height={220} /></div>}
    {members.data && members.data.items.length === 0 && <div className="empty-state" data-testid="ly-members-empty">
      <span className="empty-state-icon" aria-hidden="true"><UsersThreeIcon size={28} /></span>
      <h3>{q ? text('مفيش عضو بالبحث ده', 'No member matches') : text('لسه مفيش أعضاء', 'No members yet')}</h3>
      <p>{q ? text('جرّب جزء من الاسم أو آخر ٤ أرقام من الموبايل.', 'Try part of the name or the last 4 digits of the phone.') : text('أول ما زبون يطلب برقم موبايله والبرنامج شغال، هيظهر هنا.', 'Once a diner orders with their phone number while the program is on, they show up here.')}</p>
    </div>}
    {members.data && members.data.items.length > 0 && <>
      <div className="table-scroll"><table className={`data-table ly-table ${members.isPlaceholderData ? 'is-refreshing' : ''}`}>
        <caption className="visually-hidden">{text('أعضاء برنامج الولاء', 'Loyalty members')}</caption>
        <thead><tr>
          <th scope="col">{text('العضو', 'Member')}</th>
          {tiers && <th scope="col">{text('المستوى', 'Tier')}</th>}
          <th scope="col" className="num">{text('الرصيد', 'Balance')}</th>
          <th scope="col" className="num">{text('نقاط اتكسبت', 'Earned')}</th>
          <th scope="col" className="num">{text('طلبات', 'Orders')}</th>
          <th scope="col">{text('آخر نشاط', 'Last activity')}</th>
          <th scope="col"><span className="visually-hidden">{text('افتح', 'Open')}</span></th>
        </tr></thead>
        <tbody>{members.data.items.map(member => <tr key={member.id} data-testid="ly-member-row">
          <td><Link className="ly-member-link" to={to(`/loyalty/members/${member.id}`)}><strong>{member.name}</strong><small className="ltr">{member.phone}</small></Link></td>
          {tiers && <td>{member.tierName ? <span className="badge badge-guava">{member.tierName}</span> : <span className="muted">—</span>}</td>}
          <td className="num"><strong>{number(member.balance)}</strong></td>
          <td className="num">{number(member.lifetimePoints)}</td>
          <td className="num">{number(member.orders)}</td>
          <td><span title={format.dateTime(member.lastActivityAt)}>{format.relative(member.lastActivityAt)}</span></td>
          <td className="ly-row-open"><Link to={to(`/loyalty/members/${member.id}`)} aria-label={text(`افتح ${member.name}`, `Open ${member.name}`)}><Caret size={16} aria-hidden="true" /></Link></td>
        </tr>)}</tbody>
      </table></div>
      <div className="ly-pad"><Pagination page={page} pageSize={PAGE_SIZE} total={members.data.total} onChange={setPage} label={text('صفحات الأعضاء', 'Member pages')} /></div>
    </>}
  </section>;
}
