import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CashRegisterIcon, CheckIcon, CookingPotIcon, CopyIcon, KeyIcon, PlusIcon, UserGearIcon, UserIcon, WhatsappLogoIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import {
  createKitchenAccountSchema, KITCHEN_ERROR_CODES, KITCHEN_LIMITS, type KitchenAccount, passwordSchema, type Permission, PERMISSION_LABELS, ROLE_LABELS, ROLE_PERMISSIONS,
  STAFF_LIMITS, type StaffAuditEntry, type StaffOptions, type StaffRole,
} from '@bilhanah/contracts';
import { z } from 'zod';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Dialog } from '../../../components/Dialog';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { Field } from '../../../components/Field';
import { PasswordInput } from '../../../components/PasswordInput';
import { Section } from '../../../components/Section';
import { Skeleton } from '../../../components/Skeleton';
import { useToast } from '../../../components/Toast';
import { isApiError } from '../../../lib/api';
import { kitchenAccountsApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { fill, useCopy } from '../../../lib/copy';
import { formatRelative } from '../../../lib/format';
import { schemaResolver } from '../../../lib/forms';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { useBranchScope } from '../../branches/BranchScope';
import { useBranchList, useWorkspace } from '../../branches/workspace';
import { useSession } from '../../../lib/session';
import { queryKeys } from '../queries';
import { INVENTORY_PERMISSION_HELP, isInventoryPermission } from '../../inventory/permission-help';
import { isReviewPermission, REVIEW_PERMISSION_HELP } from '../../reviews/permission-help';

const setPasswordFormSchema = z.object({ password: passwordSchema, confirm: z.string() })
  .refine(values => values.password === values.confirm, { path: ['confirm'], message: '@@mismatch' });
const editAccountSchema = z.object({ fullName: z.string().trim().min(2).max(100) });

const replaceAccount = (list: KitchenAccount[] | undefined, account: KitchenAccount) => list?.map(entry => (entry.id === account.id ? account : entry));

/** What each staff role does, as the staff page explains it: [Arabic, English]. */
const ROLE_HINTS: Record<StaffRole, [string, string]> = {
  MANAGER: ['بيدير شغل الفرع: الطلبات والطاولات والحجوزات والحسابات ومنيو الفرع والموظفين تحته والإحصائيات. مش بيدير الاشتراك ولا إعدادات المطعم.', 'Runs the branch day to day: orders, tables, bookings, bills, the branch menu, the staff below them and insights. Not the subscription or restaurant settings.'],
  CASHIER: ['بيقفل الحسابات ويسلّم الطلبات، وبيشوف الطلبات والطاولات والمنيو. مبيعدّلش أسعار ولا إعدادات.', 'Takes payments and completes orders; sees orders, tables and the menu. Cannot change prices or settings.'],
  WAITER: ['بيخدم الطاولات: بيشوف الطاولات والطلبات، وبيسجّل الحجوزات ويرد على طلبات الخدمة. مبيقفلش حسابات.', 'Serves the tables: sees tables and orders, takes bookings and answers service requests. Cannot take payments.'],
  KITCHEN: ['شاشة المطبخ: بتشوف الطلبات وتحرّكها لحد ما تجهز، وتعلّم الصنف خلص.', 'The kitchen screen: sees orders and moves them until ready, marks dishes sold out.'],
};
const ROLE_ICONS: Record<StaffRole, Icon> = { MANAGER: UserGearIcon, CASHIER: CashRegisterIcon, WAITER: UserIcon, KITCHEN: CookingPotIcon };
const NO_OPTIONS: StaffOptions = { roles: [], grantable: { MANAGER: [], CASHIER: [], WAITER: [], KITCHEN: [] }, branchId: null };

/** The roles and grants the viewer may give (none while loading or without staff.manage). */
function useStaffOptions(): StaffOptions {
  const { can } = useWorkspace();
  const options = useQuery({ queryKey: queryKeys.staffOptions, queryFn: kitchenAccountsApi.options, enabled: can('staff.view') });
  return can('staff.manage') ? options.data ?? NO_OPTIONS : NO_OPTIONS;
}

/**
 * Staff accounts: managers, cashiers, waiters and kitchen screens, each with a role (and maybe a few
 * extra permissions) and a branch. Owners manage them all; managers the roles below theirs. The
 * buttons follow what the API allows the viewer; the API checks it again.
 */
export function KitchenSettings() {
  const { number, text } = useLanguage();
  const t = useCopy();
  usePageTitle('الفريق', 'Team');
  const { can } = useWorkspace();
  const options = useStaffOptions();
  const accounts = useQuery({ queryKey: queryKeys.kitchenAccounts, queryFn: kitchenAccountsApi.list });
  const [params, setParams] = useSearchParams();
  const wanted = params.get('new') === 'CASHIER' ? 'CASHIER' : null;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<KitchenAccount | null>(null);
  const [ready, setReady] = useState<PosAccountDetails | null>(null);
  useEffect(() => {
    if (wanted && options.roles.includes(wanted)) { setAdding(true); setParams(current => { current.delete('new'); return current; }, { replace: true }); }
  }, [wanted, options.roles, setParams]);
  const full = (accounts.data?.length ?? 0) >= STAFF_LIMITS.accounts;
  return <div className="settings-grid">
    <div className="settings-main">
      <Section id="kitchen-title" title={t.team.title} description={t.team.description}
        actions={options.roles.length > 0 ? <Button small onClick={() => setAdding(true)} disabled={full || !accounts.data} icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />}>{t.team.add}</Button> : undefined}>
        {accounts.isPending && <div className="skeleton-stack"><Skeleton height={56} /><Skeleton height={56} /></div>}
        {accounts.isError && <ErrorPanel error={accounts.error} onRetry={() => void accounts.refetch()} />}
        {accounts.data?.length === 0 && <p className="board-empty">{t.team.empty}</p>}
        {accounts.data && accounts.data.length > 0 && <ul className="session-list">
          {accounts.data.map(account => <KitchenAccountRow key={account.id} account={account} options={options} onEdit={() => setEditing(account)} />)}
        </ul>}
        <p className="field-hint">{fill(t.team.limits, { kitchens: number(KITCHEN_LIMITS.accounts), total: number(STAFF_LIMITS.accounts) })}</p>
      </Section>
      {can('staff.manage') && <StaffActivity />}
    </div>
    <aside className="settings-aside" aria-labelledby="kitchen-how-title">
      <h2 id="kitchen-how-title">{t.team.howTitle}</h2>
      <p className="field-hint">{t.team.howBody}</p>
      <dl className="team-roles">
        {(['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] as const).map(role => <div key={role}><dt>{text(...ROLE_LABELS[role])}</dt><dd>{text(...ROLE_HINTS[role])}</dd></div>)}
      </dl>
    </aside>
    <AddKitchenAccountDialog open={adding} options={options} initialRole={wanted ?? undefined} onClose={() => setAdding(false)} onPosCreated={setReady} />
    <PosAccountReady details={ready} onClose={() => setReady(null)} />
    <EditAccountDialog account={editing} options={options} onClose={() => setEditing(null)} />
  </div>;
}

/** The branches an account can work at: active ones, plus the account's own if it was archived. */
function useAccountBranches(current: string | null = null) {
  const list = useBranchList();
  return list.branches.filter(branch => branch.isActive || branch.id === current);
}

/** Role, extra permissions and branch (one, or every branch) of a staff account, among what the viewer may give. */
function RoleAndBranch({ options, role, grants, branchId, onRole, onGrants, onBranch }: {
  options: StaffOptions; role: StaffRole; grants: Permission[]; branchId: string | null;
  onRole: (role: StaffRole) => void; onGrants: (grants: Permission[]) => void; onBranch: (branchId: string | null) => void;
}) {
  const t = useCopy();
  const { text } = useLanguage();
  const branches = useAccountBranches(branchId);
  const grantable = options.grantable[role];
  return <>
    <fieldset className="field">
      <legend className="field-label">{t.team.role}</legend>
      <div className="order-types role-options">
        {options.roles.map(option => <label key={option} className={`order-type ${role === option ? 'is-checked' : ''}`}>
          <input type="radio" name="staff-role" value={option} checked={role === option} onChange={() => { onRole(option); onGrants(grants.filter(grant => options.grantable[option].includes(grant))); }} />
          <span><strong>{text(...ROLE_LABELS[option])}</strong><small>{text(...ROLE_HINTS[option])}</small></span>
        </label>)}
      </div>
    </fieldset>
    {grantable.length > 0 && <fieldset className="field" data-testid="staff-grants">
      <legend className="field-label">{text('صلاحيات زيادة', 'Extra permissions')}</legend>
      {grantable.filter(permission => !isInventoryPermission(permission) && !isReviewPermission(permission)).map(permission => <GrantRow key={permission} permission={permission} grants={grants} onGrants={onGrants} />)}
      {grantable.some(isInventoryPermission) && <div className="staff-grant-group" data-testid="staff-grants-inventory">
        <strong className="staff-grant-title">{text('المخزون والتكاليف', 'Inventory & costs')}</strong>
        {ROLE_PERMISSIONS[role].some(isInventoryPermission) && <small className="field-hint">{text('الدور ده عنده بالفعل:', 'This role already has:')} {ROLE_PERMISSIONS[role].filter(isInventoryPermission).map(permission => text(...PERMISSION_LABELS[permission])).join(text('، ', ', '))}</small>}
        {grantable.filter(isInventoryPermission).map(permission => <GrantRow key={permission} permission={permission} grants={grants} onGrants={onGrants} hint={text(...INVENTORY_PERMISSION_HELP[permission])} />)}
      </div>}
      {grantable.some(isReviewPermission) && <div className="staff-grant-group" data-testid="staff-grants-reviews">
        <strong className="staff-grant-title">{text('آراء الزباين', 'Diners’ reviews')}</strong>
        {ROLE_PERMISSIONS[role].some(isReviewPermission) && <small className="field-hint">{text('الدور ده عنده بالفعل:', 'This role already has:')} {ROLE_PERMISSIONS[role].filter(isReviewPermission).map(permission => text(...PERMISSION_LABELS[permission])).join(text('، ', ', '))}</small>}
        {grantable.filter(isReviewPermission).map(permission => <GrantRow key={permission} permission={permission} grants={grants} onGrants={onGrants} hint={text(...REVIEW_PERMISSION_HELP[permission])} />)}
      </div>}
    </fieldset>}
    {!options.branchId && branches.length > 1 && <Field label={t.team.branch} hint={branchId ? t.team.branchHint : t.team.branchAllHint}>
      <select className="select" value={branchId ?? ''} onChange={event => onBranch(event.target.value || null)} data-testid="staff-branch">
        <option value="">{t.team.branchAll}</option>
        {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.isActive ? branch.name : `${branch.name} (${t.scope.archived})`}</option>)}
      </select>
    </Field>}
  </>;
}

function GrantRow({ permission, grants, onGrants, hint }: { permission: Permission; grants: Permission[]; onGrants: (grants: Permission[]) => void; hint?: string }) {
  const { text } = useLanguage();
  return <label className="check-row" data-permission={permission}>
    <input type="checkbox" checked={grants.includes(permission)}
      onChange={event => onGrants(event.target.checked ? [...grants, permission] : grants.filter(grant => grant !== permission))} />
    <span>{text(...PERMISSION_LABELS[permission])}{hint && <small className="staff-grant-hint">{hint}</small>}</span>
  </label>;
}

function KitchenAccountRow({ account, options, onEdit }: { account: KitchenAccount; options: StaffOptions; onEdit: () => void }) {
  const { text, language } = useLanguage();
  const session = useSession();
  // Only accounts with a role the viewer may give, and never their own.
  const manageable = options.roles.includes(account.role) && !(session.status === 'authenticated' && session.user.id === account.id);
  const t = useCopy();
  const toast = useToast();
  const queryClient = useQueryClient();
  const multi = useBranchList().branches.filter(branch => branch.isActive).length > 1;
  const [settingPassword, setSettingPassword] = useState(false);
  const [settingPin, setSettingPin] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const usesPos = account.permissions.includes('pos.use');
  const toggle = useMutation({
    mutationFn: () => kitchenAccountsApi.update(account.id, { active: !account.active }),
    onSuccess: saved => {
      queryClient.setQueryData<KitchenAccount[]>(queryKeys.kitchenAccounts, list => replaceAccount(list, saved));
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffActivity });
      toast.success(saved.active ? text('رجّعنا الحساب يشتغل', 'Account turned back on') : text('وقّفنا الحساب وخرّجنا شاشاته', 'Account turned off and its screens signed out'));
    },
    onError: error => toast.error(errorMessage(error, text)),
  });
  const remove = useMutation({
    mutationFn: () => kitchenAccountsApi.remove(account.id),
    onSuccess: () => {
      queryClient.setQueryData<KitchenAccount[]>(queryKeys.kitchenAccounts, list => list?.filter(entry => entry.id !== account.id));
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches });
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffActivity });
      toast.success(text('مسحنا الحساب', 'Account deleted'));
      setDeleting(false);
    },
    onError: error => toast.error(errorMessage(error, text)),
  });
  const manager = account.role === 'MANAGER';
  const RoleIcon = ROLE_ICONS[account.role];
  return <li className="session-row" data-testid="kitchen-account-row">
    <span className="session-icon" aria-hidden="true"><RoleIcon size={22} /></span>
    <div className="session-info">
      <strong><bdi>{account.fullName}</bdi> <span className={`badge ${manager ? 'badge-guava' : 'badge-muted'}`} data-testid="account-role">{text(...ROLE_LABELS[account.role])}</span>
        {account.grants.map(grant => <span key={grant} className="badge badge-muted"> + {text(...PERMISSION_LABELS[grant])}</span>)}
        {' '}{!account.active && <span className="badge badge-danger">{text('موقوف', 'Off')}</span>}
        {usesPos && account.hasPin && <span className="badge badge-info">{account.pinLockedUntil ? text('الـ PIN مقفول', 'PIN locked') : 'PIN'}</span>}</strong>
      <small>{multi && <><span data-testid="account-branch"><bdi>{account.branchName ?? t.team.allBranches}</bdi></span>{' · '}</>}<span className="ltr">{account.email}</span>
        {' · '}{account.lastSeenAt ? text(`آخر استخدام ${formatRelative(account.lastSeenAt, language)}`, `Active ${formatRelative(account.lastSeenAt, language)}`) : text('لسه ما دخلش', 'Not signed in yet')}
      </small>
    </div>
    {manageable && <div className="page-actions">
      <Button small variant="ghost" onClick={onEdit}>{t.team.edit}</Button>
      <Button small variant="ghost" onClick={() => setSettingPassword(true)}>{text('كلمة سر جديدة', 'New password')}</Button>
      {usesPos && <Button small variant="ghost" onClick={() => setSettingPin(true)}>{account.hasPin ? text('غيّر الـ PIN', 'Change PIN') : text('حدد PIN', 'Set PIN')}</Button>}
      <Button small variant="secondary" loading={toggle.isPending} onClick={() => toggle.mutate()}>{account.active ? text('وقّفه', 'Turn off') : text('شغّله', 'Turn on')}</Button>
      <Button small variant="danger-outline" onClick={() => setDeleting(true)}>{text('امسح', 'Delete')}</Button>
    </div>}
    <SetPasswordDialog account={settingPassword ? account : null} onClose={() => setSettingPassword(false)} />
    <SetPinDialog account={settingPin ? account : null} onClose={() => setSettingPin(false)} />
    <ConfirmDialog open={deleting} busy={remove.isPending} onCancel={() => setDeleting(false)} onConfirm={() => remove.mutate()}
      title={text('تمسح الحساب ده؟', 'Delete this account?')} confirmLabel={text('امسح', 'Delete')}
      description={text(`أي جهاز داخل بحساب «${account.fullName}» هيخرج على طول.`, `Any device signed in as “${account.fullName}” is signed out at once.`)} />
  </li>;
}

function AddKitchenAccountDialog({ open, options, initialRole, onClose, onPosCreated }: { open: boolean; options: StaffOptions; initialRole?: StaffRole; onClose: () => void; onPosCreated: (details: PosAccountDetails) => void }) {
  const { text } = useLanguage();
  const t = useCopy();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useBranchScope();
  const [error, setError] = useState<unknown>(null);
  const [role, setRole] = useState<StaffRole>('KITCHEN');
  const [grants, setGrants] = useState<Permission[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const { register, handleSubmit, reset, setValue, setError: setFieldError, formState: { errors, isSubmitting } } = useForm({
    resolver: schemaResolver(createKitchenAccountSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  });
  useEffect(() => {
    if (!open) return;
    reset(); setError(null); setGrants([]);
    setRole(initialRole && options.roles.includes(initialRole) ? initialRole : options.roles.includes('KITCHEN') ? 'KITCHEN' : options.roles[0] ?? 'KITCHEN');
    // A new account starts at the branch being worked on (a branch-tied manager's is theirs).
    setBranchId(options.branchId ?? (scope.selected === 'all' ? null : scope.selected));
  }, [open, reset, scope.selected, options, initialRole]);
  const onSubmit = handleSubmit(async values => {
    setError(null);
    try {
      const account = await kitchenAccountsApi.create({ ...values, role, branchId, permissions: grants });
      queryClient.setQueryData<KitchenAccount[]>(queryKeys.kitchenAccounts, list => [...(list ?? []), account]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffActivity });
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches });
      toast.success(text(`عملنا حساب «${account.fullName}»`, `“${account.fullName}” created`));
      onClose();
      // A till account is handed over right away: its sign-in and the POS link, once.
      if (account.role === 'CASHIER') onPosCreated({ name: account.fullName, email: values.email, password: values.password });
    } catch (caught) {
      if (isApiError(caught, KITCHEN_ERROR_CODES.EMAIL_TAKEN)) setFieldError('email', { type: 'server', message: errorMessage(caught, text) }, { shouldFocus: true });
      else setError(caught);
    }
  });
  return <Dialog open={open} onClose={onClose} busy={isSubmitting} onSubmit={() => void onSubmit()} title={t.team.newTitle}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={isSubmitting}>{text('اعمل الحساب', 'Create account')}</Button>
    </>}>
    <div className="form">
      {error !== null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
      <Field label={text('الاسم', 'Name')} error={errors.fullName} required hint={t.team.nameHint}>
        <input className="input" data-autofocus maxLength={100} {...register('fullName')} />
      </Field>
      <RoleAndBranch options={options} role={role} grants={grants} branchId={branchId} onRole={setRole} onGrants={setGrants} onBranch={setBranchId} />
      <Field label={text('الإيميل', 'Email')} error={errors.email} required hint={text('بيُستخدم للدخول بس، ومش هنبعت عليه رسايل.', 'Used to sign in only; we send nothing to it.')}>
        <input className="input ltr-input" dir="ltr" type="email" autoComplete="off" {...register('email')} />
      </Field>
      <Field label={text('كلمة السر', 'Password')} error={errors.password} required hint={text('٨ حروف على الأقل.', 'At least 8 characters.')}>
        <PasswordInput autoComplete="new-password" {...register('password')} />
      </Field>
      <button type="button" className="link-button team-generate" onClick={() => setValue('password', strongPassword(), { shouldValidate: true })}><KeyIcon size={16} aria-hidden="true" />{text('ولّد كلمة سر قوية', 'Generate a strong password')}</button>
    </div>
  </Dialog>;
}

/** A staff account's POS PIN: 4–6 digits for quick sign-in on a registered device (or removed). */
function SetPinDialog({ account, onClose }: { account: KitchenAccount | null; onClose: () => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { if (account) { setPin(''); setError(null); } }, [account]);
  const save = useMutation({
    mutationFn: (value: string | null) => kitchenAccountsApi.setPin(account!.id, value),
    onSuccess: saved => {
      queryClient.setQueryData<KitchenAccount[]>(queryKeys.kitchenAccounts, list => replaceAccount(list, saved));
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffActivity });
      toast.success(saved.hasPin ? text('الـ PIN اتحفظ', 'PIN saved') : text('الـ PIN اتشال', 'PIN removed'));
      onClose();
    },
    onError: setError,
  });
  const valid = /^\d{4,6}$/.test(pin);
  const random = () => { const digits = crypto.getRandomValues(new Uint32Array(6)); setPin(Array.from(digits, value => String(value % 10)).join('')); };
  return <Dialog open={account !== null} onClose={onClose} size="small" busy={save.isPending} onSubmit={() => { if (valid) save.mutate(pin); }}
    title={account ? text(`PIN الكاشير لـ «${account.fullName}»`, `POS PIN for “${account.fullName}”`) : ''}
    footer={<>
      {account?.hasPin && <Button variant="danger-outline" onClick={() => save.mutate(null)} disabled={save.isPending}>{text('شيل الـ PIN', 'Remove PIN')}</Button>}
      <Button variant="secondary" onClick={onClose}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" disabled={!valid} loading={save.isPending}>{text('احفظ', 'Save')}</Button>
    </>}>
    <div className="form">
      {error !== null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
      <p className="field-hint">{text('بالـ PIN الموظف بيدخل على جهاز الكاشير المسجّل بسرعة من غير إيميل. بعد ٥ محاولات غلط بيتقفل ربع ساعة. الـ PIN بيتحفظ متشفّر، ومحدش بيشوفه بعد كده.', 'With a PIN, staff sign in quickly on a registered POS device, without an email. Five wrong tries lock it for 15 minutes. It is stored hashed and never shown again.')}</p>
      <Field label={text('الـ PIN (من ٤ لـ ٦ أرقام)', 'PIN (4–6 digits)')} required>
        <input className="input ltr-input pos-pin-input" dir="ltr" inputMode="numeric" autoComplete="off" maxLength={6} data-autofocus value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} />
      </Field>
      <button type="button" className="link-button team-generate" onClick={random}><KeyIcon size={16} aria-hidden="true" />{text('ولّد PIN عشوائي', 'Generate a random PIN')}</button>
      {account?.pinLockedUntil && <Alert kind="warning">{text('الـ PIN مقفول دلوقتي من كتر المحاولات الغلط. PIN جديد بيفك القفل.', 'The PIN is locked after too many wrong tries. A new PIN unlocks it.')}</Alert>}
    </div>
  </Dialog>;
}

/** 12 characters without look-alikes (0/O, 1/l/I), easy to read out to a cashier. */
function strongPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join('');
}

type PosAccountDetails = { name: string; email: string; password: string };

/** Shown once after a POS account is created: how to sign in, and where. Copy it or send it on WhatsApp. */
function PosAccountReady({ details, onClose }: { details: PosAccountDetails | null; onClose: () => void }) {
  const { text } = useLanguage();
  const { restaurant } = useWorkspace();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/manager/terminal`;
  const message = details ? text(
    `أهلاً ${details.name}، ده حسابك على كاشير ${restaurant.name}:\nالرابط: ${link}\nالإيميل: ${details.email}\nكلمة السر: ${details.password}`,
    `Hi ${details.name}, here is your POS account for ${restaurant.name}:\nLink: ${link}\nEmail: ${details.email}\nPassword: ${details.password}`) : '';
  const copy = async () => { try { await navigator.clipboard.writeText(message); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* The details are selectable on screen. */ } };
  return <Dialog open={details !== null} onClose={onClose} size="small" title={text('حساب الكاشير جاهز', 'The POS account is ready')}
    footer={<Button onClick={onClose}>{text('تمام', 'Done')}</Button>}>
    {details && <div className="pos-ready">
      <p className="field-hint">{text('ابعت البيانات دي للكاشير. كلمة السر مش هتظهر تاني، وتقدر تغيّرها في أي وقت من الفريق.', 'Send these to the cashier. The password is not shown again; you can change it any time from Team.')}</p>
      <dl className="pos-ready-list">
        <div><dt>{text('الرابط', 'Link')}</dt><dd dir="ltr">{link}</dd></div>
        <div><dt>{text('الإيميل', 'Email')}</dt><dd dir="ltr">{details.email}</dd></div>
        <div><dt>{text('كلمة السر', 'Password')}</dt><dd dir="ltr" className="pos-ready-secret">{details.password}</dd></div>
      </dl>
      <div className="pos-ready-actions">
        <Button variant="secondary" onClick={() => void copy()} icon={copied ? <CheckIcon size={16} aria-hidden="true" /> : <CopyIcon size={16} aria-hidden="true" />}>{copied ? text('اتنسخ', 'Copied') : text('انسخ البيانات', 'Copy details')}</Button>
        <a className="button button-secondary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><WhatsappLogoIcon size={16} aria-hidden="true" />{text('ابعتها واتساب', 'Send on WhatsApp')}</a>
      </div>
    </div>}
  </Dialog>;
}

/** Name, role and branch of an existing account; changing the role or branch signs its devices out. */
function EditAccountDialog({ account, options, onClose }: { account: KitchenAccount | null; options: StaffOptions; onClose: () => void }) {
  const { text } = useLanguage();
  const t = useCopy();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [role, setRole] = useState<StaffRole>('KITCHEN');
  const [grants, setGrants] = useState<Permission[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: schemaResolver(editAccountSchema),
    defaultValues: { fullName: '' },
  });
  useEffect(() => {
    if (!account) return;
    reset({ fullName: account.fullName }); setError(null); setRole(account.role); setGrants(account.grants); setBranchId(account.branchId);
  }, [account, reset]);
  const movesSession = account !== null && (role !== account.role || branchId !== account.branchId);
  const onSubmit = handleSubmit(async ({ fullName }) => {
    if (!account) return;
    setError(null);
    const grantsChanged = grants.length !== account.grants.length || grants.some(grant => !account.grants.includes(grant));
    const body = {
      ...(fullName !== account.fullName && { fullName }),
      ...(role !== account.role && { role }),
      ...(grantsChanged && { permissions: grants }),
      ...(branchId !== account.branchId && { branchId }),
    };
    if (Object.keys(body).length === 0) { onClose(); return; }
    try {
      const saved = await kitchenAccountsApi.update(account.id, body);
      queryClient.setQueryData<KitchenAccount[]>(queryKeys.kitchenAccounts, list => replaceAccount(list, saved));
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches });
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffActivity });
      toast.success(movesSession ? t.team.savedSignedOut : t.team.saved);
      onClose();
    } catch (caught) {
      setError(caught);
    }
  });
  return <Dialog open={account !== null} onClose={onClose} busy={isSubmitting} onSubmit={() => void onSubmit()}
    title={fill(t.team.editTitle, { name: account?.fullName ?? '' })}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={isSubmitting}>{t.team.save}</Button>
    </>}>
    <div className="form">
      {error !== null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
      <Field label={text('الاسم', 'Name')} error={errors.fullName} required>
        <input className="input" data-autofocus maxLength={100} {...register('fullName')} />
      </Field>
      <RoleAndBranch options={options} role={role} grants={grants} branchId={branchId} onRole={setRole} onGrants={setGrants} onBranch={setBranchId} />
      <Alert kind={movesSession ? 'warning' : 'info'} live={movesSession}>{t.team.signOutWarning}</Alert>
    </div>
  </Dialog>;
}

function SetPasswordDialog({ account, onClose }: { account: KitchenAccount | null; onClose: () => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const [error, setError] = useState<unknown>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: schemaResolver(setPasswordFormSchema),
    defaultValues: { password: '', confirm: '' },
  });
  useEffect(() => { if (account) { reset(); setError(null); } }, [account, reset]);
  const onSubmit = handleSubmit(async ({ password }) => {
    if (!account) return;
    setError(null);
    try {
      await kitchenAccountsApi.setPassword(account.id, password);
      toast.success(text('اتغيرت كلمة السر، وخرّجنا الشاشات اللي كانت داخلة بالحساب.', 'Password changed; screens using the account were signed out.'));
      onClose();
    } catch (caught) {
      setError(caught);
    }
  });
  return <Dialog open={account !== null} onClose={onClose} size="small" busy={isSubmitting} onSubmit={() => void onSubmit()}
    title={text(`كلمة سر جديدة لـ «${account?.fullName ?? ''}»`, `New password for “${account?.fullName ?? ''}”`)}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={isSubmitting}>{text('احفظ', 'Save')}</Button>
    </>}>
    <div className="form">
      {error !== null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
      <Field label={text('كلمة السر الجديدة', 'New password')} error={errors.password} required hint={text('٨ حروف على الأقل.', 'At least 8 characters.')}>
        <PasswordInput data-autofocus autoComplete="new-password" {...register('password')} />
      </Field>
      <Field label={text('اكتبها تاني', 'Confirm password')} error={errors.confirm} required>
        <PasswordInput autoComplete="new-password" {...register('confirm')} />
      </Field>
    </div>
  </Dialog>;
}

const ACTIVITY_TEXT: Record<StaffAuditEntry['action'], [string, string]> = {
  'staff.created': ['عمل حساب', 'created the account of'],
  'staff.updated': ['عدّل بيانات', 'edited'],
  'staff.role_changed': ['غيّر دور', 'changed the role of'],
  'staff.permissions_changed': ['غيّر صلاحيات', 'changed the permissions of'],
  'staff.activated': ['شغّل حساب', 'turned on'],
  'staff.deactivated': ['وقّف حساب', 'turned off'],
  'staff.password_reset': ['غيّر كلمة سر', 'set a new password for'],
  'staff.pin_changed': ['غيّر الـ PIN بتاع', 'changed the POS PIN of'],
  'staff.deleted': ['مسح حساب', 'deleted'],
};

/** A role or permission list from the log, by name. */
function useAuditValue() {
  const { text } = useLanguage();
  return (value: string | null) => {
    if (!value) return text('ولا حاجة', 'none');
    return value.split(', ').map(part => {
      if (part in ROLE_LABELS) return text(...ROLE_LABELS[part as keyof typeof ROLE_LABELS]);
      if (part in PERMISSION_LABELS) return text(...PERMISSION_LABELS[part as Permission]);
      return part;
    }).join('، ');
  };
}

/** Who created, changed, turned off or removed which account, newest first. */
function StaffActivity() {
  const { text, language } = useLanguage();
  const value = useAuditValue();
  const activity = useQuery({ queryKey: queryKeys.staffActivity, queryFn: kitchenAccountsApi.activity });
  return <Section id="staff-activity-title" title={text('سجل التغييرات', 'Activity')} description={text('مين عمل أو غيّر أو وقّف حساب، وإمتى.', 'Who created, changed or turned off an account, and when.')}>
    {activity.isPending && <Skeleton height={56} />}
    {activity.isError && <ErrorPanel error={activity.error} onRetry={() => void activity.refetch()} />}
    {activity.data?.length === 0 && <p className="board-empty">{text('لسه مفيش تغييرات.', 'No changes yet.')}</p>}
    {activity.data && activity.data.length > 0 && <ul className="session-list" data-testid="staff-activity">
      {activity.data.map(entry => <li key={entry.id} className="session-row">
        <div className="session-info">
          <strong><bdi>{entry.actorName ?? text('حساب اتمسح', 'A removed account')}</bdi> {text(...ACTIVITY_TEXT[entry.action])} <bdi>{entry.targetName ?? ''}</bdi></strong>
          <small>
            {(entry.action === 'staff.role_changed' || entry.action === 'staff.permissions_changed') && <>{value(entry.from)} {text('←', '→')} {value(entry.to)}{' · '}</>}
            {formatRelative(entry.createdAt, language)}
          </small>
        </div>
      </li>)}
    </ul>}
  </Section>;
}
