import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyIcon, PlusIcon, UserCircleIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { ROLE_LABELS, type Employee, type RestaurantRole } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { attendanceApi, kitchenAccountsApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useBranchScope } from '../branches/BranchScope';
import { useBranchList, useWorkspace } from '../branches/workspace';
import { queryKeys } from '../restaurant/queries';
import { attendanceKeys, useEmployeesQuery } from './shared';

/** Everyone whose attendance is tracked: with or without a dashboard account, each with a number and a kiosk PIN. */
export function AttendanceEmployeesPage() {
  const { text } = useLanguage();
  usePageTitle('الموظفين', 'Employees');
  const { can } = useWorkspace();
  const scope = useBranchScope();
  const employees = useEmployeesQuery();
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const [pinFor, setPinFor] = useState<Employee | null>(null);
  const shown = (employees.data ?? []).filter(employee => scope.selected === 'all' || employee.branchId === scope.selected);
  const manage = can('attendance.manage');
  return <>
    <div className="att-actions">
      <p className="list-count">{text(`${shown.length} موظف`, `${shown.length} employees`)}</p>
      <span className="att-actions-spacer" />
      {manage && <Button small onClick={() => setEditing('new')} icon={<PlusIcon size={16} weight="bold" aria-hidden="true" />}>{text('موظف جديد', 'New employee')}</Button>}
    </div>
    <section className="card list-card" aria-labelledby="att-employees-title">
      <h2 id="att-employees-title" className="visually-hidden">{text('الموظفين', 'Employees')}</h2>
      {employees.isError && <ErrorPanel error={employees.error} onRetry={() => void employees.refetch()} />}
      {employees.isPending && <div className="table-skeleton">{[0, 1, 2].map(index => <Skeleton key={index} height={52} />)}</div>}
      {employees.data && shown.length === 0 && <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><UsersThreeIcon size={30} /></span>
        <h2>{text('لسه مفيش موظفين', 'No employees yet')}</h2>
        <p>{text('ضيف كل اللي بيشتغلوا في الفرع، حتى اللي ملهمش حساب دخول: هيسجّلوا حضورهم بالكشك برقمهم والـ PIN.', 'Add everyone who works at the branch, even those without a sign-in: they check in at the kiosk with their number and PIN.')}</p>
        {manage && <Button onClick={() => setEditing('new')}>{text('ضيف أول موظف', 'Add the first employee')}</Button>}
      </div>}
      {shown.length > 0 && <div className="table-scroll"><table className="data-table att-table">
        <thead><tr>
          <th scope="col">{text('الموظف', 'Employee')}</th>
          <th scope="col">{text('الفرع', 'Branch')}</th>
          <th scope="col">{text('حساب الدخول', 'Sign-in account')}</th>
          <th scope="col">{text('PIN الكشك', 'Kiosk PIN')}</th>
          <th scope="col">{text('الحالة', 'Status')}</th>
          {manage && <th scope="col"><span className="visually-hidden">{text('إجراءات', 'Actions')}</span></th>}
        </tr></thead>
        <tbody>{shown.map(employee => <tr key={employee.id} data-testid="employee-row">
          <td className="cell-primary" data-label={text('الموظف', 'Employee')}><bdi>{employee.fullName}</bdi><small><span className="ltr">#{employee.employeeNumber}</span>{employee.jobTitle ? ` · ${employee.jobTitle}` : ''}</small></td>
          <td data-label={text('الفرع', 'Branch')}><bdi>{employee.branchName}</bdi></td>
          <td data-label={text('حساب الدخول', 'Sign-in account')}>{employee.account
            ? <><bdi>{employee.account.name}</bdi><small>{employee.account.role in ROLE_LABELS ? text(...ROLE_LABELS[employee.account.role as RestaurantRole]) : employee.account.role}</small></>
            : <span className="muted">{text('من غير حساب (كشك بس)', 'None (kiosk only)')}</span>}</td>
          <td data-label={text('PIN الكشك', 'Kiosk PIN')}>{!employee.hasPin ? <span className="badge badge-muted">{text('مش متحدد', 'Not set')}</span>
            : employee.pinMustChange ? <span className="badge badge-warning">{text('لازم يتغيّر', 'Must change')}</span> : <span className="badge badge-success">{text('متحدد', 'Set')}</span>}</td>
          <td data-label={text('الحالة', 'Status')} className="cell-end">{employee.isActive ? <span className="badge badge-success">{text('شغال', 'Active')}</span> : <span className="badge badge-muted">{text('موقوف', 'Inactive')}</span>}</td>
          {manage && <td className="cell-action-inline">
            <Button small variant="ghost" onClick={() => setEditing(employee)}>{text('تعديل', 'Edit')}</Button>
            <Button small variant="ghost" onClick={() => setPinFor(employee)} icon={<KeyIcon size={15} aria-hidden="true" />}>{text('PIN جديد', 'New PIN')}</Button>
          </td>}
        </tr>)}</tbody>
      </table></div>}
    </section>
    <EmployeeDialog employee={editing} onClose={() => setEditing(null)} />
    <PinDialog employee={pinFor} onClose={() => setPinFor(null)} />
  </>;
}

function EmployeeDialog({ employee, onClose }: { employee: Employee | 'new' | null; onClose: () => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useWorkspace();
  const scope = useBranchScope();
  const branches = useBranchList().branches.filter(branch => branch.isActive);
  const accounts = useQuery({ queryKey: queryKeys.kitchenAccounts, queryFn: kitchenAccountsApi.list, enabled: employee !== null && can('staff.view') });
  const linked = new Set((queryClient.getQueryData<Employee[]>(attendanceKeys.employees) ?? []).filter(entry => entry !== employee && entry.account).map(entry => entry.account!.id));
  const [form, setForm] = useState({ fullName: '', branchId: '', jobTitle: '', phone: '', employeeNumber: '', userId: '', isActive: true });
  useEffect(() => {
    if (!employee) return;
    setForm(employee === 'new'
      ? { fullName: '', branchId: scope.selected !== 'all' ? scope.selected : branches[0]?.id ?? '', jobTitle: '', phone: '', employeeNumber: '', userId: '', isActive: true }
      : { fullName: employee.fullName, branchId: employee.branchId, jobTitle: employee.jobTitle ?? '', phone: employee.phone ?? '', employeeNumber: employee.employeeNumber, userId: employee.account?.id ?? '', isActive: employee.isActive });
  }, [employee]);
  const set = (changes: Partial<typeof form>) => setForm(current => ({ ...current, ...changes }));
  const save = useMutation({
    mutationFn: () => {
      const body = { fullName: form.fullName.trim(), branchId: form.branchId, jobTitle: form.jobTitle.trim() || null, phone: form.phone.trim() || null, userId: form.userId || null, ...(form.employeeNumber.trim() && { employeeNumber: form.employeeNumber.trim() }) };
      return employee === 'new' ? attendanceApi.createEmployee(body) : attendanceApi.updateEmployee(employee!.id, { ...body, isActive: form.isActive });
    },
    onSuccess: saved => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
      toast.success(text(`اتحفظ «${saved.fullName}» برقم ${saved.employeeNumber}`, `Saved “${saved.fullName}” as #${saved.employeeNumber}`));
      onClose();
    },
  });
  const valid = form.fullName.trim().length >= 2 && form.branchId;
  return <Dialog open={employee !== null} onClose={onClose} busy={save.isPending} onSubmit={() => { if (valid) save.mutate(); }}
    title={employee === 'new' ? text('موظف جديد', 'New employee') : text('تعديل الموظف', 'Edit employee')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={save.isPending} disabled={!valid}>{text('احفظ', 'Save')}</Button>
    </>}>
    <div className="form">
      {save.isError && <Alert kind="error">{errorMessage(save.error, text)}</Alert>}
      <div className="form-grid">
        <Field label={text('الاسم', 'Name')} required><input className="input" data-autofocus maxLength={100} value={form.fullName} onChange={event => set({ fullName: event.target.value })} /></Field>
        <Field label={text('الوظيفة', 'Job title')}><input className="input" maxLength={60} value={form.jobTitle} onChange={event => set({ jobTitle: event.target.value })} placeholder={text('مثلًا: شيف، ويتر، نظافة', 'e.g. Chef, waiter, cleaning')} /></Field>
        <Field label={text('الفرع', 'Branch')} required>
          <select className="select" value={form.branchId} onChange={event => set({ branchId: event.target.value })}>
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </Field>
        <Field label={text('رقم الموظف', 'Employee number')} hint={employee === 'new' ? text('سيبه فاضي ونديله رقم.', 'Leave empty for the next number.') : text('بيكتبه في الكشك.', 'Typed at the kiosk.')}>
          <input className="input ltr-input" dir="ltr" maxLength={12} value={form.employeeNumber} onChange={event => set({ employeeNumber: event.target.value })} />
        </Field>
        <Field label={text('الموبايل', 'Phone')}><input className="input ltr-input" dir="ltr" type="tel" maxLength={20} value={form.phone} onChange={event => set({ phone: event.target.value })} /></Field>
        <Field label={text('حساب الدخول', 'Sign-in account')} hint={text('اربطه بحساب موظف عشان يسجّل حضوره من موبايله (البوابة والـ QR).', 'Link a staff account to check in from their phone (portal and QR).')}>
          <select className="select" value={form.userId} onChange={event => set({ userId: event.target.value })} disabled={!accounts.data}>
            <option value="">{text('من غير حساب', 'No account')}</option>
            {accounts.data?.filter(account => !linked.has(account.id)).map(account => <option key={account.id} value={account.id}>{account.fullName} · {text(...ROLE_LABELS[account.role])}</option>)}
          </select>
        </Field>
      </div>
      {employee !== 'new' && <Switch checked={form.isActive} onChange={value => set({ isActive: value })} label={text('الموظف شغال', 'Active')}
        description={form.isActive ? undefined : text('مش هيقدر يسجّل حضور، وسجلاته القديمة بتفضل زي ما هي.', 'Cannot check in; past records stay as they are.')} />}
    </div>
  </Dialog>;
}

/** A new PIN, shown once here and never again (it is stored hashed). */
function PinDialog({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { text } = useLanguage();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState<string | null>(null);
  useEffect(() => setPin(null), [employee]);
  const reset = useMutation({
    mutationFn: () => attendanceApi.resetPin(employee!.id),
    onSuccess: result => { setPin(result.pin); void queryClient.invalidateQueries({ queryKey: attendanceKeys.employees }); },
  });
  return <Dialog open={employee !== null} onClose={onClose} size="small" busy={reset.isPending}
    title={text(`PIN جديد لـ «${employee?.fullName ?? ''}»`, `New PIN for “${employee?.fullName ?? ''}”`)}
    footer={pin ? <Button onClick={onClose}>{text('تمام، اتسجّل', 'Done, noted')}</Button> : <>
      <Button variant="secondary" onClick={onClose}>{text('إلغاء', 'Cancel')}</Button>
      <Button loading={reset.isPending} onClick={() => reset.mutate()} icon={<KeyIcon size={16} aria-hidden="true" />}>{text('اعمل PIN جديد', 'Create a new PIN')}</Button>
    </>}>
    <div className="form">
      {reset.isError && <Alert kind="error">{errorMessage(reset.error, text)}</Alert>}
      {!pin ? <p className="field-hint">{text('الـ PIN القديم هيبطل. الجديد هيظهر مرة واحدة بس، والموظف هيغيّره أول مرة يستخدمه.', 'The old PIN stops working. The new one shows once only, and the employee changes it on first use.')}</p>
        : <div className="pin-reveal" data-testid="pin-reveal">
          <UserCircleIcon size={22} aria-hidden="true" />
          <span>{text(`رقم الموظف ${employee?.employeeNumber ?? ''} · PIN`, `Employee #${employee?.employeeNumber ?? ''} · PIN`)}</span>
          <strong className="ltr">{pin}</strong>
          <small>{text('ادّيه للموظف دلوقتي؛ مش هيظهر تاني.', 'Give it to the employee now; it will not show again.')}</small>
        </div>}
    </div>
  </Dialog>;
}
