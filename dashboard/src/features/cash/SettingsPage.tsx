import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon, ArrowCounterClockwiseIcon, CashRegisterIcon, PlusIcon } from '@phosphor-icons/react';
import { CLOSING_NOTE_RULES, DEFAULT_CASH_SETTINGS, type CashRegister, type CashSettings, type ClosingNoteRule } from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { cashApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { cashKeys, moneyInput, parseMoney } from './shared';

const NOTE_RULE_TEXT: Record<ClosingNoteRule, [string, string]> = {
  NEVER: ['مش مطلوبة', 'Never required'],
  ON_DISCREPANCY: ['لما يكون فيه فرق', 'When the count differs'],
  ALWAYS: ['دايمًا', 'Always'],
};

/** The reconciliation rules and the branches' registers. */
export function CashSettingsPage() {
  usePageTitle('الخزن والقواعد', 'Registers and rules');
  const settings = useQuery({ queryKey: cashKeys.settings, queryFn: cashApi.settings });
  return <>
    {settings.isError && <ErrorPanel error={settings.error} onRetry={() => void settings.refetch()} />}
    {settings.isPending && <Skeleton height={260} />}
    {settings.data && <RulesForm settings={settings.data} />}
    <RegistersCard />
  </>;
}

function RulesForm({ settings }: { settings: CashSettings }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ ...DEFAULT_CASH_SETTINGS, ...settings });
  const [tolerance, setTolerance] = useState(moneyInput(settings.discrepancyTolerancePiastres));
  useEffect(() => { setDraft({ ...DEFAULT_CASH_SETTINGS, ...settings }); setTolerance(moneyInput(settings.discrepancyTolerancePiastres)); }, [settings]);
  const tolerancePiastres = parseMoney(tolerance || '0');
  const save = useMutation({
    mutationFn: () => cashApi.updateSettings({
      allowSharedRegister: draft.allowSharedRegister, requireShiftForCash: draft.requireShiftForCash, adjustmentsNeedApproval: draft.adjustmentsNeedApproval,
      discrepancyTolerancePiastres: tolerancePiastres ?? 0, closingNote: draft.closingNote,
    }),
    onSuccess: saved => { queryClient.setQueryData(cashKeys.settings, saved); void queryClient.invalidateQueries({ queryKey: cashKeys.me }); toast.success(text('اتحفظت القواعد', 'Rules saved')); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const set = <K extends keyof typeof draft>(key: K) => (value: (typeof draft)[K]) => setDraft(current => ({ ...current, [key]: value }));
  return <section className="card cash-rules" aria-labelledby="cash-rules-title">
    <h2 id="cash-rules-title" className="card-title">{text('قواعد التسوية', 'Reconciliation rules')}</h2>
    <form onSubmit={event => { event.preventDefault(); if (tolerancePiastres !== null) save.mutate(); }}>
      <Switch checked={draft.requireShiftForCash} onChange={set('requireShiftForCash')}
        label={text('الكاش محتاج شيفت مفتوح', 'Cash needs an open shift')}
        description={text('مينفعش تقفل حساب كاش (أو ترجّعه) من غير شيفت كاشير مفتوح، عشان مفيش كاش يبقى برّه الدرج.', 'Cash bills (and their reversal) need an open cashier shift, so no cash is left outside a drawer.')} />
      <Switch checked={draft.adjustmentsNeedApproval} onChange={set('adjustmentsNeedApproval')}
        label={text('التسويات محتاجة موافقة مدير', 'Adjustments need a manager’s approval')}
        description={text('تسوية الكاشير مش بتتحسب في المتوقع غير لما مدير يوافق عليها.', 'A cashier’s adjustment counts toward the expected cash only once a manager approves it.')} />
      <Switch checked={draft.allowSharedRegister} onChange={set('allowSharedRegister')}
        label={text('أكتر من كاشير على نفس الخزنة', 'Several cashiers on one register')}
        description={text('عادةً كل خزنة عليها شيفت واحد مفتوح بس.', 'Normally each register has one open shift at a time.')} />
      <div className="cash-rules-grid">
        <Field label={text('الفرق المسموح من غير مراجعة (ج.م)', 'Difference allowed without review (EGP)')}
          error={tolerancePiastres === null ? { message: text('اكتب مبلغ صحيح', 'Enter a valid amount') } : undefined}
          hint={text('لو الفرق أكبر من كده، الشيفت يستنى موافقة مدير.', 'A larger difference waits for a manager’s approval.')}>
          <input className="input ltr" inputMode="decimal" value={tolerance} onChange={event => setTolerance(event.target.value)} />
        </Field>
        <Field label={text('ملاحظة القفل', 'Closing note')}>
          <select className="select" value={draft.closingNote} onChange={event => set('closingNote')(event.target.value as ClosingNoteRule)}>
            {CLOSING_NOTE_RULES.map(rule => <option key={rule} value={rule}>{text(...NOTE_RULE_TEXT[rule])}</option>)}
          </select>
        </Field>
      </div>
      <div className="cash-actions"><span className="att-actions-spacer" /><Button type="submit" loading={save.isPending} disabled={tolerancePiastres === null}>{text('احفظ', 'Save')}</Button></div>
    </form>
  </section>;
}

function RegistersCard() {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useBranchScope();
  const selected = scope.selected === 'all' ? null : scope.selected;
  const registers = useQuery({ queryKey: cashKeys.registers(selected), queryFn: () => cashApi.registers(selected) });
  const [branchId, setBranchId] = useState(selected ?? scope.choices.find(branch => branch.isMain)?.id ?? scope.choices[0]?.id ?? '');
  const [name, setName] = useState('');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: cashKeys.all });
  const create = useMutation({
    mutationFn: () => cashApi.createRegister({ branchId, name: name.trim() }),
    onSuccess: () => { setName(''); refresh(); toast.success(text('الخزنة اتضافت', 'Register added')); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  const update = useMutation({
    mutationFn: (register: CashRegister) => cashApi.updateRegister(register.id, { isActive: !register.isActive }),
    onSuccess: saved => { refresh(); toast.success(saved.isActive ? text('الخزنة رجعت', 'Register restored') : text('الخزنة اتأرشفت', 'Register archived')); },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  return <section className="card list-card" aria-labelledby="cash-registers-title">
    <h2 id="cash-registers-title" className="card-title">{text('الخزن', 'Registers')}</h2>
    <p className="muted cash-empty">{text('لو الفرع فيه خزن، الكاشير لازم يختار واحدة وهو بيفتح الشيفت. من غير خزن، الشيفت بيبقى على الفرع.', 'When a branch has registers, cashiers pick one when opening a shift. Without registers, shifts belong to the branch.')}</p>
    <form className="cash-register-form" onSubmit={event => { event.preventDefault(); if (name.trim() && branchId) create.mutate(); }}>
      {scope.choices.length > 1 && <Field label={text('الفرع', 'Branch')}>
        <select className="select" value={branchId} onChange={event => setBranchId(event.target.value)}>
          {scope.choices.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </Field>}
      <Field label={text('اسم الخزنة', 'Register name')}><input className="input" maxLength={40} value={name} onChange={event => setName(event.target.value)} placeholder={text('مثلاً: الكاشير الرئيسي', 'e.g. Front counter')} /></Field>
      <Button type="submit" loading={create.isPending} disabled={!name.trim() || !branchId} icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />}>{text('ضيف', 'Add')}</Button>
    </form>
    {registers.isError && <ErrorPanel error={registers.error} onRetry={() => void registers.refetch()} />}
    {registers.isPending && <Skeleton height={60} />}
    {registers.data && registers.data.length > 0 && <ul className="cash-registers">
      {registers.data.map(register => <li key={register.id} className={register.isActive ? '' : 'is-archived'} data-testid="cash-register">
        <CashRegisterIcon size={20} aria-hidden="true" />
        <span><strong><bdi>{register.name}</bdi></strong><small className="muted"> · <bdi>{register.branchName}</bdi></small>
          {register.openShifts.map(shift => <small key={shift.id} className="muted"> · {text('مفتوح عليها:', 'Open:')} <bdi>{shift.cashierName}</bdi></small>)}
          {!register.isActive && <small className="muted"> · {text('متأرشفة', 'Archived')}</small>}
        </span>
        <Button small variant="ghost" loading={update.isPending && update.variables?.id === register.id} onClick={() => update.mutate(register)}
          icon={register.isActive ? <ArchiveIcon size={15} aria-hidden="true" /> : <ArrowCounterClockwiseIcon size={15} aria-hidden="true" />}>
          {register.isActive ? text('أرشف', 'Archive') : text('رجّعها', 'Restore')}
        </Button>
      </li>)}
    </ul>}
  </section>;
}
