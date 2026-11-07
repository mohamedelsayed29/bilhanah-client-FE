import { lazy, Suspense, useEffect, useState } from 'react';
import { CaretLeftIcon, CoinsIcon } from '@phosphor-icons/react';
import type { LoyaltyMemberView } from '@bilhanah/contracts';
import { useLanguage } from '../../lib/language';
import { ApiError, fetchMember } from './loyalty-api';
import { savePass, takeCardFromAddress, usePass, useProgram } from './loyalty-store';
import './loyalty.css';

const LoyaltySheet = lazy(() => import('./LoyaltySheet').then(module => ({ default: module.LoyaltySheet })));

/**
 * On the menu, under the restaurant's header: the diner's balance with a member card, or what the
 * program offers without one. Opens the member's sheet; a card link from the restaurant
 * (`/loyalty#card=…`) is saved and opens it too.
 */
export function LoyaltyEntry({ subdomain, restaurantName }: { subdomain: string; restaurantName: string }) {
  const { text, number } = useLanguage();
  const program = useProgram(subdomain);
  const pass = usePass(subdomain);
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState<LoyaltyMemberView | null>(null);
  useEffect(() => { if (takeCardFromAddress(subdomain).open) setOpen(true); }, [subdomain]);
  useEffect(() => {
    if (!program || !pass) { setMember(null); return; }
    const controller = new AbortController();
    fetchMember(subdomain, pass, controller.signal).then(setMember).catch((error: unknown) => {
      // A replaced card is forgotten; the sheet then offers to join or ask for a new one.
      if (error instanceof ApiError && error.code === 'LOYALTY_PASS_INVALID') savePass(subdomain, null);
    });
    return () => controller.abort();
  }, [subdomain, program, pass, open]);
  if (!program) return null;
  const rate = text(`${number(program.pointsPerUnit)} نقطة لكل ${number(program.spendUnitPiastres / 100)} ج.م`, `${program.pointsPerUnit} pt per ${program.spendUnitPiastres / 100} EGP`);
  return <>
    <button type="button" className="loyalty-entry" onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid="loyalty-entry">
      <span className="loyalty-entry-icon" aria-hidden="true"><CoinsIcon size={20} weight="fill" /></span>
      {member
        ? <span>{text('رصيد نقاطك', 'Your points')}: <strong data-testid="loyalty-entry-balance">{number(member.member.balance)}</strong><small>{member.rewards.some(reward => reward.available) ? text('عندك مكافأة تقدر تستخدمها', 'You have a reward to use') : text('شوف المكافآت', 'See rewards')}</small></span>
        : <span>{text('اجمع نقاط مع كل طلب', 'Earn points on every order')}<small>{rate}</small></span>}
      <CaretLeftIcon size={16} className="directional-arrow" aria-hidden="true" />
    </button>
    {open && <Suspense fallback={null}><LoyaltySheet subdomain={subdomain} restaurantName={restaurantName} program={program} onClose={() => setOpen(false)} /></Suspense>}
  </>;
}
