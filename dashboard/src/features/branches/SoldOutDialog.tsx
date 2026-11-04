import { useState } from 'react';
import type { BranchMenuItem } from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { fill, useCopy } from '../../lib/copy';
import { useLanguage } from '../../lib/language';
import { useBranchMenuQuery } from '../restaurant/queries';
import { BranchPicker, useBranchScope } from './BranchScope';
import { filterMenu, kitchenToggle, menuSummary } from './branch-menu';
import { useSetBranchItem } from './branch-mutations';

/**
 * The kitchen's quick sold-out list for one branch: every dish diners can see there, with a
 * switch. Kitchen screens may only change availability, so nothing else is offered.
 */
export function SoldOutDialog({ branch: given, open, onClose }: { branch: { id: string; name: string } | null; open: boolean; onClose: () => void }) {
  const t = useCopy();
  const { language, count } = useLanguage();
  const scope = useBranchScope();
  // A screen showing every branch picks the branch here.
  const [picked, setPicked] = useState<string | null>(null);
  const branch = given ?? scope.choices.find(entry => entry.id === picked) ?? null;
  const menu = useBranchMenuQuery(open && branch ? branch.id : null);
  const [query, setQuery] = useState('');
  const setItem = useSetBranchItem(branch?.id ?? '');
  const toggle = (item: BranchMenuItem) => {
    const available = kitchenToggle(item);
    setItem.mutate({
      item, change: { available },
      done: saved => fill(saved.effective.available ? t.branchMenu.markedAvailable : t.branchMenu.markedSoldOut, { name: dishName(saved, language), branch: branch?.name ?? '' }),
    });
  };
  // Dishes diners cannot see at this branch are left out: there is nothing to sell out.
  const categories = menu.data ? filterMenu(menu.data.categories.filter(category => category.isVisible).map(category => ({ ...category, items: category.items.filter(item => item.effective.visible) })), { query }) : [];
  const summary = menu.data ? menuSummary(menu.data) : null;
  return <Dialog open={open} onClose={onClose} title={t.branchMenu.soldOutTitle} footer={<Button variant="secondary" onClick={onClose}>{t.branchMenu.close}</Button>}>
    {!given && <BranchPicker value={picked} onChange={setPicked} hint={branch ? undefined : t.branchMenu.soldOutPick} />}
    {branch && <div className="sold-out">
      <p className="muted">{fill(t.branchMenu.soldOutHint, { branch: branch.name })}</p>
      {summary && <p className="sold-out-summary" role="status">{summary.soldOut > 0 ? fill(t.branchMenu.soldOutSummary, { items: count(summary.soldOut, 'item') }) : t.branchMenu.soldOutNone}</p>}
      <label className="visually-hidden" htmlFor="sold-out-search">{t.branchMenu.search}</label>
      <input id="sold-out-search" className="input" type="search" placeholder={t.branchMenu.search} value={query} onChange={event => setQuery(event.target.value)} data-autofocus />
      {menu.isPending && <div className="skeleton-stack"><Skeleton height={48} /><Skeleton height={48} /><Skeleton height={48} /></div>}
      {menu.isError && <ErrorPanel error={menu.error} onRetry={() => void menu.refetch()} />}
      {menu.data && categories.length === 0 && <p className="muted">{t.branchMenu.noMatch}</p>}
      {categories.map(category => <section key={category.id} className="sold-out-group" aria-labelledby={`sold-out-${category.id}`}>
        <h3 id={`sold-out-${category.id}`}><bdi>{language === 'en' && category.nameEn ? category.nameEn : category.nameAr}</bdi></h3>
        <ul>
          {category.items.map(item => {
            const name = dishName(item, language);
            return <li key={item.id} className={item.effective.available ? '' : 'is-sold-out'}>
              <bdi>{name}</bdi>
              <button type="button" role="switch" aria-checked={item.effective.available} className={`availability ${item.effective.available ? 'is-on' : 'is-off'}`}
                onClick={() => toggle(item)} aria-label={fill(t.branchMenu.toggleLabel, { name })} data-testid="sold-out-toggle">
                <span className="availability-dot" aria-hidden="true" />
                <span aria-hidden="true">{item.effective.available ? t.branchMenu.available : t.branchMenu.soldOut}</span>
              </button>
            </li>;
          })}
        </ul>
      </section>)}
    </div>}
  </Dialog>;
}

export const dishName = (item: Pick<BranchMenuItem, 'nameAr' | 'nameEn'>, language: 'ar' | 'en') => (language === 'en' && item.nameEn ? item.nameEn : item.nameAr);
