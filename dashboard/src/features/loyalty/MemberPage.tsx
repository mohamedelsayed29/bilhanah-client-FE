import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeftIcon, ArrowRightIcon, CoinsIcon, CrownIcon, HourglassMediumIcon, IdentificationCardIcon, PlusMinusIcon, ReceiptIcon } from '@phosphor-icons/react';
import type { LoyaltyCardLink, LoyaltyMemberDetail } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CopyButton } from '../../components/CopyButton';
import { Dialog } from '../../components/Dialog';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Field } from '../../components/Field';
import { Section } from '../../components/Section';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { loyaltyApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { normalizeDigits } from '../../lib/format';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useWorkspace } from '../branches/workspace';
import { KIND_TONES, loyaltyKeys, useLoyaltyFormat } from './shared';

/** One member: balance, tier, expiry, every points change with its reason and order, and the staff tools. */
export function LoyaltyMemberPage() {
  const { memberId = '' } = useParams();
  const { text, language } = useLanguage();
  const { can, to } = useWorkspace();
  const detail = useQuery({ queryKey: loyaltyKeys.member(memberId), queryFn: () => loyaltyApi.member(memberId) });
  usePageTitle(detail.data ? `${detail.data.member.name} · برنامج الولاء` : 'عضو', detail.data ? `${detail.data.member.name} · Loyalty` : 'Member');
  const [adjusting, setAdjusting] = useState(false);
  const [card, setCard] = useState(false);
  const Back = language === 'ar' ? ArrowRightIcon : ArrowLeftIcon;
  return <div className="ly-member" data-testid="ly-member-page">
    <Link className="ly-back" to={to('/loyalty/members')}><Back size={16} aria-hidden="true" />{text('كل الأعضاء', 'All members')}</Link>
    {detail.isError && <ErrorPanel error={detail.error} onRetry={() => void detail.refetch()} />}
    {detail.isPending && <Skeleton height={260} />}
    {detail.data && <>
      <MemberCard detail={detail.data} actions={<>
        {can('loyalty.adjust') && <Button small variant="secondary" icon={<PlusMinusIcon size={16} aria-hidden="true" />} onClick={() => setAdjusting(true)} data-testid="ly-adjust-open">{text('عدّل النقاط', 'Adjust points')}</Button>}
        {can('loyalty.adjust') && <Button small variant="secondary" icon={<IdentificationCardIcon size={16} aria-hidden="true" />} onClick={() => setCard(true)} data-testid="ly-card-open">{text('كارت العضوية', 'Member card')}</Button>}
      </>} />
      <History detail={detail.data} />
      <AdjustDialog open={adjusting} onClose={() => setAdjusting(false)} detail={detail.data} />
      <CardDialog open={card} onClose={() => setCard(false)} memberId={memberId} name={detail.data.member.name} />
    </>}
  </div>;
}

function MemberCard({ detail, actions }: { detail: LoyaltyMemberDetail; actions: React.ReactNode }) {
  const { text, number } = useLanguage();
  const format = useLoyaltyFormat();
  const { member } = detail;
  const progress = member.nextTier ? Math.min(100, ((member.lifetimePoints - (member.tier?.minLifetimePoints ?? 0)) / Math.max(1, member.nextTier.minLifetimePoints - (member.tier?.minLifetimePoints ?? 0))) * 100) : 100;
  return <section className="card ly-member-card" aria-labelledby="ly-member-name">
    <header className="ly-member-head">
      <span className="ly-avatar" aria-hidden="true">{member.name.trim().charAt(0)}</span>
      <div>
        <h2 id="ly-member-name">{member.name}</h2>
        <p className="muted"><bdi className="ltr">{member.phone}</bdi> · {text(`عضو من ${format.date(member.joinedAt)}`, `Member since ${format.date(member.joinedAt)}`)}</p>
      </div>
      {member.tier && <span className="badge badge-guava ly-tier-badge"><CrownIcon size={14} weight="fill" aria-hidden="true" />{format.name(member.tier.nameAr, member.tier.nameEn)}</span>}
      <div className="ly-member-actions">{actions}</div>
    </header>
    <dl className="ly-member-figures">
      <div className="is-primary"><dt><CoinsIcon size={16} aria-hidden="true" />{text('الرصيد', 'Balance')}</dt><dd data-testid="ly-member-balance">{number(member.balance)}</dd></div>
      <div><dt>{text('نقاط اتكسبت', 'Earned to date')}</dt><dd>{number(member.lifetimePoints)}</dd></div>
      <div><dt><ReceiptIcon size={16} aria-hidden="true" />{text('طلبات مكتملة', 'Completed orders')}</dt><dd>{number(detail.orders)}</dd></div>
      <div><dt>{text('صرف', 'Spent')}</dt><dd>{format.money(detail.spentPiastres)}</dd></div>
    </dl>
    {(member.nextTier || member.expiresAt) && <div className="ly-member-foot">
      {member.nextTier && <div className="ly-progress">
        <span>{text(`فاضل ${number(member.nextTier.pointsToGo)} نقطة للوصول لـ «${format.name(member.nextTier.nameAr, member.nextTier.nameEn)}»`, `${member.nextTier.pointsToGo} points to “${format.name(member.nextTier.nameAr, member.nextTier.nameEn)}”`)}</span>
        <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${progress}%` }} /></span>
      </div>}
      {member.expiresAt && <p className="ly-expiry"><HourglassMediumIcon size={16} aria-hidden="true" />{text(`الرصيد هينتهي ${format.date(member.expiresAt)} لو مفيش طلب قبلها`, `The balance expires on ${format.date(member.expiresAt)} without activity`)}</p>}
    </div>}
  </section>;
}

function History({ detail }: { detail: LoyaltyMemberDetail }) {
  const { text, number } = useLanguage();
  const format = useLoyaltyFormat();
  return <Section id="ly-history" title={text('سجل النقاط', 'Points history')} description={text('كل تغيير في الرصيد، بالسبب والطلب ومين عمله.', 'Every change to the balance, with its reason, order and who made it.')}>
    {detail.history.length === 0
      ? <p className="muted empty-line">{text('لسه مفيش حركة على النقاط.', 'No points activity yet.')}</p>
      : <div className="table-scroll"><table className="data-table ly-table" data-testid="ly-history">
        <caption className="visually-hidden">{text('سجل النقاط', 'Points history')}</caption>
        <thead><tr>
          <th scope="col">{text('الحركة', 'Change')}</th>
          <th scope="col">{text('السبب', 'Reason')}</th>
          <th scope="col" className="num">{text('النقاط', 'Points')}</th>
          <th scope="col" className="num">{text('الرصيد بعدها', 'Balance after')}</th>
          <th scope="col">{text('الوقت', 'When')}</th>
        </tr></thead>
        <tbody>{detail.history.map(entry => <tr key={entry.id} data-kind={entry.kind}>
          <td><span className={`badge ${KIND_TONES[entry.kind]}`}>{format.kind(entry.kind)}</span></td>
          <td className="ly-reason">
            {entry.order ? <span>{text(`طلب #${entry.order.number}`, `Order #${entry.order.number}`)} · {entry.order.branchName}</span> : <span>{entry.reason}</span>}
            {entry.rewardName && <small>{entry.rewardName}</small>}
            {entry.kind === 'ADJUST' && entry.actorName && <small>{text(`بواسطة ${entry.actorName}`, `By ${entry.actorName}`)}</small>}
          </td>
          <td className={`num ly-points ${entry.points > 0 ? 'is-up' : 'is-down'}`}><bdi>{format.signed(entry.points)}</bdi></td>
          <td className="num">{number(entry.balanceAfter)}</td>
          <td><span title={format.dateTime(entry.createdAt)}>{format.dateTime(entry.createdAt)}</span></td>
        </tr>)}</tbody>
      </table></div>}
  </Section>;
}

function AdjustDialog({ open, onClose, detail }: { open: boolean; onClose: () => void; detail: LoyaltyMemberDetail }) {
  const { text, number } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const points = Number.parseInt(normalizeDigits(amount), 10);
  const valid = Number.isFinite(points) && points > 0 && points <= 100_000 && reason.trim().length >= 3 && (direction === 'add' || points <= detail.member.balance);
  const save = useMutation({
    mutationFn: () => loyaltyApi.adjust(detail.member.id, { points: direction === 'add' ? points : -points, reason: reason.trim() }),
    onSuccess: next => {
      queryClient.setQueryData(loyaltyKeys.member(detail.member.id), next);
      void queryClient.invalidateQueries({ queryKey: ['loyalty', 'members'] });
      void queryClient.invalidateQueries({ queryKey: ['loyalty', 'analytics'] });
      toast.success(text('النقاط اتعدّلت', 'Points adjusted'));
      setAmount(''); setReason(''); onClose();
    },
    onError: failure => toast.error(errorMessage(failure, text)),
  });
  return <Dialog open={open} onClose={onClose} size="small" title={text('عدّل النقاط', 'Adjust points')} busy={save.isPending}
    onSubmit={() => { if (valid) save.mutate(); }}
    footer={<><Button variant="secondary" onClick={onClose}>{text('إلغاء', 'Cancel')}</Button><Button type="submit" loading={save.isPending} disabled={!valid} data-testid="ly-adjust-save">{text('سجّل التعديل', 'Record adjustment')}</Button></>}>
    <p className="muted">{text(`الرصيد دلوقتي ${number(detail.member.balance)} نقطة. التعديل بيتسجل في السجل بالسبب واسمك.`, `The balance is ${detail.member.balance} points. The change is recorded with your reason and name.`)}</p>
    <div className="segmented" role="radiogroup" aria-label={text('نوع التعديل', 'Adjustment')}>
      <label><input type="radio" name="ly-direction" checked={direction === 'add'} onChange={() => setDirection('add')} />{text('إضافة نقاط', 'Add points')}</label>
      <label><input type="radio" name="ly-direction" checked={direction === 'remove'} onChange={() => setDirection('remove')} />{text('خصم نقاط', 'Remove points')}</label>
    </div>
    <Field label={text('عدد النقاط', 'Points')} error={direction === 'remove' && points > detail.member.balance ? { message: text('أكتر من الرصيد', 'More than the balance') } : undefined}>
      {props => <input {...props} className="input ltr" inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value)} data-testid="ly-adjust-points" />}
    </Field>
    <Field label={text('السبب', 'Reason')} hint={text('مثلًا: هدية عيد ميلاد، تعويض عن طلب متأخر.', 'For example: birthday gift, apology for a late order.')}>
      {props => <input {...props} className="input" maxLength={200} value={reason} onChange={event => setReason(event.target.value)} data-testid="ly-adjust-reason" />}
    </Field>
  </Dialog>;
}

/** A new member card: a link and QR code the diner opens on their phone. Any older card stops working. */
function CardDialog({ open, onClose, memberId, name }: { open: boolean; onClose: () => void; memberId: string; name: string }) {
  const { text } = useLanguage();
  const toast = useToast();
  const [link, setLink] = useState<LoyaltyCardLink | null>(null);
  const issue = useMutation({ mutationFn: () => loyaltyApi.issueCard(memberId), onSuccess: setLink, onError: failure => toast.error(errorMessage(failure, text)) });
  const close = () => { setLink(null); onClose(); };
  return <Dialog open={open} onClose={close} title={text('كارت العضوية', 'Member card')} busy={issue.isPending}
    footer={link ? <Button onClick={close}>{text('تمام', 'Done')}</Button> : <><Button variant="secondary" onClick={close}>{text('إلغاء', 'Cancel')}</Button><Button loading={issue.isPending} onClick={() => issue.mutate()} data-testid="ly-card-issue">{text('اعمل كارت جديد', 'Issue a new card')}</Button></>}>
    {!link ? <>
      <p>{text(`الكارت بيخلّي ${name} يشوف نقاطه ويستبدلها من موبايله. اعمله لما يغيّر موبايله أو يمسح بيانات المتصفح.`, `The card lets ${name} see and redeem their points on their phone. Issue one when they change phones or clear their browser.`)}</p>
      <Alert kind="warning">{text('اتأكد إن ده صاحب الرقم فعلًا. الكارت الجديد بيوقّف أي كارت قديم.', 'Make sure this is the phone’s owner. A new card stops any older one.')}</Alert>
    </> : <div className="ly-card-link" data-testid="ly-card-link">
      <p>{text('خلّي الزبون يصوّر الكود بكاميرا موبايله، أو ابعتله اللينك.', 'Have the diner scan the code with their phone camera, or send them the link.')}</p>
      <div className="ly-qr"><QRCodeSVG value={link.url} size={220} level="M" marginSize={2} /></div>
      <div className="ly-card-url"><code className="ltr">{link.url}</code><CopyButton value={link.url} label={text('انسخ اللينك', 'Copy link')} copiedMessage={text('اتنسخ', 'Copied')} /></div>
    </div>}
  </Dialog>;
}
