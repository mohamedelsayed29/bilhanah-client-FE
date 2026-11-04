import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ArrowClockwiseIcon, SmileySadIcon } from '@phosphor-icons/react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useLanguage } from '../lib/language';
import { Button } from './Button';

type Props = { children: ReactNode; onReset?: () => void; resetKey?: unknown };
type State = { error: Error | null };

class Boundary extends Component<Props & { fallback: (error: Error, reset: () => void) => ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }
  componentDidUpdate(previous: Props) {
    // Navigating elsewhere clears the error.
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  reset = () => { this.props.onReset?.(); this.setState({ error: null }); };
  render() { return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children; }
}

/** Per-route error boundary: shows a friendly message and retries (including failed queries). */
export function ErrorBoundary({ children, resetKey }: { children: ReactNode; resetKey?: unknown }) {
  const { reset } = useQueryErrorResetBoundary();
  return <Boundary onReset={reset} resetKey={resetKey} fallback={(error, retry) => <ErrorPanel error={error} onRetry={retry} />}>{children}</Boundary>;
}

export function ErrorPanel({ error, onRetry }: { error?: unknown; onRetry: () => void }) {
  const { text } = useLanguage();
  return <div className="card route-error" role="alert">
    <span className="empty-state-icon" aria-hidden="true"><SmileySadIcon size={30} /></span>
    <h2>{text('حصلت مشكلة في عرض الصفحة دي', 'Something went wrong on this page')}</h2>
    <p>{text('جرّب تاني. لو المشكلة فضلت، حدّث الصفحة أو تواصل معانا.', 'Please try again. If it keeps happening, reload the page or contact us.')}</p>
    {import.meta.env.DEV && error instanceof Error && <code>{error.message}</code>}
    <Button onClick={onRetry} icon={<ArrowClockwiseIcon size={18} />}>{text('حاول تاني', 'Try again')}</Button>
  </div>;
}

/** Router-level fallback (errors outside a page boundary). */
export function RouteErrorPage() {
  const error = useRouteError();
  const { text } = useLanguage();
  const status = isRouteErrorResponse(error) ? error.status : null;
  return <main className="state-page">
    <div className="state-card">
      <span className="state-code">{status ?? ':('}</span>
      <h1>{text('حصلت مشكلة غير متوقعة', 'Something unexpected happened')}</h1>
      <p>{text('حدّث الصفحة وجرّب تاني.', 'Reload the page and try again.')}</p>
      <div className="form-actions"><Button onClick={() => location.reload()} icon={<ArrowClockwiseIcon size={18} />}>{text('حدّث الصفحة', 'Reload')}</Button></div>
    </div>
  </main>;
}
