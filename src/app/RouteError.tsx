import { useEffect } from 'react';
import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import { useRouteError } from 'react-router';
import { useLanguage } from '../lib/language';

const RELOADED_KEY = 'bilhanah:chunk-reload';

/** After a deploy, an open tab may request code chunks that no longer exist. */
function isStaleChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

/** Route-level error screen. Reloads automatically for stale chunks; otherwise offers a reload. */
export function RouteError() {
  const error = useRouteError();
  const { text } = useLanguage();
  const stale = isStaleChunk(error);

  useEffect(() => {
    if (!stale) { console.error(error); return; }
    // At most one automatic reload per 30 seconds, so a chunk that is really broken cannot loop.
    try {
      if (Date.now() - Number(sessionStorage.getItem(RELOADED_KEY) ?? 0) < 30_000) return;
      sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    } catch { return; }
    location.reload();
  }, [error, stale]);

  return <main className="restaurant-page">
    <div className="restaurant-card">
      <h1>{stale ? text('في نسخة جديدة من الموقع', 'A new version is available') : text('حصلت مشكلة', 'Something went wrong')}</h1>
      <p>{stale ? text('حدّث الصفحة عشان تكمل.', 'Reload the page to continue.') : text('حدّث الصفحة وجرّب تاني.', 'Please reload the page and try again.')}</p>
      <button className="button button-teal" onClick={() => location.reload()}><ArrowClockwiseIcon size={18} />{text('تحديث الصفحة', 'Reload page')}</button>
    </div>
  </main>;
}
