import { Link } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRightIcon, PrinterIcon, TableIcon } from '@phosphor-icons/react';
import type { RestaurantTable } from '@bilhanah/contracts';
import { Button } from '../../../components/Button';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { PageHeader } from '../../../components/PageHeader';
import { PageSkeleton } from '../../../components/Skeleton';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { usePageBranch } from '../../branches/BranchScope';
import { useOwnerBranch, useWorkspace } from '../../branches/workspace';
import { useTablesQuery } from '../queries';

/** Six cards per A4 sheet (2 × 3), each about 9 × 9 cm with a 5 cm code. */
const PER_SHEET = 6;

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
}

/** One QR card per active table, laid out for A4; the app chrome is hidden when printing. */
export function TablesPrintPage() {
  const { text, number, count } = useLanguage();
  usePageTitle('اطبع أكواد الطاولات', 'Print table QR codes');
  const { restaurant, to } = useWorkspace();
  const { branchId } = usePageBranch();
  const branch = useOwnerBranch(branchId);
  const tables = useTablesQuery(branchId);
  if (tables.isPending) return <PageSkeleton blocks={2} />;
  if (tables.isError) return <div className="page"><ErrorPanel error={tables.error} onRetry={() => void tables.refetch()} /></div>;
  const active = tables.data.filter(table => table.isActive);
  const sheets = chunk<RestaurantTable>(active, PER_SHEET);
  const logo = restaurant.logoUrl;
  // The branch's own link (the main branch's is the restaurant's), as printed under each code.
  const host = (branch?.publicUrl ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const accent = restaurant.brandColor ?? '#075e54';

  return <div className="page print-page">
    <div className="print-hide back-row">
      <Link to={`${to('/tables')}${branchId ? `?branch=${branchId}` : ''}`} className="back-link"><ArrowRightIcon size={16} className="directional" aria-hidden="true" />{text('الطاولات', 'Tables')}</Link>
    </div>
    <div className="print-hide">
      <PageHeader title={text('اطبع أكواد الطاولات', 'Print table QR codes')}
        description={active.length > 0
          ? text(`${count(active.length, 'card')} للطاولات الشغالة، ${number(PER_SHEET)} في كل ورقة A4. قص على الخط المنقط.`, `${count(active.length, 'card')} for your active tables, ${PER_SHEET} per A4 sheet. Cut along the dotted lines.`)
          : undefined}
        actions={active.length > 0 ? <Button onClick={() => window.print()} icon={<PrinterIcon size={18} aria-hidden="true" />}>{text('اطبع', 'Print')}</Button> : undefined} />
    </div>
    {active.length === 0
      ? <section className="card empty-state print-hide" aria-labelledby="print-empty">
        <span className="empty-state-icon" aria-hidden="true"><TableIcon size={30} /></span>
        <h2 id="print-empty">{text('مفيش طاولات شغالة للطباعة', 'No active tables to print')}</h2>
        <p>{text('ضيف طاولات أو شغّل الموجودة الأول.', 'Add tables, or switch existing ones on, first.')}</p>
        <Link className="button button-primary" to={to('/tables')}>{text('روح للطاولات', 'Go to tables')}</Link>
      </section>
      : <div className="print-sheets">
        {sheets.map((sheet, index) => <section className="print-sheet" key={sheet[0]!.id} aria-label={text(`ورقة ${number(index + 1)}`, `Sheet ${index + 1}`)}>
          {sheet.map(table => <article className="print-card" key={table.id} style={{ ['--qr-accent' as string]: accent }} data-testid="print-card">
            <div className="print-card-brand">
              {logo ? <img src={logo} alt="" /> : <span className="print-card-initial" aria-hidden="true">{restaurant.name.trim().charAt(0)}</span>}
              <span><bdi>{restaurant.name}</bdi>{branch && !branch.isMain && <small className="print-card-branch"> · <bdi>{branch.name}</bdi></small>}</span>
            </div>
            <strong className="print-card-table"><bdi>{table.label}</bdi></strong>
            <QRCodeSVG className="print-card-qr" value={table.qrUrl} size={200} level="M" marginSize={2} fgColor="#111111" bgColor="#ffffff"
              title={text(`كود QR لـ${table.label}`, `QR code for ${table.label}`)} role="img" />
            <p className="print-card-scan">
              <span lang="ar" dir="rtl">امسح الكود واطلب من مكانك</span>
              <span lang="en" dir="ltr">Scan to order from your table</span>
            </p>
            <small className="print-card-url ltr">{host}</small>
          </article>)}
        </section>)}
      </div>}
  </div>;
}
