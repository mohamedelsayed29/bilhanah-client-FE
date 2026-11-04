import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import type { Permission } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { useWorkspace } from '../../features/branches/workspace';
import { useLanguage } from '../../lib/language';

/** Navigation state set when a page was refused, so the page landed on can say why. */
type DeniedState = { denied?: string };

/**
 * Pages that need a permission (any one of `any`). Without it the viewer is sent to the first page
 * they may open, which explains that the other one is not theirs. The API refuses the same requests
 * on its own: this only keeps the screen honest.
 */
export function Allow({ any }: { any: Permission[] }) {
  const workspace = useWorkspace();
  const { pathname } = useLocation();
  if (any.some(workspace.can)) return <Outlet />;
  return <Navigate to={workspace.home} replace state={{ denied: pathname } satisfies DeniedState} />;
}

/** Shown at the top of a page reached after a refused one. */
export function DeniedNotice() {
  const { text } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const denied = (location.state as DeniedState | null)?.denied;
  if (!denied) return null;
  return <div className="denied-notice" data-testid="access-denied">
    <Alert kind="warning" title={text('مش مسموح لك تفتح الصفحة دي', 'You do not have access to that page')}
      actions={<button type="button" className="button button-ghost button-small" onClick={() => void navigate(`${location.pathname}${location.search}`, { replace: true, state: null })}>{text('تمام', 'OK')}</button>}>
      {text('مش ضمن صلاحيات دورك، فرجعناك هنا. لو محتاجها كلّم صاحب المطعم أو المدير.', 'It is not part of your role, so we brought you here. Ask the owner or a manager if you need it.')}
    </Alert>
  </div>;
}
