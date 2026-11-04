import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowClockwiseIcon, ArrowCounterClockwiseIcon, ArrowsClockwiseIcon, ArrowsInSimpleIcon, ArrowsOutSimpleIcon, CaretDownIcon, CoinsIcon, CrownIcon, DownloadSimpleIcon, FileSvgIcon, NoteIcon, PencilSimpleIcon, QrCodeIcon, UsersIcon,
} from '@phosphor-icons/react';
import { type RestaurantTable, TABLE_FLOOR_SCALE, type TableArea, type TableOccupancy } from '@bilhanah/contracts';
import { ActionMenu, type ActionMenuItem } from '../../../components/ActionMenu';
import { Button } from '../../../components/Button';
import { CopyButton } from '../../../components/CopyButton';
import { Dialog } from '../../../components/Dialog';
import { useToast } from '../../../components/Toast';
import { formatDate, formatPrice } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { type FloorShape, resize, ROTATE_STEP, SCALE_STEP } from './FloorCanvas';
import type { TableStatus } from './floor-status';
import { downloadPng, downloadSvg, qrFilename } from './qr-download';
import { TABLE_ATTRIBUTE_OPTIONS, tableLocationOption } from './TableDialogs';
import { StatusPill } from './TablesSidePanel';

/**
 * The selected table under the floor plan: where it is and how many it seats, its status (who
 * booked it, or the open bill), minimum order, notes and features, with its QR code, edit and
 * more actions.
 */
export function TableDetails({ table, area, status, occupancy, onQr, onEdit, actions, onShape }: {
  table: RestaurantTable;
  area: TableArea | undefined;
  status: TableStatus;
  occupancy: TableOccupancy | undefined;
  /** QR, edit and shape controls only for viewers who manage tables. */
  onQr?: () => void;
  onEdit?: () => void;
  actions: ActionMenuItem[];
  /** Turns or resizes the table on the floor plan (the same as its handles there). */
  onShape?: (shape: FloorShape) => void;
}) {
  const { text, count, language, number } = useLanguage();
  const turnBy = (degrees: number) => onShape?.({ floorRotation: (((table.floorRotation + degrees) % 360) + 360) % 360, floorScale: table.floorScale });
  const sizeBy = (step: number) => onShape?.({ floorRotation: table.floorRotation, floorScale: resize(table.floorScale + step) });
  const location = tableLocationOption(table.location);
  const reservation = occupancy?.reservation;
  return <section className="card table-details" aria-labelledby="table-details-title" data-testid="table-details">
    <div className="table-details-who">
      <span className={`table-details-icon is-${table.location.toLowerCase()}`} aria-hidden="true"><location.icon size={22} weight="fill" /></span>
      <div>
        <h2 id="table-details-title"><bdi>{table.label}</bdi></h2>
        <p><bdi>{area?.name ?? text(location.ar, location.en)}</bdi> · {count(table.seats, 'seat')}</p>
      </div>
      <StatusPill status={status} />
      {table.attributes.includes('VIP') && <span className="vip-pill"><CrownIcon size={13} weight="fill" aria-hidden="true" />VIP</span>}
    </div>
    <dl className="table-details-facts">
      <div>
        <dt><CoinsIcon size={14} aria-hidden="true" />{text('أقل طلب', 'Minimum order')}</dt>
        <dd>{table.minOrderPiastres === null ? text('مفيش', 'None') : formatPrice(table.minOrderPiastres, language)}</dd>
      </div>
      <div>
        <dt><NoteIcon size={14} aria-hidden="true" />{text('ملاحظات', 'Notes')}</dt>
        <dd className="table-details-notes">{table.notes ?? text('مفيش', 'None')}</dd>
      </div>
      <div>
        <dt><UsersIcon size={14} aria-hidden="true" />{text('السعة', 'Capacity')}</dt>
        <dd>{count(table.seats, 'seat')}</dd>
      </div>
      <div>
        <dt>{text('المكان', 'Location')}</dt>
        <dd>{text(location.ar, location.en)}</dd>
      </div>
      {(status === 'OCCUPIED' || reservation) && <div className="table-details-now">
        <dt>{status === 'OCCUPIED' ? text('الحساب المفتوح', 'Open bill') : text('محجوزة لـ', 'Reserved for')}</dt>
        <dd>{status === 'OCCUPIED' && occupancy
          ? formatPrice(occupancy.unpaidPiastres, language)
          : reservation && <><bdi>{reservation.customerName}</bdi> · {formatDate(reservation.reservedAt, language, { hour: 'numeric', minute: '2-digit' })}</>}</dd>
      </div>}
    </dl>
    {table.attributes.length > 0 && <ul className="table-details-features" aria-label={text('مميزات الطاولة', 'Table features')}>
      {TABLE_ATTRIBUTE_OPTIONS.filter(option => table.attributes.includes(option.value) && option.value !== 'VIP').map(option => <li key={option.value}>{text(option.ar, option.en)}</li>)}
    </ul>}
    {onShape && <div className="table-details-shape" role="group" aria-label={text('شكلها على الخريطة', 'On the floor plan')}>
      <span className="table-details-shape-label">{text('على الخريطة', 'On the plan')}</span>
      <button type="button" className="icon-button" onClick={() => turnBy(-ROTATE_STEP)} aria-label={text('لفّها شمال', 'Rotate left')}><ArrowCounterClockwiseIcon size={17} /></button>
      <output className="table-details-shape-value" aria-label={text('الزاوية', 'Angle')}>{number(table.floorRotation)}°</output>
      <button type="button" className="icon-button" onClick={() => turnBy(ROTATE_STEP)} aria-label={text('لفّها يمين', 'Rotate right')}><ArrowClockwiseIcon size={17} /></button>
      <span className="table-details-shape-sep" aria-hidden="true" />
      <button type="button" className="icon-button" onClick={() => sizeBy(-SCALE_STEP)} disabled={table.floorScale <= TABLE_FLOOR_SCALE.min} aria-label={text('صغّرها', 'Smaller')}><ArrowsInSimpleIcon size={17} /></button>
      <output className="table-details-shape-value" aria-label={text('الحجم', 'Size')}>{number(Math.round(table.floorScale * 100))}{text('٪', '%')}</output>
      <button type="button" className="icon-button" onClick={() => sizeBy(SCALE_STEP)} disabled={table.floorScale >= TABLE_FLOOR_SCALE.max} aria-label={text('كبّرها', 'Bigger')}><ArrowsOutSimpleIcon size={17} /></button>
      {(table.floorRotation !== 0 || table.floorScale !== 1) && <button type="button" className="link-action table-details-shape-reset"
        onClick={() => onShape({ floorRotation: 0, floorScale: 1 })}>{text('رجّعها زي ما كانت', 'Reset')}</button>}
    </div>}
    <div className="table-details-actions">
      {onQr && <Button variant="secondary" small onClick={onQr} icon={<QrCodeIcon size={17} aria-hidden="true" />}>{text('كود QR', 'View QR code')}</Button>}
      {onEdit && <Button variant="secondary" small onClick={onEdit} icon={<PencilSimpleIcon size={17} aria-hidden="true" />}>{text('تعديل الطاولة', 'Edit table')}</Button>}
      {actions.length > 0 && <ActionMenu className="table-details-more" label={text(`إجراءات أكتر لـ${table.label}`, `More actions for ${table.label}`)}
        trigger={<>{text('أكتر', 'More')}<CaretDownIcon size={14} aria-hidden="true" /></>} items={actions} />}
    </div>
  </section>;
}

/** A table's QR code, big enough to scan from the screen, with its link and downloads. */
export function TableQrDialog({ table, filePrefix, onClose, onNewCode }: { table: RestaurantTable | null; filePrefix: string; onClose: () => void; onNewCode: (table: RestaurantTable) => void }) {
  const { text } = useLanguage();
  const toast = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const filename = table ? qrFilename(filePrefix, table.label) : '';
  const png = () => {
    if (!svgRef.current) return;
    downloadPng(svgRef.current, filename).then(
      () => toast.success(text('نزلت صورة PNG', 'PNG downloaded')),
      () => toast.error(text('مقدرناش نعمل الصورة. جرّب SVG.', 'Could not create the image. Try SVG.')),
    );
  };
  const svg = () => {
    if (!svgRef.current) return;
    downloadSvg(svgRef.current, filename);
    toast.success(text('نزل ملف SVG', 'SVG downloaded'));
  };
  return <Dialog open={table !== null} onClose={onClose} size="small" title={table ? text(`كود «${table.label}»`, `“${table.label}” QR code`) : ''}
    footer={<Button variant="secondary" onClick={onClose}>{text('إغلاق', 'Close')}</Button>}>
    {table && <div className="table-qr">
      <QRCodeSVG ref={svgRef} value={table.qrUrl} size={220} level="M" marginSize={2} bgColor="#ffffff" fgColor="#111111"
        title={text(`كود QR لـ${table.label}`, `QR code for ${table.label}`)} role="img" />
      <p className="table-qr-link"><bdi dir="ltr">{table.qrUrl}</bdi><CopyButton value={table.qrUrl} label={text('انسخ اللينك', 'Copy link')} /></p>
      {!table.isActive && <p className="table-qr-off">{text('الكود ده متوقف مؤقتًا، شغّل الطاولة عشان يشتغل.', 'This code is switched off; turn the table on for it to work.')}</p>}
      <div className="table-qr-actions">
        <Button small variant="ghost" onClick={png} icon={<DownloadSimpleIcon size={16} aria-hidden="true" />} aria-label={text(`نزّل PNG لـ${table.label}`, `Download PNG for ${table.label}`)}>PNG</Button>
        <Button small variant="ghost" onClick={svg} icon={<FileSvgIcon size={16} aria-hidden="true" />} aria-label={text(`نزّل SVG لـ${table.label}`, `Download SVG for ${table.label}`)}>SVG</Button>
        <Button small variant="ghost" onClick={() => onNewCode(table)} icon={<ArrowsClockwiseIcon size={16} aria-hidden="true" />}>{text('كود جديد', 'New code')}</Button>
      </div>
    </div>}
  </Dialog>;
}
