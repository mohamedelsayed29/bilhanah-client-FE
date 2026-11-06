import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { CheckIcon, ClipboardTextIcon, PaperPlaneTiltIcon, PlusIcon, WarningIcon, XIcon } from '@phosphor-icons/react';
import { INVENTORY_LIMITS, type Ingredient, type StockCount, type StockCountDetail, type StockCountLine } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CompactMeta } from '../../components/CompactMeta';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Pagination } from '../../components/Pagination';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { inventoryApi, type CountFilters } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../lib/language';
import { PageBranchPicker } from '../branches/BranchScope';
import { countPostOutcome } from './access';
import { Chips, matchesIngredient, QuantityInput, SearchBox } from './controls';
import { CountStatusBadge, inventoryKeys, useInventoryActions, useInventoryFormat, useInventorySettings, useListBranch, useStockBranch } from './shared';
import { formatNumber, fromBaseInput, parseQuantity, preferredUnitKey, roundTo, toBase, unitOptions } from './units';

/** Stock counts: the branch's open count (enter what is on the shelf, see the variance, post), starting one, approvals and history. */
export function InventoryCountsPage() {
  const { text } = useLanguage();
  usePageTitle('الجرد', 'Stock counts');
  const actions = useInventoryActions();
  const page = useStockBranch();
  const branchId = page.branchId;
  const [params, setParams] = useSearchParams();
  const openFilters: CountFilters = { branchId, status: 'OPEN', page: 1, pageSize: 1 };
  const pendingFilters: CountFilters = { branchId, status: 'PENDING_APPROVAL', page: 1, pageSize: 1 };
  const open = useQuery({ queryKey: inventoryKeys.counts(openFilters), queryFn: () => inventoryApi.counts(openFilters), enabled: Boolean(branchId) });
  const pending = useQuery({ queryKey: inventoryKeys.counts(pendingFilters), queryFn: () => inventoryApi.counts(pendingFilters), enabled: Boolean(branchId) });
  const current = open.data?.items[0] ?? pending.data?.items[0] ?? null;
  const loading = open.isPending || pending.isPending;
  const starting = params.get('new') === '1' && actions.operate && !loading && !current;
  const closeStart = () => setParams(next => { const copy = new URLSearchParams(next); copy.delete('new'); return copy; }, { replace: true });
  return <>
    <PageBranchPicker page={page} />
    {(open.isError || pending.isError) && <ErrorPanel error={open.error ?? pending.error} onRetry={() => { void open.refetch(); void pending.refetch(); }} />}
    {loading && branchId && <Skeleton height={200} />}
    {!loading && current && <CountSheet countId={current.id} />}
    {!loading && !current && <section className="card"><div className="empty-state" data-testid="no-open-count">
      <span className="empty-state-icon" aria-hidden="true"><ClipboardTextIcon size={30} /></span>
      <h2>{text('مفيش جرد مفتوح في الفرع ده', 'No count open at this branch')}</h2>
      <p>{text('الجرد بياخد صورة من الموجود دلوقتي، تعدّ اللي على الرف، والفرق بيتسجل لما ترحّله. المبيعات اللي بتحصل وانت بتعد مش بتلخبط الفرق.', 'A count snapshots what is expected now; you count the shelf, and the difference is booked when you post. Sales while you count do not distort it.')}</p>
      {actions.operate ? <Button icon={<PlusIcon size={17} weight="bold" aria-hidden="true" />} onClick={() => setParams(next => { const copy = new URLSearchParams(next); copy.set('new', '1'); return copy; })} data-testid="start-count">
        {text('ابدأ جرد', 'Start a count')}</Button>
        : <p className="muted">{text('المدير أو صاحب المطعم بيبدأ الجرد، وانت تقدر تدخل الكميات.', 'A manager or the owner starts a count; you can then enter the quantities.')}</p>}
    </div></section>}
    {starting && branchId && <StartCountDialog branchId={branchId} onClose={closeStart} />}
    {actions.approve && <ApprovalQueue />}
    <CountHistory />
  </>;
}

type LineInput = { text: string; unitKey: string };

/** The sheet of one count: lines by category, typed in kilos (or any unit), saved as they are entered. */
function CountSheet({ countId, inDialog = false }: { countId: string; inDialog?: boolean }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const settings = useInventorySettings();
  const toast = useToast();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: inventoryKeys.count(countId), queryFn: () => inventoryApi.count(countId) });
  const count = detail.data;
  const ingredients = useQuery({ queryKey: inventoryKeys.ingredients(count?.branchId ?? null), queryFn: () => inventoryApi.ingredients({ branchId: count!.branchId }), enabled: Boolean(count) });
  const byId = useMemo(() => new Map((ingredients.data ?? []).map(ingredient => [ingredient.id, ingredient])), [ingredients.data]);
  const [inputs, setInputs] = useState<Record<string, LineInput>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'todo' | 'off'>('all');
  const [confirming, setConfirming] = useState<'post' | 'cancel' | null>(null);
  const [note, setNote] = useState('');
  const editable = count?.status === 'OPEN' && actions.enterCounts;
  const optionsFor = (line: StockCountLine) => unitOptions(line.baseUnit, byId.get(line.ingredientId)?.units ?? []);
  const inputFor = (line: StockCountLine): LineInput => {
    const existing = inputs[line.ingredientId];
    if (existing) return existing;
    const options = optionsFor(line);
    const key = preferredUnitKey(options, line.baseUnit);
    const option = options.find(entry => entry.key === key)!;
    return { text: line.counted === null ? '' : fromBaseInput(line.counted, option.factor), unitKey: key };
  };
  const key = inventoryKeys.count(countId);
  const saveLine = useMutation({
    mutationFn: (lines: { ingredientId: string; counted: number | null }[]) => inventoryApi.updateCount(countId, { lines }),
    onMutate: async lines => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<StockCountDetail>(key);
      queryClient.setQueryData<StockCountDetail>(key, data => data && {
        ...data,
        lines: data.lines.map(line => {
          const change = lines.find(entry => entry.ingredientId === line.ingredientId);
          return change ? { ...line, counted: change.counted, variance: change.counted === null ? null : roundTo(change.counted - line.expected, 3) } : line;
        }),
      });
      return { previous };
    },
    onError: (failure, _lines, context) => { queryClient.setQueryData(key, context?.previous); toast.error(errorMessage(failure, text)); },
    onSuccess: saved => { queryClient.setQueryData(key, saved); void queryClient.invalidateQueries({ queryKey: ['inventory', 'counts'] }); },
  });
  const after = (saved: StockCountDetail, message: string) => {
    queryClient.setQueryData(key, saved);
    void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    toast.success(message);
    setConfirming(null);
  };
  const post = useMutation({
    mutationFn: () => inventoryApi.postCount(countId),
    onSuccess: saved => after(saved, saved.status === 'PENDING_APPROVAL' ? text('اتبعت للموافقة', 'Sent for approval') : text('اترحّل الجرد والمخزون اتظبط', 'Count posted and stock corrected')),
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const cancel = useMutation({ mutationFn: () => inventoryApi.cancelCount(countId), onSuccess: saved => after(saved, text('اتلغى الجرد', 'Count cancelled')), onError: failure => toast.error(errorMessage(failure, text)) });
  const review = useMutation({
    mutationFn: (approve: boolean) => (approve ? inventoryApi.approveCount(countId, note.trim() || null) : inventoryApi.rejectCount(countId, note.trim() || null)),
    onSuccess: (saved, approve) => { after(saved, approve ? text('اتوافق والجرد اترحّل', 'Approved and posted') : text('رجع الجرد مفتوح', 'Sent back to open')); setNote(''); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  if (detail.isError) return <ErrorPanel error={detail.error} onRetry={() => void detail.refetch()} />;
  if (!count) return <Skeleton height={240} />;
  const commit = (line: StockCountLine) => {
    const input = inputFor(line);
    const option = optionsFor(line).find(entry => entry.key === input.unitKey) ?? optionsFor(line)[0]!;
    const typed = input.text.trim() === '' ? null : parseQuantity(input.text);
    if (input.text.trim() !== '' && typed === null) return;
    const counted = typed === null ? null : toBase(typed, option.factor);
    if (counted === line.counted || (counted !== null && line.counted !== null && Math.abs(counted - line.counted) < 0.0005)) return;
    saveLine.mutate([{ ingredientId: line.ingredientId, counted }]);
  };
  const counted = count.lines.filter(line => line.counted !== null).length;
  const over = count.lines.filter(line => line.overThreshold && line.counted !== null).length;
  const netValue = count.lines.reduce((sum, line) => sum + (line.varianceValue ?? 0), 0);
  const outcome = countPostOutcome({ requireApproval: settings.data?.requireCountApproval ?? false, linesOverThreshold: over, canApprove: actions.approve });
  const shown = count.lines.filter(line => matchesIngredient(line, search)
    && (filter === 'all' || (filter === 'todo' ? line.counted === null : line.counted !== null && Math.abs(line.variance ?? 0) > 0)));
  const groups = new Map<string, StockCountLine[]>();
  for (const line of shown) groups.set(line.category ?? '', [...(groups.get(line.category ?? '') ?? []), line]);
  const progress = count.lineCount ? Math.round((counted / count.lineCount) * 100) : 0;
  return <section className={`${inDialog ? '' : 'card '}inv-count`} aria-labelledby={`count-${count.id}`} data-testid="count-sheet" data-status={count.status}>
    <header className="inv-count-head">
      <div>
        <h2 id={`count-${count.id}`}>{text('جرد ', 'Count at ')}<bdi>{count.branchName}</bdi> <CountStatusBadge status={count.status} /></h2>
        <p className="muted">{text('بدأه', 'Started by')} <bdi>{count.createdBy ?? '—'}</bdi> · {format.dateTime(count.createdAt)}{count.note && <> · <bdi>{count.note}</bdi></>}</p>
      </div>
      <div className="inv-count-progress" aria-label={text('اتعد', 'Counted')}>
        <strong data-testid="count-progress">{text(`${formatNumber(counted, 'ar')} من ${formatNumber(count.lineCount, 'ar')}`, `${counted} of ${count.lineCount}`)}</strong>
        <span className="inv-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>
      </div>
    </header>
    {count.status === 'PENDING_APPROVAL' && <Alert kind="warning" title={text('مستني موافقة', 'Waiting for approval')}>
      {text('في سطور الفرق فيها أكبر من المسموح، فالجرد مستني حد عنده صلاحية الموافقة.', 'Some lines are off by more than the threshold, so the count waits for someone who can approve it.')}
      {count.submittedBy && <> {text('بعته', 'Sent by')} <bdi>{count.submittedBy}</bdi> · {format.dateTime(count.submittedAt)}</>}
    </Alert>}
    {count.status === 'OPEN' && count.reviewNote && <Alert kind="info" title={text('رجع لك من المراجعة', 'Sent back by the reviewer')}><bdi>{count.reviewNote}</bdi></Alert>}
    <div className="inv-toolbar">
      <SearchBox value={search} onChange={setSearch} label={text('دوّر في الجرد', 'Search the count')} />
      <Chips value={filter} onChange={setFilter} label={text('عرض', 'Show')} options={[
        { value: 'all', label: text('الكل', 'All') },
        { value: 'todo', label: text('لسه ما اتعدش', 'Not counted'), count: count.lineCount - counted },
        { value: 'off', label: text('فيه فرق', 'With a difference') },
      ]} />
    </div>
    <div className="inv-count-groups">
      {[...groups].map(([category, lines]) => <div key={category || 'none'} className="inv-count-group">
        <h3>{category || text('من غير قسم', 'No category')}</h3>
        <ul>{lines.map(line => {
          const input = inputFor(line);
          const options = optionsFor(line);
          const option = options.find(entry => entry.key === input.unitKey) ?? options[0]!;
          const typed = input.text.trim() === '' ? null : parseQuantity(input.text);
          const invalid = input.text.trim() !== '' && typed === null;
          const preview = typed === null ? line.counted : toBase(typed, option.factor);
          const variance = preview === null ? null : roundTo(preview - line.expected, 3);
          const name = format.name(line.nameAr, line.nameEn);
          return <li key={line.ingredientId} className={`inv-count-line ${line.counted !== null ? 'is-counted' : ''} ${line.overThreshold && line.counted !== null ? 'is-over' : ''}`} data-testid="count-line" data-name={line.nameEn ?? line.nameAr}>
            <div className="inv-count-name"><strong><bdi>{name}</bdi></strong>
              <small className="muted">{text('المتوقع', 'Expected')} {format.qty(line.expected, line.baseUnit)}</small></div>
            {editable ? <div className="inv-count-input">
              <QuantityInput large value={input.text} unitKey={input.unitKey} options={options} label={text(`المعدود من ${name}`, `Counted ${name}`)} invalid={invalid}
                onValue={value => setInputs(current => ({ ...current, [line.ingredientId]: { ...input, text: value } }))}
                onUnit={unitKey => {
                  const next = options.find(entry => entry.key === unitKey)!;
                  setInputs(current => ({ ...current, [line.ingredientId]: { unitKey, text: preview === null ? input.text : fromBaseInput(preview, next.factor) } }));
                }} testId="count-input" onCommit={() => commit(line)} />
              <Button small variant="ghost" onClick={() => commit(line)} className="inv-count-save" aria-label={text(`احفظ ${name}`, `Save ${name}`)} data-testid="count-save">{text('احفظ', 'Save')}</Button>
            </div> : <div className="inv-count-input is-read"><strong>{line.counted === null ? '—' : format.qty(line.counted, line.baseUnit)}</strong></div>}
            <div className="inv-count-variance" aria-live="polite" data-testid="count-variance">
              {variance === null ? <span className="muted">—</span> : <>
                <strong className={`inv-signed ${variance < 0 ? 'is-out' : variance > 0 ? 'is-in' : ''}`}>{variance === 0 ? text('مظبوط', 'Exact') : format.qty(variance, line.baseUnit, { signed: true })}</strong>
                {actions.costs && line.varianceValue !== null && line.counted !== null && variance !== 0 && <small className="muted">{format.signedMoney(line.varianceValue)}</small>}
                {line.overThreshold && line.counted !== null && <small className="inv-flag"><WarningIcon size={13} aria-hidden="true" /> {text('فرق كبير', 'Large difference')}</small>}
              </>}
            </div>
          </li>;
        })}</ul>
      </div>)}
      {shown.length === 0 && <p className="muted cash-empty">{text('مفيش سطور هنا.', 'Nothing here.')}</p>}
    </div>
    <footer className="inv-count-foot">
      <div className="inv-count-summary">
        <span>{text('السطور الفاضية مش بتترحّل.', 'Blank lines are not posted.')}</span>
        {actions.costs && <strong data-testid="count-net">{text('صافي الفرق', 'Net difference')}: <span className={netValue < 0 ? 'inv-negative' : ''}>{format.signedMoney(roundTo(netValue, 2))}</span></strong>}
        {over > 0 && <span className="inv-flag">{text(`${formatNumber(over, 'ar')} سطر فرقهم أكبر من ${formatNumber(settings.data?.countVarianceThresholdPercent ?? 10, 'ar')}٪`, `${over} line${over === 1 ? '' : 's'} off by more than ${settings.data?.countVarianceThresholdPercent ?? 10}%`)}</span>}
      </div>
      {count.status === 'OPEN' && actions.operate && <div className="cash-actions">
        <Button variant="danger-outline" small onClick={() => setConfirming('cancel')}>{text('ألغِ الجرد', 'Cancel count')}</Button>
        <Button onClick={() => setConfirming('post')} disabled={counted === 0 || saveLine.isPending} icon={<PaperPlaneTiltIcon size={17} aria-hidden="true" />} data-testid="count-post">
          {outcome === 'approval' ? text('ابعت للموافقة', 'Send for approval') : text('رحّل الجرد', 'Post count')}</Button>
      </div>}
      {count.status === 'OPEN' && !actions.operate && actions.enterCounts && <p className="muted">{text('بعد ما تخلص، المدير بيرحّل الجرد.', 'When you are done, a manager posts the count.')}</p>}
      {count.status === 'PENDING_APPROVAL' && actions.approve && <div className="cash-review inv-review" data-testid="count-review">
        <input className="input" maxLength={INVENTORY_LIMITS.noteLength} value={note} onChange={event => setNote(event.target.value)} placeholder={text('ملاحظة (اختياري)', 'Note (optional)')} aria-label={text('ملاحظة المراجعة', 'Review note')} />
        <Button small variant="danger-outline" loading={review.isPending && review.variables === false} onClick={() => review.mutate(false)} icon={<XIcon size={15} aria-hidden="true" />}>{text('رجّعه', 'Send back')}</Button>
        <Button small loading={review.isPending && review.variables === true} onClick={() => review.mutate(true)} icon={<CheckIcon size={15} aria-hidden="true" />} data-testid="count-approve">{text('وافق ورحّل', 'Approve and post')}</Button>
      </div>}
    </footer>
    <ConfirmDialog open={confirming === 'post'} tone="primary" busy={post.isPending} onCancel={() => setConfirming(null)} onConfirm={() => post.mutate()}
      title={outcome === 'approval' ? text('تبعت الجرد للموافقة؟', 'Send this count for approval?') : text('ترحّل الجرد؟', 'Post this count?')}
      confirmLabel={outcome === 'approval' ? text('ابعت', 'Send') : text('رحّل', 'Post')}
      description={outcome === 'approval'
        ? text('في سطور فرقها أكبر من المسموح، فالمخزون مش هيتغير غير لما حد يوافق.', 'Some lines are off by more than the threshold, so stock changes only once someone approves.')
        : text(`هيتسجل فرق ${formatNumber(counted, 'ar')} سطر في المخزون${actions.costs ? ` (صافي ${format.signedMoney(roundTo(netValue, 2))})` : ''}. السطور الفاضية مش هتتغير.`, `The difference of ${counted} counted line${counted === 1 ? '' : 's'} is booked to stock${actions.costs ? ` (net ${format.signedMoney(roundTo(netValue, 2))})` : ''}. Blank lines stay as they are.`)} />
    <ConfirmDialog open={confirming === 'cancel'} busy={cancel.isPending} onCancel={() => setConfirming(null)} onConfirm={() => cancel.mutate()}
      title={text('تلغي الجرد ده؟', 'Cancel this count?')} confirmLabel={text('ألغيه', 'Cancel count')}
      description={text('الكميات اللي اتعدت هتتشال والمخزون مش هيتغير.', 'The counted quantities are dropped and stock is not changed.')} />
  </section>;
}

/** Start a count: every active raw ingredient, one category, or chosen ingredients. */
function StartCountDialog({ branchId, onClose }: { branchId: string; onClose: () => void }) {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const ingredients = useQuery({ queryKey: inventoryKeys.ingredients(branchId), queryFn: () => inventoryApi.ingredients({ branchId }) });
  const raw = useMemo(() => (ingredients.data ?? []).filter(ingredient => ingredient.kind === 'RAW' && ingredient.isActive), [ingredients.data]);
  const categories = useMemo(() => [...new Set(raw.map(ingredient => ingredient.category).filter((value): value is string => Boolean(value)))], [raw]);
  const [mode, setMode] = useState<'all' | 'category' | 'chosen'>('all');
  const [category, setCategory] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (!category && categories[0]) setCategory(categories[0]); }, [categories, category]);
  const start = useMutation({
    mutationFn: () => inventoryApi.createCount({
      branchId, note: note.trim() || null,
      ...(mode === 'category' && { category }), ...(mode === 'chosen' && { ingredientIds: chosen }),
    }),
    onSuccess: detail => {
      queryClient.setQueryData(inventoryKeys.count(detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'counts'] });
      toast.success(text(`بدأ الجرد (${formatNumber(detail.lineCount, 'ar')} خامة)`, `Count started (${detail.lineCount} ingredient${detail.lineCount === 1 ? '' : 's'})`));
      onClose();
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const ready = mode === 'all' ? raw.length > 0 : mode === 'category' ? Boolean(category) : chosen.length > 0;
  const size = mode === 'all' ? raw.length : mode === 'category' ? raw.filter(ingredient => ingredient.category === category).length : chosen.length;
  const toggle = (ingredient: Ingredient, on: boolean) => setChosen(current => (on ? [...current, ingredient.id] : current.filter(id => id !== ingredient.id)));
  return <Dialog open onClose={onClose} busy={start.isPending} onSubmit={() => { if (ready) start.mutate(); }} title={text('ابدأ جرد', 'Start a count')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={start.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={start.isPending} disabled={!ready} data-testid="start-count-submit">{text(`ابدأ (${formatNumber(size, 'ar')})`, `Start (${size})`)}</Button>
    </>}>
    {ingredients.isPending ? <Skeleton height={160} /> : <div className="inv-form">
      <fieldset className="field">
        <legend className="field-label">{text('هتعد إيه؟', 'What will you count?')}</legend>
        <div className="order-types inv-choice-cards">
          {([
            ['all', text('كل الخامات', 'Everything'), text('كل الخامات الخام النشطة في الفرع.', 'Every active raw ingredient at the branch.')],
            ['category', text('قسم واحد', 'One category'), text('زي الخضار أو الألبان، لجرد سريع.', 'Such as vegetables or dairy, for a quick count.')],
            ['chosen', text('خامات أختارها', 'Chosen ingredients'), text('اللي محتاج تتأكد منه بس.', 'Just the ones you want to check.')],
          ] as const).map(([value, label, hint]) => <label key={value} className={`order-type ${mode === value ? 'is-checked' : ''}`}>
            <input type="radio" name="count-scope" value={value} checked={mode === value} onChange={() => setMode(value)} />
            <span><strong>{label}</strong><small>{hint}</small></span>
          </label>)}
        </div>
      </fieldset>
      {mode === 'category' && <Field label={text('القسم', 'Category')}>
        <select className="select" value={category} onChange={event => setCategory(event.target.value)}>{categories.map(entry => <option key={entry} value={entry}>{entry}</option>)}</select>
      </Field>}
      {mode === 'chosen' && <fieldset className="field">
        <legend className="field-label">{text(`الخامات (${formatNumber(chosen.length, 'ar')} مختارة)`, `Ingredients (${chosen.length} chosen)`)}</legend>
        <SearchBox value={search} onChange={setSearch} label={text('دوّر على خامة', 'Search ingredients')} />
        <div className="check-grid inv-check-grid" data-testid="count-choices">
          {raw.filter(ingredient => matchesIngredient(ingredient, search)).map(ingredient => <label key={ingredient.id} className="check-row">
            <input type="checkbox" checked={chosen.includes(ingredient.id)} onChange={event => toggle(ingredient, event.target.checked)} />
            <span><bdi>{format.name(ingredient.nameAr, ingredient.nameEn)}</bdi>{ingredient.category && <small className="muted"> · {ingredient.category}</small>}</span>
          </label>)}
        </div>
      </fieldset>}
      <Field label={text('ملاحظة', 'Note')} optional><input className="input" maxLength={INVENTORY_LIMITS.noteLength} value={note} onChange={event => setNote(event.target.value)} /></Field>
    </div>}
  </Dialog>;
}

/** Counts waiting for approval at every branch the viewer sees. */
function ApprovalQueue() {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const branchId = useListBranch();
  const filters: CountFilters = { branchId, status: 'PENDING_APPROVAL', page: 1, pageSize: 50 };
  const pending = useQuery({ queryKey: inventoryKeys.counts(filters), queryFn: () => inventoryApi.counts(filters), enabled: actions.view });
  const [openId, setOpenId] = useState<string | null>(null);
  if (!pending.data || pending.data.items.length === 0) return null;
  return <section className="card list-card" aria-labelledby="count-approvals" data-testid="count-approvals">
    <h2 id="count-approvals" className="card-title inv-card-title">{text('جرد مستني موافقتك', 'Counts waiting for your approval')}</h2>
    <ul className="corr-list">{pending.data.items.map(count => <li key={count.id} className="corr-item">
      <div className="corr-head"><strong><bdi>{count.branchName}</bdi></strong><span className="muted">{text(`${formatNumber(count.countedLines, 'ar')} سطر`, `${count.countedLines} lines`)}</span>
        {actions.costs && <strong>{format.signedMoney(count.varianceValue)}</strong>}<small className="corr-when">{format.dateTime(count.submittedAt)}</small></div>
      <div className="corr-actions"><Button small variant="secondary" onClick={() => setOpenId(count.id)}>{text('راجع', 'Review')}</Button></div>
    </li>)}</ul>
    {openId && <CountDialog countId={openId} onClose={() => setOpenId(null)} />}
  </section>;
}

function CountDialog({ countId, onClose }: { countId: string; onClose: () => void }) {
  const { text } = useLanguage();
  return <Dialog open onClose={onClose} size="wide" title={text('الجرد', 'Count')} footer={<Button variant="secondary" onClick={onClose}>{text('إغلاق', 'Close')}</Button>}>
    <CountSheet countId={countId} inDialog />
  </Dialog>;
}

function CountHistory() {
  const { text } = useLanguage();
  const format = useInventoryFormat();
  const actions = useInventoryActions();
  const branchId = useListBranch();
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const filters: CountFilters = { branchId, page, pageSize: 10 };
  const counts = useQuery({ queryKey: inventoryKeys.counts(filters), queryFn: () => inventoryApi.counts(filters), placeholderData: keepPreviousData });
  const rows: StockCount[] = counts.data?.items ?? [];
  return <section className="card list-card" aria-labelledby="count-history">
    <h2 id="count-history" className="card-title inv-card-title">{text('سجل الجرد', 'Count history')}</h2>
    {counts.isError && <ErrorPanel error={counts.error} onRetry={() => void counts.refetch()} />}
    {counts.isPending && <Skeleton height={80} />}
    {counts.data && rows.length === 0 && <p className="muted cash-empty">{text('مفيش جرد لسه.', 'No counts yet.')}</p>}
    {rows.length > 0 && <div className="table-scroll"><table className="data-table inv-table" data-testid="count-history-table">
      <thead><tr><th scope="col">{text('اتبدأ', 'Started')}</th><th scope="col">{text('الفرع', 'Branch')}</th><th scope="col">{text('الحالة', 'Status')}</th>
        <th scope="col">{text('اتعد', 'Counted')}</th>{actions.costs && <th scope="col">{text('صافي الفرق', 'Net difference')}</th>}<th scope="col">{text('اترحّل', 'Posted')}</th></tr></thead>
      <tbody>{rows.map(count => <tr key={count.id} data-testid="count-history-row">
        <td className="cell-primary cell-nowrap"><button type="button" className="table-link link-button row-link" onClick={() => setOpenId(count.id)}>{format.dateTime(count.createdAt)}</button></td>
        <td><bdi>{count.branchName}</bdi></td>
        <td className="cell-end"><CountStatusBadge status={count.status} /></td>
        <td>{text(`${formatNumber(count.countedLines, 'ar')} من ${formatNumber(count.lineCount, 'ar')}`, `${count.countedLines} of ${count.lineCount}`)}</td>
        {actions.costs && <td className="cell-nowrap">{format.signedMoney(count.varianceValue)}</td>}
        <td className="cell-nowrap">{count.postedAt ? <>{format.dateTime(count.postedAt)}{count.postedBy && <small><bdi>{count.postedBy}</bdi></small>}</> : '—'}</td>
        <CompactMeta parts={[<bdi key="b">{count.branchName}</bdi>, text(`${formatNumber(count.countedLines, 'ar')} من ${formatNumber(count.lineCount, 'ar')}`, `${count.countedLines} of ${count.lineCount}`), actions.costs ? format.signedMoney(count.varianceValue) : null]} />
      </tr>)}</tbody>
    </table></div>}
    {counts.data && <Pagination page={page} pageSize={counts.data.pageSize} total={counts.data.total} onChange={setPage} label={text('صفحات الجرد', 'Count pages')} />}
    {openId && <CountDialog countId={openId} onClose={() => setOpenId(null)} />}
  </section>;
}
