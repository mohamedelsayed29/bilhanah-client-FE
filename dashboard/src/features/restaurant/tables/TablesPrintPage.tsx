import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRightIcon, DownloadSimpleIcon, PrinterIcon, TableIcon } from '@phosphor-icons/react';
import type { OwnerBranch, RestaurantTable } from '@bilhanah/contracts';
import { Button } from '../../../components/Button';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { PageHeader } from '../../../components/PageHeader';
import { PageSkeleton } from '../../../components/Skeleton';
import { useToast } from '../../../components/Toast';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { usePageBranch } from '../../branches/BranchScope';
import { useOwnerBranch, useWorkspace } from '../../branches/workspace';
import { useTablesQuery } from '../queries';
import { DEFAULT_QR_SIZE, downloadZip, moduleCount, QR_MARGIN, type QrFormat, type QrSizeKey, qrFilename, sizeCm, tableFilePrefix } from './qr-download';
import { QrSizePicker } from './TableDetails';

/** Ready-to-print A4 layouts; every one carries the table's name and the restaurant's brand. */
export const PRINT_LAYOUTS = {
  cards6: { perSheet: 6, ar: ['كروت ٢×٣', '٦ في الورقة، كود ٤٫٦ سم'], en: ['Cards 2 × 3', '6 per sheet, 4.6 cm code'] },
  cards4: { perSheet: 4, ar: ['كروت كبيرة ٢×٢', '٤ في الورقة، كود ٧ سم'], en: ['Large cards 2 × 2', '4 per sheet, 7 cm code'] },
  stickers: { perSheet: 12, ar: ['ستيكرات ٣×٤', '١٢ في الورقة، كود ٣٫٨ سم'], en: ['Stickers 3 × 4', '12 per sheet, 3.8 cm code'] },
  tent: { perSheet: 1, ar: ['ستاند بيتطبق', 'يتطبق نصين ويقف على الطاولة'], en: ['Folding table tent', 'Fold in half to stand on the table'] },
  poster: { perSheet: 1, ar: ['بوستر', 'طاولة في الورقة، كود ١٣ سم'], en: ['Poster', 'One per sheet, 13 cm code'] },
} as const;
export type PrintLayout = keyof typeof PRINT_LAYOUTS;

export function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
}

/** QR cards for the chosen tables in a chosen A4 layout, plus their codes as one ZIP; the app chrome is hidden when printing. */
export function TablesPrintPage() {
  const { text, number, count, language } = useLanguage();
  usePageTitle('اطبع ونزّل أكواد الطاولات', 'Print and download table QR codes');
  const toast = useToast();
  const { restaurant, to } = useWorkspace();
  const { branchId } = usePageBranch();
  const branch = useOwnerBranch(branchId);
  const tables = useTablesQuery(branchId);
  const [layout, setLayout] = useState<PrintLayout>('cards6');
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [format, setFormat] = useState<QrFormat>('png');
  const [size, setSize] = useState<QrSizeKey>(DEFAULT_QR_SIZE);
  const [busy, setBusy] = useState(false);
  const [cells, setCells] = useState(0);
  const codesRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => (tables.data ?? []).filter(table => table.isActive), [tables.data]);
  const chosen = useMemo(() => active.filter(table => !skipped.has(table.id)), [active, skipped]);
  // The largest code decides which sizes still scan.
  useLayoutEffect(() => {
    const svgs = codesRef.current?.querySelectorAll('svg') ?? [];
    setCells(Math.max(0, ...Array.from(svgs, svg => moduleCount(svg))));
  }, [chosen]);

  if (tables.isPending) return <PageSkeleton blocks={2} />;
  if (tables.isError) return <div className="page"><ErrorPanel error={tables.error} onRetry={() => void tables.refetch()} /></div>;

  const prefix = tableFilePrefix(restaurant.subdomain, branch ?? null);
  const perSheet = PRINT_LAYOUTS[layout].perSheet;
  const sheets = chunk<RestaurantTable>(chosen, perSheet);
  const toggle = (id: string) => setSkipped(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const download = () => {
    const codes = Array.from(codesRef.current?.querySelectorAll<SVGSVGElement>('svg[data-qr-for]') ?? []).map(svg => {
      const table = chosen.find(entry => entry.id === svg.dataset['qrFor']);
      return { svg, filename: qrFilename(prefix, table?.label ?? '') };
    });
    if (codes.length === 0) return;
    setBusy(true);
    downloadZip(codes, format, sizeCm(size), `bilhanah-${prefix}-qr`)
      .then(() => toast.success(text(`نزل ملف ZIP فيه ${count(codes.length, 'code')}`, `ZIP with ${count(codes.length, 'code')} downloaded`)),
        () => toast.error(text('مقدرناش نعمل الملف. جرّب SVG.', 'Could not create the file. Try SVG.')))
      .finally(() => setBusy(false));
  };

  return <div className="page print-page">
    <div className="print-hide back-row">
      <Link to={`${to('/tables')}${branchId ? `?branch=${branchId}` : ''}`} className="back-link"><ArrowRightIcon size={16} className="directional" aria-hidden="true" />{text('الطاولات', 'Tables')}</Link>
    </div>
    <div className="print-hide">
      <PageHeader title={text('اطبع ونزّل أكواد الطاولات', 'Print and download table QR codes')}
        description={active.length > 0
          ? text(`${count(chosen.length, 'card')} في ${count(sheets.length, 'sheet')} A4. اختار الشكل والطاولات، وقص على الخط المنقط.`, `${count(chosen.length, 'card')} on ${count(sheets.length, 'sheet')} of A4. Pick a layout and the tables, then cut along the dotted lines.`)
          : undefined}
        actions={active.length > 0 ? <Button onClick={() => window.print()} disabled={chosen.length === 0} icon={<PrinterIcon size={18} aria-hidden="true" />}>{text('اطبع', 'Print')}</Button> : undefined} />
    </div>
    {active.length === 0
      ? <section className="card empty-state print-hide" aria-labelledby="print-empty">
        <span className="empty-state-icon" aria-hidden="true"><TableIcon size={30} /></span>
        <h2 id="print-empty">{text('مفيش طاولات شغالة للطباعة', 'No active tables to print')}</h2>
        <p>{text('ضيف طاولات أو شغّل الموجودة الأول.', 'Add tables, or switch existing ones on, first.')}</p>
        <Link className="button button-primary" to={to('/tables')}>{text('روح للطاولات', 'Go to tables')}</Link>
      </section>
      : <>
        <div className="qr-export print-hide">
          <fieldset className="card qr-export-layouts">
            <legend>{text('شكل الطباعة', 'Print layout')}</legend>
            <div className="qr-layout-options">
              {(Object.keys(PRINT_LAYOUTS) as PrintLayout[]).map(key => {
                const [name, hint] = PRINT_LAYOUTS[key][language === 'ar' ? 'ar' : 'en'];
                return <label key={key} className={`qr-layout-option${layout === key ? ' is-checked' : ''}`}>
                  <input type="radio" name="print-layout" value={key} checked={layout === key} onChange={() => setLayout(key)} />
                  <span className={`qr-layout-thumb layout-${key}`} aria-hidden="true">{Array.from({ length: key === 'tent' ? 2 : PRINT_LAYOUTS[key].perSheet }, (_, index) => <i key={index} />)}</span>
                  <span><strong>{name}</strong><small>{hint}</small></span>
                </label>;
              })}
            </div>
          </fieldset>

          <fieldset className="card qr-export-tables">
            <legend>{text('الطاولات', 'Tables')}</legend>
            <div className="qr-export-tables-head">
              <span className="muted">{text(`${number(chosen.length)} من ${number(active.length)}`, `${chosen.length} of ${active.length}`)}</span>
              <button type="button" className="link-action" onClick={() => setSkipped(new Set())} disabled={skipped.size === 0}>{text('اختار الكل', 'Select all')}</button>
              <button type="button" className="link-action" onClick={() => setSkipped(new Set(active.map(table => table.id)))} disabled={chosen.length === 0}>{text('شيل الكل', 'Clear')}</button>
            </div>
            <ul className="qr-export-table-list">
              {active.map(table => <li key={table.id}><label>
                <input type="checkbox" checked={!skipped.has(table.id)} onChange={() => toggle(table.id)} data-testid="print-table-toggle" />
                <bdi>{table.label}</bdi>
              </label></li>)}
            </ul>
          </fieldset>

          <fieldset className="card qr-export-download">
            <legend>{text('نزّل الأكواد', 'Download the codes')}</legend>
            <p className="muted">{text('ملف ZIP فيه كود لكل طاولة مختارة، باسم الطاولة. PNG بدقة ٣٠٠ dpi، وSVG بيتكبر من غير ما يبوظ.', 'One ZIP with a code per chosen table, named after it. PNG at 300 dpi, or SVG that scales without losing quality.')}</p>
            <div className="segmented" role="radiogroup" aria-label={text('نوع الملف', 'File type')}>
              {(['png', 'svg'] as const).map(value => <label key={value}>
                <input type="radio" name="qr-format" value={value} checked={format === value} onChange={() => setFormat(value)} />
                <span className="ltr">{value.toUpperCase()}</span>
              </label>)}
            </div>
            <QrSizePicker value={size} onChange={setSize} cells={cells} />
            <Button onClick={download} loading={busy} disabled={chosen.length === 0} icon={<DownloadSimpleIcon size={18} aria-hidden="true" />} data-testid="qr-zip">
              {text(`نزّل ${count(chosen.length, 'code')}`, `Download ${count(chosen.length, 'code')}`)}
            </Button>
          </fieldset>
        </div>

        {/* The exported codes: the same vector code as printed, with the standard quiet zone. */}
        <div ref={codesRef} hidden>
          {chosen.map(table => <QRCodeSVG key={table.id} data-qr-for={table.id} value={table.qrUrl} size={256} level="M" marginSize={QR_MARGIN} fgColor="#111111" bgColor="#ffffff" />)}
        </div>

        {chosen.length === 0
          ? <p className="card qr-export-empty print-hide">{text('اختار طاولة واحدة على الأقل.', 'Pick at least one table.')}</p>
          : <div className="print-sheets">
            {sheets.map((sheet, index) => <section className={`print-sheet layout-${layout}`} key={`${layout}-${sheet[0]!.id}`} aria-label={text(`ورقة ${number(index + 1)}`, `Sheet ${index + 1}`)}>
              {sheet.map(table => layout === 'tent'
                ? [<PrintCard key={`${table.id}-back`} table={table} restaurant={restaurant} branch={branch ?? null} layout={layout} flipped />,
                  <PrintCard key={table.id} table={table} restaurant={restaurant} branch={branch ?? null} layout={layout} />]
                : <PrintCard key={table.id} table={table} restaurant={restaurant} branch={branch ?? null} layout={layout} />)}
            </section>)}
          </div>}
      </>}
  </div>;
}

/** One table's card: brand, table name, code, a two-language call to scan and the menu address. */
function PrintCard({ table, restaurant, branch, layout, flipped = false }: { table: RestaurantTable; restaurant: ReturnType<typeof useWorkspace>['restaurant']; branch: OwnerBranch | null; layout: PrintLayout; flipped?: boolean }) {
  const { text } = useLanguage();
  const logo = restaurant.logoUrl;
  // The branch's own link (the main branch's is the restaurant's), as printed under each code.
  const host = (branch?.publicUrl ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const accent = restaurant.brandColor ?? '#f45164';
  const compact = layout === 'stickers';
  return <article className={`print-card${flipped ? ' is-flipped' : ''}`} style={{ ['--qr-accent' as string]: accent }}
    data-testid={flipped ? undefined : 'print-card'} aria-hidden={flipped || undefined}>
    <div className="print-card-brand">
      {logo ? <img src={logo} alt="" /> : <span className="print-card-initial" aria-hidden="true">{restaurant.name.trim().charAt(0)}</span>}
      <span><bdi>{restaurant.name}</bdi>{!compact && branch && !branch.isMain && <small className="print-card-branch"> · <bdi>{branch.name}</bdi></small>}</span>
    </div>
    <strong className="print-card-table"><bdi>{table.label}</bdi></strong>
    <QRCodeSVG className="print-card-qr" value={table.qrUrl} size={200} level="M" marginSize={2} fgColor="#111111" bgColor="#ffffff"
      title={text(`كود QR لـ${table.label}`, `QR code for ${table.label}`)} role="img" />
    <p className="print-card-scan">
      <span lang="ar" dir="rtl">امسح الكود واطلب من مكانك</span>
      {!compact && <span lang="en" dir="ltr">Scan to order from your table</span>}
    </p>
    {!compact && <small className="print-card-url ltr">{host}</small>}
  </article>;
}
