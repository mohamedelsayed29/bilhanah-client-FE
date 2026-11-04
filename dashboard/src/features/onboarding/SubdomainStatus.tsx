import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { normalizeSubdomain, subdomainProblem } from '@bilhanah/contracts';
import { restaurantApi } from '../../lib/api/endpoints';
import { useLanguage } from '../../lib/language';
import { useDebounced } from '../../lib/use-debounced';
import { queryKeys } from '../restaurant/queries';

export type SubdomainCheck = { state: 'empty' | 'checking' | 'available' | 'unavailable' | 'unknown'; reason?: 'INVALID' | 'RESERVED' | 'TAKEN' };

/** Live, debounced availability of a subdomain: format and reserved names locally, then the API. */
export function useSubdomainCheck(raw: string): SubdomainCheck {
  const value = normalizeSubdomain(raw);
  const debounced = useDebounced(value, 400);
  const localProblem = value ? subdomainProblem(value) : null;
  const query = useQuery({
    queryKey: queryKeys.subdomain(debounced),
    queryFn: ({ signal }) => restaurantApi.subdomainAvailability(debounced, signal),
    enabled: !!debounced && !subdomainProblem(debounced),
    staleTime: 10_000,
    retry: false,
  });
  if (!value) return { state: 'empty' };
  if (localProblem) return { state: 'unavailable', reason: localProblem };
  if (debounced !== value || query.isPending) return { state: 'checking' };
  if (query.isError) return { state: 'unknown' };
  return query.data.available ? { state: 'available' } : { state: 'unavailable', reason: query.data.reason };
}

export function SubdomainStatus({ check, id }: { check: SubdomainCheck; id: string }) {
  const { text } = useLanguage();
  const reasons = {
    INVALID: text('استخدم من ٣ لـ ٤٠ حرف إنجليزي صغير أو رقم، وشرطة واحدة بينهم.', 'Use 3–40 lowercase letters, digits and single hyphens.'),
    RESERVED: text('العنوان ده محجوز للمنصة. اختار عنوان تاني.', 'This address is reserved. Please choose another.'),
    TAKEN: text('العنوان ده مستخدم لمطعم تاني.', 'Another restaurant already uses this address.'),
  };
  return <p id={id} className={`subdomain-status subdomain-${check.state}`} aria-live="polite">
    {check.state === 'checking' && <><span className="spinner" aria-hidden="true" />{text('بنتأكد إنه متاح…', 'Checking availability…')}</>}
    {check.state === 'available' && <><CheckCircleIcon size={17} weight="fill" aria-hidden="true" />{text('متاح! العنوان ده ليك.', 'Available! This address can be yours.')}</>}
    {check.state === 'unavailable' && check.reason && <><WarningCircleIcon size={17} weight="fill" aria-hidden="true" />{reasons[check.reason]}</>}
    {check.state === 'unknown' && text('مقدرناش نتأكد دلوقتي. هنتأكد لما تحفظ.', 'We couldn’t check right now; we will check when you save.')}
    {check.state === 'empty' && text('حروف إنجليزي صغيرة وأرقام وشرطة (-). مينفعش يتغير بعدين.', 'Lowercase English letters, digits and hyphens. It can’t be changed later.')}
  </p>;
}
