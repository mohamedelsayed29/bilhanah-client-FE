import { useLanguage } from '../../../lib/language';
import { useOrdersLive } from '../orders/live';

/** Table service requests still waiting on the staff, on the navigation item. */
export function ServiceRequestsCount({ testId = 'service-open-count' }: { testId?: string }) {
  const { number, text } = useLanguage();
  const { serviceOpen } = useOrdersLive();
  if (serviceOpen <= 0) return null;
  return <span className="nav-count" data-testid={testId}>
    <span aria-hidden="true">{number(serviceOpen)}</span>
    <span className="visually-hidden">({text(`${number(serviceOpen)} مستني`, `${serviceOpen} waiting`)})</span>
  </span>;
}
