import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, ShieldCheckIcon, TrashIcon } from '@phosphor-icons/react';
import {
  INVENTORY_DEDUCT_ON, INVENTORY_DEDUCT_ON_LABELS, INVENTORY_LIMITS, INVENTORY_STOCK_POLICIES, INVENTORY_STOCK_POLICY_LABELS, INVENTORY_VALUATION_BASES,
  inventorySettingsSchema, PERMISSION_LABELS, ROLE_LABELS, rolesWith,
  type Ingredient, type InventoryBranchSettings, type InventoryDeductOn, type InventorySettings, type InventoryStockPolicy, type InventoryValuationBasis, type WasteReasonOption,
} from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { inventoryApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { contractIssues } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';
import { INVENTORY_PERMISSIONS } from './access';
import { inventoryKeys, useInventoryFormat, useInventorySettings } from './shared';
import { levelUnit } from './StockPage';
import { fromBaseInput, parseQuantity, toBase } from './units';
import { INVENTORY_PERMISSION_HELP, isInventoryPermission } from './permission-help';

type Label = [string, string];
const DEDUCT_HELP: Record<InventoryDeductOn, Label> = {
  ACCEPTED: ['أول ما تقبل الطلب، فالمخزون اللي على الشاشة هو اللي فاضل فعلًا.', 'As soon as you accept it, so the stock on screen is what is really left.'],
  READY: ['لما المطبخ يعلّم الطلب جاهز.', 'When the kitchen marks the order ready.'],
  COMPLETED: ['لما الطلب يتسلم أو يتقدم للزبون.', 'When the order is handed over or served.'],
};
const POLICY_HELP: Record<InventoryStockPolicy, Label> = {
  ALLOW_NEGATIVE: ['كل الطلبات بتتقبل، والمخزون ممكن ينزل تحت الصفر لحد ما تسجل الاستلام.', 'Every order goes through; stock may go below zero until the delivery is recorded.'],
  WARN: ['الطلب بيتقبل، بس لوحة الطلبات بتعلّم الأصناف اللي المخزون مش مكفّيها.', 'Orders go through, but the orders board flags the dishes the stock cannot cover.'],
  BLOCK_ORDERS: ['الزبون مش هيقدر يطلب طبق مخزون الفرع مش مكفّيه.', 'Diners cannot order a dish the branch’s stock cannot cover.'],
};
const BASIS_TEXT: Record<InventoryValuationBasis, { label: Label; help: Label }> = {
  AVERAGE: { label: ['متوسط التكلفة في الفرع', 'Branch average cost'], help: ['اللي دفعته فعلًا في المتوسط في كل فرع (المقترح).', 'What you actually paid on average at each branch (recommended).'] },
  STANDARD: { label: ['التكلفة القياسية', 'Standard cost'], help: ['التكلفة اللي حددتها لكل خامة، مفيدة للميزانية بأسعار ثابتة.', 'The cost you set on each ingredient; useful for budgeting at fixed prices.'] },
};

type Draft = Omit<InventorySettings, 'updatedAt'> & { threshold: string };
const toDraft = (settings: InventorySettings): Draft => ({ ...settings, wasteReasons: settings.wasteReasons.map(reason => ({ ...reason })), branches: settings.branches.map(branch => ({ ...branch })), threshold: String(settings.countVarianceThresholdPercent) });

/** A code for a new waste reason, from its English name (codes stay fixed once used, so history keeps its names). */
export function reasonCode(name: string, taken: readonly string[]): string {
  const base = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'R_$1').slice(0, 30) || 'REASON';
  let code = /^[A-Z]/.test(base) ? base : `R_${base}`;
  for (let index = 2; taken.includes(code); index++) code = `${base}_${index}`.slice(0, 40);
  return code;
}

/** Every inventory rule the owner sets, each explained, and who may do what. */
export function InventorySettingsPage() {
  usePageTitle('إعدادات المخزون', 'Inventory settings');
  const settings = useInventorySettings();
  return <>
    {settings.isError && <ErrorPanel error={settings.error} onRetry={() => void settings.refetch()} />}
    {settings.isPending && <Skeleton height={420} />}
    {settings.data && <SettingsForm settings={settings.data} />}
    <DefaultReorderPoints />
    <PermissionsCard />
  </>;
}

function SettingsForm({ settings }: { settings: InventorySettings }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  useEffect(() => setDraft(toDraft(settings)), [settings]);
  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const threshold = parseQuantity(draft.threshold);
  const body = {
    enabled: draft.enabled, deductOn: draft.deductOn, stockPolicy: draft.stockPolicy, autoSoldOut: draft.autoSoldOut, autoRestore: draft.autoRestore,
    valuationBasis: draft.valuationBasis, requireCountApproval: draft.requireCountApproval, countVarianceThresholdPercent: threshold ?? -1,
    wasteReasons: draft.wasteReasons.map(reason => ({ code: reason.code, nameAr: reason.nameAr.trim(), nameEn: reason.nameEn?.trim() || null })),
    branches: draft.branches.map(branch => ({ branchId: branch.branchId, stockPolicy: branch.stockPolicy, autoSoldOut: branch.autoSoldOut, autoRestore: branch.autoRestore })),
  };
  const issues = contractIssues(inventorySettingsSchema, body);
  const dirty = JSON.stringify(body) !== JSON.stringify({
    enabled: settings.enabled, deductOn: settings.deductOn, stockPolicy: settings.stockPolicy, autoSoldOut: settings.autoSoldOut, autoRestore: settings.autoRestore,
    valuationBasis: settings.valuationBasis, requireCountApproval: settings.requireCountApproval, countVarianceThresholdPercent: settings.countVarianceThresholdPercent,
    wasteReasons: settings.wasteReasons.map(reason => ({ code: reason.code, nameAr: reason.nameAr, nameEn: reason.nameEn || null })),
    branches: settings.branches.map(branch => ({ branchId: branch.branchId, stockPolicy: branch.stockPolicy, autoSoldOut: branch.autoSoldOut, autoRestore: branch.autoRestore })),
  });
  const save = useMutation({
    mutationFn: () => inventoryApi.updateSettings(body),
    onSuccess: saved => {
      queryClient.setQueryData(inventoryKeys.settings, saved);
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast.success(text('اتحفظت إعدادات المخزون', 'Inventory settings saved'));
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const reasons = draft.wasteReasons;
  const setReasons = (next: WasteReasonOption[]) => set('wasteReasons')(next);
  const moveReason = (index: number, by: number) => { const next = [...reasons]; const [item] = next.splice(index, 1); next.splice(index + by, 0, item!); setReasons(next); };
  const setBranch = (branchId: string, change: Partial<InventoryBranchSettings>) => set('branches')(draft.branches.map(branch => (branch.branchId === branchId ? { ...branch, ...change } : branch)));
  const triState = (value: boolean | null) => (value === null ? '' : value ? 'on' : 'off');
  const fromTri = (value: string) => (value === '' ? null : value === 'on');
  return <form className="inv-settings" noValidate onSubmit={event => { event.preventDefault(); if (!issues.length) save.mutate(); }} data-testid="inventory-settings">
    <section className="card inv-settings-card" aria-labelledby="set-deduct">
      <h2 id="set-deduct" className="card-title">{text('الخصم من المخزون', 'Deducting stock')}</h2>
      <Switch checked={draft.enabled} onChange={set('enabled')} label={text('الطلبات تخصم من المخزون', 'Orders deduct stock')}
        description={text('كل طلب بيطلّع خامات وصفته من مخزون الفرع والأصناف بتخلص لوحدها. لو مقفولة: المشتريات والهالك والجرد شغالين، بس مفيش خصم.', 'Each order takes its recipe’s ingredients out of the branch’s stock and dishes sell out on their own. Off: deliveries, waste and counts still work, nothing is deducted.')} />
      <fieldset className="field">
        <legend className="field-label">{text('امتى الطلب يخصم', 'When an order deducts')}</legend>
        <div className="order-types inv-choice-cards">{INVENTORY_DEDUCT_ON.map(value => <label key={value} className={`order-type ${draft.deductOn === value ? 'is-checked' : ''}`}>
          <input type="radio" name="deduct-on" checked={draft.deductOn === value} onChange={() => set('deductOn')(value)} />
          <span><strong>{text(...INVENTORY_DEDUCT_ON_LABELS[value])}</strong><small>{text(...DEDUCT_HELP[value])}</small></span>
        </label>)}</div>
        <p className="field-hint">{text('الطلب اللي بيتلغي بعد الخصم بيرجّع الخامات للمخزون.', 'An order cancelled after deducting puts its ingredients back.')}</p>
      </fieldset>
      <fieldset className="field">
        <legend className="field-label">{text('لو المخزون مش مكفّي الطلب', 'When stock cannot cover an order')}</legend>
        <div className="order-types inv-choice-cards">{INVENTORY_STOCK_POLICIES.map(value => <label key={value} className={`order-type ${draft.stockPolicy === value ? 'is-checked' : ''}`} data-testid={`policy-${value}`}>
          <input type="radio" name="stock-policy" checked={draft.stockPolicy === value} onChange={() => set('stockPolicy')(value)} />
          <span><strong>{text(...INVENTORY_STOCK_POLICY_LABELS[value])}</strong><small>{text(...POLICY_HELP[value])}</small></span>
        </label>)}</div>
      </fieldset>
    </section>
    <section className="card inv-settings-card" aria-labelledby="set-soldout">
      <h2 id="set-soldout" className="card-title">{text('الأصناف اللي بتخلص', 'Sold-out dishes')}</h2>
      <Switch checked={draft.autoSoldOut} onChange={set('autoSoldOut')} label={text('علّم الطبق خلص لوحده', 'Mark dishes sold out automatically')}
        description={text('لما خامة تخلص في فرع، الأطباق اللي محتاجاها في كل أحجامها بتتعلم «خلصت» في الفرع ده. العلامة اليدوية مش بتتلمس.', 'When an ingredient runs out at a branch, dishes that need it in every size are marked sold out there. Manual marks are never touched.')} />
      <Switch checked={draft.autoRestore} onChange={set('autoRestore')} disabled={!draft.autoSoldOut} label={text('رجّعها لما المخزون يرجع', 'Bring them back when restocked')}
        description={text('استلام أو جرد بيرجّع الخامة فوق الصفر بيشيل علامة «خلصت» اللي المخزون حطها. لو مقفولة، بتفضل لحد ما حد يغيرها بإيده.', 'A delivery or count that brings the ingredient above zero lifts the marks inventory set. Off: they stay until someone changes them by hand.')} />
    </section>
    <section className="card inv-settings-card" aria-labelledby="set-cost">
      <h2 id="set-cost" className="card-title">{text('حساب التكلفة', 'Costing')}</h2>
      <fieldset className="field">
        <legend className="field-label">{text('التكلفة اللي بنقيّم بيها', 'The cost stock is valued at')}</legend>
        <div className="order-types inv-choice-cards">{INVENTORY_VALUATION_BASES.map(value => <label key={value} className={`order-type ${draft.valuationBasis === value ? 'is-checked' : ''}`}>
          <input type="radio" name="valuation" checked={draft.valuationBasis === value} onChange={() => set('valuationBasis')(value)} />
          <span><strong>{text(...BASIS_TEXT[value].label)}</strong><small>{text(...BASIS_TEXT[value].help)}</small></span>
        </label>)}</div>
        <p className="field-hint">{text('بتأثر على تكلفة الوصفات وقيمة المخزون والتقارير. سجل الحركة وتقرير تكلفة الأكل دايمًا بمتوسط التكلفة.', 'Affects recipe costs, stock value and estimates. The ledger and the food cost report always use the average cost.')}</p>
      </fieldset>
    </section>
    <section className="card inv-settings-card" aria-labelledby="set-counts">
      <h2 id="set-counts" className="card-title">{text('الجرد', 'Stock counts')}</h2>
      <Switch checked={draft.requireCountApproval} onChange={set('requireCountApproval')} label={text('الفروقات الكبيرة محتاجة موافقة', 'Large differences need approval')}
        description={text('جرد فيه سطر فرقه أكبر من النسبة دي بيستنى حد عنده صلاحية الموافقة قبل ما المخزون يتغير.', 'A count with a line off by more than this share waits for someone who can approve counts before stock changes.')} />
      <Field label={text('نسبة الفرق المسموحة', 'Difference allowed')} error={threshold === null ? { message: '@@invalid' } : undefined}
        hint={text('الفرق ÷ المتوقع. أي حاجة اتعدت وكان المتوقع صفر بتعدّي النسبة.', 'Difference ÷ expected. Anything counted where nothing was expected is above it.')}>
        {control => <div className="input-group inv-percent"><input {...control} className="input ltr" inputMode="decimal" value={draft.threshold} onChange={event => set('threshold')(event.target.value)} /><span className="input-affix">٪</span></div>}
      </Field>
    </section>
    <section className="card inv-settings-card" aria-labelledby="set-waste">
      <h2 id="set-waste" className="card-title">{text('أسباب الهالك', 'Waste reasons')}</h2>
      <p className="muted">{text('اللي بيختار منه المطبخ وهو بيسجل هالك. تغيير الاسم مش بيغيّر السجل القديم.', 'What the kitchen picks from when recording waste. Renaming one does not change past records.')}</p>
      <ol className="inv-reason-list" data-testid="waste-reasons">{reasons.map((reason, index) => <li key={reason.code}>
        <input className="input" aria-label={text(`اسم السبب ${index + 1}`, `Reason ${index + 1} name`)} maxLength={60} value={reason.nameAr} onChange={event => setReasons(reasons.map(entry => (entry.code === reason.code ? { ...entry, nameAr: event.target.value } : entry)))} aria-invalid={!reason.nameAr.trim() || undefined} />
        <input className="input" dir="auto" aria-label={text(`الاسم بالإنجليزي للسبب ${index + 1}`, `Reason ${index + 1} English name`)} maxLength={60} placeholder={text('بالإنجليزي', 'English')} value={reason.nameEn ?? ''} onChange={event => setReasons(reasons.map(entry => (entry.code === reason.code ? { ...entry, nameEn: event.target.value } : entry)))} />
        <span className="inv-reason-actions">
          <button type="button" className="icon-button" disabled={index === 0} aria-label={text('لفوق', 'Move up')} onClick={() => moveReason(index, -1)}><ArrowUpIcon size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-button" disabled={index === reasons.length - 1} aria-label={text('لتحت', 'Move down')} onClick={() => moveReason(index, 1)}><ArrowDownIcon size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-button" disabled={reasons.length <= 1} aria-label={text(`شيل ${reason.nameAr}`, `Remove ${reason.nameEn ?? reason.nameAr}`)} onClick={() => setReasons(reasons.filter(entry => entry.code !== reason.code))}><TrashIcon size={16} aria-hidden="true" /></button>
        </span>
      </li>)}</ol>
      <Button small variant="ghost" disabled={reasons.length >= INVENTORY_LIMITS.wasteReasons} icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />}
        onClick={() => setReasons([...reasons, { code: reasonCode(`R${reasons.length + 1}`, reasons.map(entry => entry.code)), nameAr: '', nameEn: null }])}>{text('ضيف سبب', 'Add a reason')}</Button>
    </section>
    {draft.branches.length > 0 && <section className="card list-card inv-settings-card" aria-labelledby="set-branches">
      <h2 id="set-branches" className="card-title">{text('قواعد خاصة بكل فرع', 'Per-branch rules')}</h2>
      <p className="muted">{text('سيبها «زي المطعم» عشان الفرع يمشي على الإعدادات اللي فوق.', 'Leave “Restaurant default” for a branch to follow the settings above.')}</p>
      <div className="table-scroll"><table className="data-table inv-table is-plain" data-testid="branch-overrides">
        <thead><tr><th scope="col">{text('الفرع', 'Branch')}</th><th scope="col">{text('لو المخزون مش مكفّي', 'When stock cannot cover')}</th><th scope="col">{text('يخلص لوحده', 'Auto sold-out')}</th><th scope="col">{text('يرجع لوحده', 'Auto restore')}</th></tr></thead>
        <tbody>{draft.branches.map(branch => <tr key={branch.branchId}>
          <td className="cell-primary"><bdi>{branch.branchName}</bdi></td>
          <td className="cell-wide"><select className="select" aria-label={text(`سياسة المخزون في ${branch.branchName}`, `Stock policy at ${branch.branchName}`)} value={branch.stockPolicy ?? ''} onChange={event => setBranch(branch.branchId, { stockPolicy: (event.target.value || null) as InventoryStockPolicy | null })}>
            <option value="">{text(`زي المطعم (${text(...INVENTORY_STOCK_POLICY_LABELS[draft.stockPolicy])})`, `Restaurant default (${INVENTORY_STOCK_POLICY_LABELS[draft.stockPolicy][1]})`)}</option>
            {INVENTORY_STOCK_POLICIES.map(value => <option key={value} value={value}>{text(...INVENTORY_STOCK_POLICY_LABELS[value])}</option>)}
          </select></td>
          <td className="cell-wide"><select className="select" aria-label={text(`يخلص لوحده في ${branch.branchName}`, `Auto sold-out at ${branch.branchName}`)} value={triState(branch.autoSoldOut)} onChange={event => setBranch(branch.branchId, { autoSoldOut: fromTri(event.target.value) })}>
            <option value="">{text(`زي المطعم (${draft.autoSoldOut ? 'شغال' : 'مقفول'})`, `Restaurant default (${draft.autoSoldOut ? 'on' : 'off'})`)}</option><option value="on">{text('شغال', 'On')}</option><option value="off">{text('مقفول', 'Off')}</option>
          </select></td>
          <td className="cell-wide"><select className="select" aria-label={text(`يرجع لوحده في ${branch.branchName}`, `Auto restore at ${branch.branchName}`)} value={triState(branch.autoRestore)} onChange={event => setBranch(branch.branchId, { autoRestore: fromTri(event.target.value) })}>
            <option value="">{text(`زي المطعم (${draft.autoRestore ? 'شغال' : 'مقفول'})`, `Restaurant default (${draft.autoRestore ? 'on' : 'off'})`)}</option><option value="on">{text('شغال', 'On')}</option><option value="off">{text('مقفول', 'Off')}</option>
          </select></td>
        </tr>)}</tbody>
      </table></div>
    </section>}
    <div className="inv-settings-save">
      {issues.length > 0 && <Alert kind="error">{text('في إعداد محتاج يتراجع (أسماء أسباب الهالك ونسبة الفرق).', 'A setting needs your attention (waste reason names and the difference allowed).')}</Alert>}
      {settings.updatedAt && <small className="muted">{text('آخر تعديل', 'Last changed')} {format.dateTime(settings.updatedAt)}</small>}
      <Button variant="secondary" disabled={!dirty || save.isPending} onClick={() => setDraft(toDraft(settings))}>{text('رجّع زي ما كان', 'Undo changes')}</Button>
      <Button type="submit" loading={save.isPending} disabled={!dirty || issues.length > 0} data-testid="settings-save">{text('احفظ', 'Save')}</Button>
    </div>
  </form>;
}

/** The reorder point branches use until they set their own, per ingredient. */
function DefaultReorderPoints() {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const ingredients = useQuery({ queryKey: inventoryKeys.ingredients(null), queryFn: () => inventoryApi.ingredients() });
  const raw = useMemo(() => (ingredients.data ?? []).filter(ingredient => ingredient.kind === 'RAW' && ingredient.isActive), [ingredients.data]);
  return <section className="card list-card inv-settings-card" aria-labelledby="set-reorder">
    <h2 id="set-reorder" className="card-title">{text('حد الطلب الافتراضي', 'Default reorder points')}</h2>
    <p className="muted">{text('لما الموجود يوصل للحد ده أو أقل، الخامة بتبقى «قربت تخلص» وبتظهر في تقرير الطلب. كل فرع يقدر يحط حد خاص بيه من صفحة المخزون.', 'At or below this, an ingredient is low and shows in the reorder report. Each branch can set its own on the stock page.')}</p>
    {ingredients.isPending && <Skeleton height={120} />}
    {ingredients.isError && <ErrorPanel error={ingredients.error} onRetry={() => void ingredients.refetch()} />}
    {raw.length > 0 && <ul className="inv-default-levels">{raw.map(ingredient => <DefaultLevel key={ingredient.id} ingredient={ingredient} name={format.name(ingredient.nameAr, ingredient.nameEn)} />)}</ul>}
  </section>;
}

function DefaultLevel({ ingredient, name }: { ingredient: Ingredient; name: string }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const unit = levelUnit(ingredient.baseUnit);
  const initial = fromBaseInput(ingredient.defaultReorderPoint, unit.factor);
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  const save = useMutation({
    mutationFn: (point: number | null) => inventoryApi.updateIngredient(ingredient.id, { defaultReorderPoint: point }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: inventoryKeys.all }); toast.success(text(`اتحفظ حد طلب ${ingredient.nameAr}`, `Reorder point saved for ${ingredient.nameEn ?? ingredient.nameAr}`)); },
    onError: failure => { setValue(initial); toast.error(errorMessage(failure, text)); },
  });
  const parsed = value.trim() ? parseQuantity(value) : null;
  const invalid = value.trim() !== '' && parsed === null;
  const commit = () => {
    if (invalid) return;
    const point = parsed === null ? null : toBase(parsed, unit.factor);
    if (point !== ingredient.defaultReorderPoint) save.mutate(point);
  };
  return <li>
    <span><bdi>{name}</bdi>{ingredient.category && <small className="muted"> · {ingredient.category}</small>}</span>
    <span className="inv-qty is-compact">
      <input className="input ltr" inputMode="decimal" value={value} placeholder="—" aria-invalid={invalid || undefined} aria-label={text(`حد الطلب الافتراضي لـ ${name} (${text(...unit.label)})`, `Default reorder point for ${name} (${unit.label[1]})`)}
        onChange={event => setValue(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); (event.target as HTMLInputElement).blur(); } }} />
      <span className="inv-qty-unit">{text(...unit.label)}</span>
    </span>
  </li>;
}

/** Who may do what in inventory: each permission in plain words, the roles that have it, and where to grant more. */
function PermissionsCard() {
  const { text } = useLanguage();
  const { to, can } = useWorkspace();
  return <section className="card inv-settings-card" aria-labelledby="set-permissions" data-testid="inventory-permissions">
    <h2 id="set-permissions" className="card-title"><ShieldCheckIcon size={20} aria-hidden="true" />{text('مين يقدر يعمل إيه', 'Who can do what')}</h2>
    <p className="muted">{text('كل صلاحية من دول تقدر تديها لأي موظف (مدير، كاشير، ويتر، مطبخ) فوق صلاحيات دوره، من صفحة الموظفين.', 'You can give any of these to any staff member (manager, cashier, waiter, kitchen) on top of their role, on the staff page.')}</p>
    <dl className="inv-permissions">{INVENTORY_PERMISSIONS.map(permission => <div key={permission}>
      <dt>{text(...PERMISSION_LABELS[permission])}</dt>
      <dd>{isInventoryPermission(permission) && text(...INVENTORY_PERMISSION_HELP[permission])}
        <small className="muted">{text('عند:', 'Included for:')} {rolesWith(permission).map(role => text(...ROLE_LABELS[role])).join(text('، ', ', '))}</small></dd>
    </div>)}</dl>
    {can('staff.view') && <Link className="link-action" to={to('/settings/kitchen')}>{text('افتح صفحة الموظفين', 'Open the staff page')}</Link>}
  </section>;
}
