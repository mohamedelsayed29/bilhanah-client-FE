import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { ArrowCounterClockwiseIcon, ArrowSquareOutIcon, CameraIcon, CopyIcon, EyeSlashIcon, ForkKnifeIcon, PencilSimpleIcon, TagIcon } from '@phosphor-icons/react';
import type { BranchMenuItem, OwnerBranch } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { PageSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api/error-messages';
import { fill, useCopy } from '../../lib/copy';
import { formatPrice } from '../../lib/format';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchMenuQuery } from '../restaurant/queries';
import { PageBranchPicker, usePageBranch } from './BranchScope';
import {
  availabilityChoice, availabilityValue, type AvailabilityChoice, clearPrices, filterMenu, isOverridden, menuSummary, priceDraft, type PriceDraft, pricesUpdate,
} from './branch-menu';
import { useCopyBranchMenu, useResetBranchMenu, useSetBranchItem } from './branch-mutations';
import { dishName } from './SoldOutDialog';
import { useBranchList, useOwnerBranch, useWorkspace } from './workspace';

/**
 * The shared menu as one branch serves it: for each dish, whether it follows the menu, is on sale or
 * sold out here, hidden here, and its own price per size. Owners edit the shared menu elsewhere.
 */
export function BranchMenuPage() {
  const page = usePageBranch();
  const branch = useOwnerBranch(page.branchId);
  if (!branch) return <PageSkeleton blocks={3} />;
  return <BranchMenu key={branch.id} branch={branch} page={page} />;
}

function BranchMenu({ branch, page }: { branch: OwnerBranch; page: ReturnType<typeof usePageBranch> }) {
  const t = useCopy();
  const copy = t.branchMenu;
  const { text, count, language } = useLanguage();
  const toast = useToast();
  const { role, can } = useWorkspace();
  const owner = role === 'OWNER';
  usePageTitle(owner ? copy.title : copy.managerTitle, owner ? copy.title : copy.managerTitle);
  const list = useBranchList();
  const menu = useBranchMenuQuery(branch.id);
  const [query, setQuery] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [pricing, setPricing] = useState<BranchMenuItem | null>(null);
  const [resetting, setResetting] = useState(false);
  const [copying, setCopying] = useState(false);
  const reset = useResetBranchMenu(branch.id);
  const others = list.branches.filter(entry => entry.isActive && entry.id !== branch.id);
  const filterId = useId();

  const header = <PageHeader title={owner ? copy.title : copy.managerTitle} description={owner ? copy.description : copy.managerDescription}
    actions={<>
      {can('menu.manage') && <Link className="button button-secondary" to="/menu"><ForkKnifeIcon size={18} aria-hidden="true" />{copy.editShared}</Link>}
      <a className="button button-secondary" href={branch.publicUrl} target="_blank" rel="noreferrer"><ArrowSquareOutIcon size={18} aria-hidden="true" />{copy.openPublic}</a>
    </>} />;

  if (menu.isPending) return <div className="page">{header}<PageBranchPicker page={page} /><PageSkeleton blocks={2} /></div>;
  if (menu.isError) return <div className="page">{header}<PageBranchPicker page={page} /><ErrorPanel error={menu.error} onRetry={() => void menu.refetch()} /></div>;
  const summary = menuSummary(menu.data);
  const categories = filterMenu(menu.data.categories, { query, changedOnly });
  // Pricing a dish follows the live cache, so the dialog sees the saved state.
  const pricingItem = pricing ? menu.data.categories.flatMap(category => category.items).find(item => item.id === pricing.id) ?? null : null;

  return <div className="page branch-menu-page">
    {header}
    <PageBranchPicker page={page} />
    {summary.items === 0
      ? <section className="card empty-state"><span className="empty-state-icon" aria-hidden="true"><ForkKnifeIcon size={30} /></span><p>{copy.empty}</p>
        {owner && <Link className="button button-primary" to="/menu">{copy.editShared}</Link>}</section>
      : <>
        <div className="branch-menu-toolbar">
          <p className="branch-menu-summary" role="status" data-testid="branch-menu-summary">
            <strong><bdi>{branch.name}</bdi></strong>
            <span>{summary.changed > 0 ? fill(copy.changedCount, { items: count(summary.changed, 'item') }) : copy.noneChanged}</span>
            <small>{copy.followExplain}</small>
          </p>
          <div className="branch-menu-actions">
            {can('branches.manage') && others.length > 0 && <Button small variant="secondary" onClick={() => setCopying(true)} icon={<CopyIcon size={16} aria-hidden="true" />}>{copy.copy}</Button>}
            {can('menu.branch') && <Button small variant="ghost" disabled={summary.changed === 0} onClick={() => setResetting(true)} icon={<ArrowCounterClockwiseIcon size={16} aria-hidden="true" />}>{copy.reset}</Button>}
          </div>
        </div>
        <div className="branch-menu-filters">
          <label className="visually-hidden" htmlFor={`${filterId}-search`}>{copy.search}</label>
          <input id={`${filterId}-search`} className="input" type="search" placeholder={copy.search} value={query} onChange={event => setQuery(event.target.value)} />
          <div className="segmented" role="radiogroup" aria-label={copy.filterLabel}>
            <label><input type="radio" name={`${filterId}-filter`} checked={!changedOnly} onChange={() => setChangedOnly(false)} />{copy.filterAll}</label>
            <label><input type="radio" name={`${filterId}-filter`} checked={changedOnly} onChange={() => setChangedOnly(true)} />{copy.filterChanged}</label>
          </div>
        </div>
        {categories.length === 0 && <p className="muted empty-line">{changedOnly && !query ? copy.noChanges : copy.noMatch}</p>}
        {categories.map(category => <section key={category.id} className="card branch-menu-category" aria-labelledby={`bm-${category.id}`}>
          <header className="branch-menu-category-head">
            <h2 id={`bm-${category.id}`}><bdi>{language === 'en' && category.nameEn ? category.nameEn : category.nameAr}</bdi></h2>
            {!category.isVisible && <span className="badge badge-muted"><EyeSlashIcon size={13} aria-hidden="true" />{copy.categoryHidden}</span>}
          </header>
          <ul className="branch-menu-items">
            {category.items.map(item => <BranchItemRow key={item.id} item={item} branch={branch} categoryVisible={category.isVisible} onPrices={() => setPricing(item)} />)}
          </ul>
        </section>)}
      </>}

    <PricesDialog item={pricingItem} branch={branch} onClose={() => setPricing(null)} />
    <ConfirmDialog open={resetting} busy={reset.isPending} onCancel={() => setResetting(false)}
      title={fill(copy.resetTitle, { name: branch.name })} description={copy.resetBody} confirmLabel={copy.resetConfirm}
      onConfirm={() => reset.mutate(undefined, {
        onSuccess: ({ removed }) => { toast.success(removed > 0 ? fill(copy.resetDone, { items: count(removed, 'item') }) : copy.resetNothing); setResetting(false); },
        onError: error => toast.error(errorMessage(error, text)),
      })} />
    {owner && <CopyFromDialog open={copying} branch={branch} sources={others} onClose={() => setCopying(false)} />}
  </div>;
}

/** One dish at the branch: availability (follow / available / sold out), hidden here, own price, and what diners see. */
function BranchItemRow({ item, branch, categoryVisible, onPrices }: { item: BranchMenuItem; branch: OwnerBranch; categoryVisible: boolean; onPrices: () => void }) {
  const t = useCopy();
  const copy = t.branchMenu;
  const { language, text } = useLanguage();
  const setItem = useSetBranchItem(branch.id);
  // Sold out needs menu.availability; hiding and prices menu.branch. Others only read the menu.
  const { can } = useWorkspace();
  const canAvailability = can('menu.availability');
  const canBranch = can('menu.branch');
  const name = dishName(item, language);
  const choice = availabilityChoice(item.override);
  const groupId = useId();
  const changed = isOverridden(item);
  const ownPrices = Object.keys(item.override.prices).length > 0;
  const save = (change: Parameters<typeof setItem.mutate>[0]['change'], message = copy.saved) =>
    setItem.mutate({ item, change, done: saved => fill(message, { name: dishName(saved, language), branch: branch.name }) });
  const choices: { value: AvailabilityChoice; label: string }[] = [
    { value: 'follow', label: copy.follow }, { value: 'available', label: copy.available }, { value: 'soldOut', label: copy.soldOut },
  ];
  const diners = !item.effective.visible || !categoryVisible ? copy.dinersHidden : item.effective.available ? copy.dinersAvailable : copy.dinersSoldOut;
  const thumb = item.image?.sources[0];
  return <li className={`branch-item ${changed ? 'is-changed' : ''} ${item.effective.visible && categoryVisible ? '' : 'is-hidden'}`} data-testid="branch-item" data-name={item.nameAr}>
    <div className="branch-item-main">
      <span className="item-thumb" aria-hidden="true">{thumb ? <img src={thumb.url} alt="" loading="lazy" /> : <CameraIcon size={20} />}</span>
      <div className="branch-item-text">
        <strong><bdi>{name}</bdi></strong>
        <span className="branch-item-tags">
          {changed && <span className="badge badge-guava" data-testid="changed-badge">{copy.changed}</span>}
          {!item.isVisible && <span className="badge badge-muted"><EyeSlashIcon size={13} aria-hidden="true" />{copy.sharedHidden}</span>}
          {item.override.hidden && <span className="badge badge-muted"><EyeSlashIcon size={13} aria-hidden="true" />{copy.hiddenHere}</span>}
          <span className="muted small">{copy.diners}: {diners}</span>
        </span>
        <ul className="branch-item-prices" aria-label={copy.prices}>
          {item.effective.variants.map(variant => {
            const shared = item.variants.find(entry => entry.id === variant.id)?.pricePiastres ?? variant.pricePiastres;
            const own = item.override.prices[variant.id] !== undefined;
            const size = language === 'en' ? variant.nameEn ?? variant.nameAr : variant.nameAr ?? variant.nameEn;
            return <li key={variant.id} className={own ? 'is-own' : ''}>
              {size && <span>{size}</span>}
              <strong>{formatPrice(variant.pricePiastres, language)}</strong>
              {own && <small>{fill(copy.sharedPrice, { price: formatPrice(shared, language) })}</small>}
            </li>;
          })}
        </ul>
      </div>
    </div>
    {(canAvailability || canBranch) && <div className="branch-item-controls">
      {canAvailability && <div className="branch-item-availability">
        <span className="field-label" id={`${groupId}-label`}>{copy.availability}</span>
        <div className="segmented" role="radiogroup" aria-labelledby={`${groupId}-label`}
          title={fill(copy.followHint, { state: item.isAvailable ? copy.sharedAvailable : copy.sharedSoldOut })}>
          {choices.map(option => <label key={option.value} className={`choice-${option.value}`}>
            <input type="radio" name={`${groupId}-availability`} value={option.value} checked={choice === option.value}
              onChange={() => save({ available: availabilityValue(option.value) })} />
            {option.label}
          </label>)}
        </div>
      </div>}
      {canBranch && <><label className="check-row branch-item-hide">
        <input type="checkbox" checked={item.override.hidden} onChange={event => save({ hidden: event.target.checked })} />
        <span>{copy.hide}</span>
      </label>
      <div className="branch-item-buttons">
        <Button small variant={ownPrices ? 'secondary' : 'ghost'} onClick={onPrices} icon={ownPrices ? <TagIcon size={16} aria-hidden="true" /> : <PencilSimpleIcon size={16} aria-hidden="true" />}
          aria-label={`${copy.prices}: ${name}`}>{copy.prices}</Button>
        {changed && <Button small variant="ghost" onClick={() => save({ available: null, hidden: false, prices: clearPrices(item) }, copy.reverted)}
          icon={<ArrowCounterClockwiseIcon size={16} aria-hidden="true" />} aria-label={`${copy.revert}: ${name}`}>{copy.revert}</Button>}
      </div></>}
    </div>}
    {setItem.isError && <p className="field-error">{errorMessage(setItem.error, text)}</p>}
  </li>;
}

/** The branch's own price per size, with the shared price beside each box. */
function PricesDialog({ item, branch, onClose }: { item: BranchMenuItem | null; branch: OwnerBranch; onClose: () => void }) {
  const t = useCopy();
  const copy = t.branchMenu;
  const { language, text } = useLanguage();
  const toast = useToast();
  const setItem = useSetBranchItem(branch.id);
  const [draft, setDraft] = useState<PriceDraft>({});
  const [invalid, setInvalid] = useState<string[]>([]);
  const itemId = item?.id;
  useEffect(() => {
    if (!item) return;
    setDraft(priceDraft(item));
    setInvalid([]);
    setItem.reset();
    // Only when another dish opens; live updates of the same dish keep what is being typed.
  }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!item) return null;
  const name = dishName(item, language);
  const send = (prices: { variantId: string; pricePiastres: number | null }[]) => {
    if (prices.length === 0) { onClose(); return; }
    setItem.mutate({ item, change: { prices } }, {
      onSuccess: saved => { toast.success(fill(copy.saved, { name: dishName(saved, language), branch: branch.name })); onClose(); },
    });
  };
  const submit = () => {
    const update = pricesUpdate(item, draft);
    setInvalid(update.invalid);
    if (update.invalid.length === 0) send(update.prices);
  };
  return <Dialog open onClose={onClose} size="small" busy={setItem.isPending} onSubmit={submit} title={fill(copy.pricesTitle, { name, branch: branch.name })}
    footer={<>
      {Object.keys(item.override.prices).length > 0 && <Button variant="ghost" className="spacer" disabled={setItem.isPending} onClick={() => send(clearPrices(item))}>{copy.clearPrices}</Button>}
      <Button variant="secondary" onClick={onClose} disabled={setItem.isPending}>{copy.cancel}</Button>
      <Button type="submit" loading={setItem.isPending} data-testid="save-branch-prices">{copy.savePrices}</Button>
    </>}>
    <div className="form">
      {setItem.isError && <Alert kind="error">{errorMessage(setItem.error, text)}</Alert>}
      <p className="field-hint">{copy.pricesHint}</p>
      {item.variants.map((variant, index) => {
        const size = language === 'en' ? variant.nameEn ?? variant.nameAr : variant.nameAr ?? variant.nameEn;
        return <Field key={variant.id} label={size ? fill(copy.sizeLabel, { size }) : copy.singleSize}
          hint={fill(copy.sharedPrice, { price: formatPrice(variant.pricePiastres, language) })}
          error={invalid.includes(variant.id) ? { message: copy.priceInvalid } : undefined}>
          {control => <div className="input-group">
            <input {...control} className="input" inputMode="decimal" dir="ltr" data-autofocus={index === 0 || undefined} data-testid={`branch-price-${index}`}
              placeholder={String(variant.pricePiastres / 100)} value={draft[variant.id] ?? ''}
              onChange={event => { const value = event.target.value; setDraft(current => ({ ...current, [variant.id]: value })); }} />
            <span className="input-affix">{text('ج.م', 'EGP')}</span>
          </div>}
        </Field>;
      })}
    </div>
  </Dialog>;
}

/** Copies another branch's overrides over this one's (owners). */
function CopyFromDialog({ open, branch, sources, onClose }: { open: boolean; branch: OwnerBranch; sources: OwnerBranch[]; onClose: () => void }) {
  const t = useCopy();
  const copy = t.branchMenu;
  const { text, count } = useLanguage();
  const toast = useToast();
  const copyMenu = useCopyBranchMenu(branch.id);
  const [source, setSource] = useState('');
  const selectId = useId();
  useEffect(() => { if (open) { setSource(sources[0]?.id ?? ''); copyMenu.reset(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const sourceName = sources.find(entry => entry.id === source)?.name ?? '';
  return <ConfirmDialog open={open} busy={copyMenu.isPending} onCancel={onClose} tone="primary"
    title={fill(copy.copyTitle, { name: branch.name })} description={fill(copy.copyBody, { name: branch.name })} confirmLabel={copy.copyConfirm}
    onConfirm={() => source && copyMenu.mutate(source, {
      onSuccess: ({ copied }) => { toast.success(fill(copy.copyDone, { items: count(copied, 'item'), source: sourceName })); onClose(); },
    })}>
    <div className="field copy-source">
      <label className="field-label" htmlFor={selectId}>{copy.copySource}</label>
      <select id={selectId} className="select" value={source} onChange={event => setSource(event.target.value)}>
        {sources.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select>
    </div>
    {copyMenu.isError && <Alert kind="error">{errorMessage(copyMenu.error, text)}</Alert>}
  </ConfirmDialog>;
}
