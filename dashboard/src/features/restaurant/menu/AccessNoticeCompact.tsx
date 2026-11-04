import type { RestaurantAccess } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { useLanguage } from '../../../lib/language';

/** Reminds the owner that edits are saved but the public menu is paused. */
export function AccessNoticeCompact({ access }: { access: RestaurantAccess }) {
  const { text } = useLanguage();
  if (access.status !== 'INACTIVE') return null;
  return <Alert kind="warning" live={false}>{text('المنيو العام متوقف لحد ما الاشتراك يتفعّل. التعديلات بتتحفظ وهتظهر أول ما يرجع.', 'Your public menu is paused until your subscription is active. Your edits are saved and will appear once it is.')}</Alert>;
}
