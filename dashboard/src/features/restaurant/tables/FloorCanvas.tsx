import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { ArrowClockwiseIcon, ArrowsOutSimpleIcon, CrosshairIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, UserIcon } from '@phosphor-icons/react';
import { type RestaurantTable, TABLE_FLOOR_SCALE, type TableArea, type TableAreaTheme, type TableLocation } from '@bilhanah/contracts';
import { useLanguage } from '../../../lib/language';
import { areaTheme } from './area-themes';
import { statusOption, type TableStatus } from './floor-status';
import { TableGraphic, tableLayout } from './TableGraphic';

/** The plan's own coordinate space; it is scaled to fit its box, then by the zoom. */
const BOARD = { width: 800, height: 500 } as const;
const ZOOM = { min: 0.6, max: 2, step: 0.2 } as const;
const DRAG_THRESHOLD = 4;
/** On narrow screens the plan keeps a readable size and scrolls inside its box instead of shrinking away. */
const MIN_SCALE = 0.72;
const GAP = 10;
/** Room for the zone's name above its tables. */
const LABEL = 52;

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
/** A region of the plan: one seating area, or the tables in no area (indoor or outdoor). */
type FloorZone = Rect & { key: string; areaId: string | null; name: string; theme: TableAreaTheme; location: TableLocation; tables: RestaurantTable[] };
/** What a drop changes besides the spot: another area, or (for tables in no area) another location. */
export type FloorMoveChange = { areaId?: string | null; location?: TableLocation };
/** How a table is turned and sized on the plan. */
export type FloorShape = { floorRotation: number; floorScale: number };

/** Rotation snaps to this many degrees (Shift turns freely); size moves in these steps. */
export const ROTATE_STEP = 15;
export const SCALE_STEP = 0.1;
const turn = (degrees: number) => ((Math.round(degrees) % 360) + 360) % 360;
export const resize = (scale: number) => Math.round(clamp(scale, TABLE_FLOOR_SCALE.min, TABLE_FLOOR_SCALE.max) * 100) / 100;

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
const inside = (rect: Rect, point: Point, margin = 0) =>
  point.x >= rect.x + margin && point.x <= rect.x + rect.width - margin && point.y >= rect.y + margin && point.y <= rect.y + rect.height - margin;

/**
 * Splits the plan between the zones: one row for up to three, two rows up to six, then three.
 * Each zone's width in its row follows how many tables it holds, so a busy hall gets more room
 * than an empty rooftop.
 */
function layoutZones(zones: Omit<FloorZone, keyof Rect>[]): FloorZone[] {
  if (zones.length === 0) return [];
  const rows = zones.length <= 3 ? 1 : zones.length <= 6 ? 2 : 3;
  const perRow = Math.ceil(zones.length / rows);
  const rowHeight = (BOARD.height - GAP * (rows - 1)) / rows;
  return zones.map((zone, index) => {
    const row = Math.floor(index / perRow);
    const members = zones.slice(row * perRow, row * perRow + perRow);
    const weights = members.map(member => 1.2 + Math.sqrt(member.tables.length));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const free = BOARD.width - GAP * (members.length - 1);
    const position = index - row * perRow;
    const x = weights.slice(0, position).reduce((sum, weight) => sum + (weight / total) * free + GAP, 0);
    return { ...zone, x, y: row * (rowHeight + GAP), width: (weights[position]! / total) * free, height: rowHeight };
  });
}

/** Where each table sits: where the owner dropped it (when that is still inside its zone), else in rows inside its zone. */
function arrange(zones: FloorZone[]): Map<string, { point: Point; scale: number }> {
  const spots = new Map<string, { point: Point; scale: number }>();
  for (const zone of zones) {
    const room = { x: zone.x + 12, y: zone.y + LABEL, width: zone.width - 24, height: zone.height - LABEL - 10 };
    // The grid that keeps the tables biggest: try each column count, keep the roomiest cells.
    const widest = Math.max(1, ...zone.tables.map(table => tableLayout(table.shape, table.seats).width));
    const tallest = Math.max(1, ...zone.tables.map(table => tableLayout(table.shape, table.seats).height));
    const fits = (count: number) => Math.min(room.width / count / widest, room.height / Math.ceil(zone.tables.length / count) / tallest);
    const columns = Array.from({ length: Math.max(1, zone.tables.length) }, (_, index) => index + 1).reduce((best, count) => (fits(count) > fits(best) ? count : best), 1);
    const rows = Math.max(1, Math.ceil(zone.tables.length / columns));
    const cell = { width: room.width / columns, height: Math.min(175, room.height / rows) };
    const top = room.y + (room.height - rows * cell.height) / 2;
    zone.tables.forEach((table, index) => {
      const size = tableLayout(table.shape, table.seats);
      // Tables shrink to fit small zones, never grow; then the owner's own size applies.
      const scale = Math.min(1, (cell.width * 0.9) / size.width, (cell.height * 0.9) / size.height) * table.floorScale;
      const saved = table.floorX !== null && table.floorY !== null ? { x: (table.floorX / 100) * BOARD.width, y: (table.floorY / 100) * BOARD.height } : null;
      const point = saved && inside(zone, saved, 16)
        ? saved
        : { x: room.x + (index % columns + 0.5) * cell.width, y: top + (Math.floor(index / columns) + 0.5) * cell.height };
      spots.set(table.id, { point, scale });
    });
  }
  return spots;
}

/**
 * The dining room as an interactive floor plan. Each seating area is a region drawn the way it
 * looks (a stone hall, a garden lawn, a rooftop, a wooden terrace, a VIP room, a smoking area);
 * each table sits in its area in its shape, with its chairs and a status colour. Zoom, pick a
 * table to see its details, and drag tables into place, or into another area to move them there
 * (arrow keys move the focused one).
 */
export function FloorCanvas({ tables, areas, includeUnassigned, location, statusOf, selectedId, onSelect, onMove, onShape }: {
  /** The tables the filters leave, every one drawn in its zone. */
  tables: RestaurantTable[];
  /** The areas to draw, empty ones included, in order. */
  areas: TableArea[];
  /** Whether to draw the tables in no area (as an indoor and an outdoor region). */
  includeUnassigned: boolean;
  /** The location filter: no-area regions of the other location are left out. */
  location: TableLocation | 'ALL';
  statusOf: (table: RestaurantTable) => TableStatus;
  selectedId: string | null;
  onSelect: (tableId: string) => void;
  /** Saves where a table was dropped, in percent of the plan, and the area it was dropped in. */
  /** Omitted for viewers who may not arrange the floor (tables.manage): the plan is read-only. */
  onMove?: (table: RestaurantTable, floorX: number, floorY: number, change: FloorMoveChange) => void;
  /** Saves a turn or a resize from the handles or the keyboard. */
  onShape?: (table: RestaurantTable, shape: FloorShape) => void;
}) {
  const { text, number } = useLanguage();
  const frame = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.8);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<{ id: string; point: Point } | null>(null);
  const drag = useRef<{ id: string; start: Point; origin: Point; point: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  /** A turn or resize in progress, from the selected table's handles: drawn live, saved on release. */
  const [shaping, setShaping] = useState<{ id: string } & FloorShape | null>(null);
  const handle = useRef<{ kind: 'rotate' | 'resize'; table: RestaurantTable; center: Point; distance: number; shape: FloorShape } | null>(null);

  // Fit the board to the frame's width (the frame, not the scrolling viewport, so its scrollbars
  // never feed back into the size); zooming scales from there and scrolls inside the viewport.
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setFit(element.clientWidth / BOARD.width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const base = Math.max(fit, MIN_SCALE);
  const scale = base * zoom;

  const unassigned = (where: TableLocation) => tables.filter(table => table.areaId === null && table.location === where);
  const zones = layoutZones([
    ...areas.map(area => ({ key: area.id, areaId: area.id, name: area.name, theme: area.theme, location: area.location, tables: tables.filter(table => table.areaId === area.id) })),
    ...(includeUnassigned ? (['INDOOR', 'OUTDOOR'] as const)
      .filter(where => (location === 'ALL' || location === where) && unassigned(where).length > 0)
      .map(where => ({
        key: `none-${where}`, areaId: null, location: where, tables: unassigned(where),
        name: areas.length > 0 ? text(where === 'INDOOR' ? 'بدون منطقة · داخلي' : 'بدون منطقة · خارجي', where === 'INDOOR' ? 'No area · indoor' : 'No area · outdoor')
          : text(where === 'INDOOR' ? 'المنطقة الداخلية' : 'المنطقة الخارجية', where === 'INDOOR' ? 'Indoor area' : 'Outdoor area'),
        theme: (where === 'INDOOR' ? 'HALL' : 'TERRACE') as TableAreaTheme,
      })) : []),
  ]);
  const spots = arrange(zones);

  // Keep the selected table in view (after picking it from the list).
  useEffect(() => {
    if (!selectedId) return;
    viewport.current?.querySelector<HTMLElement>(`[data-table-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  const toBoard = (event: PointerEvent): Point => {
    const box = viewport.current!.querySelector<HTMLElement>('.floor-board')!.getBoundingClientRect();
    return { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
  };
  /** Saves a drop: inside the zone it landed in (moving the table there), or back inside its own zone when it landed between zones. */
  const save = (table: RestaurantTable, point: Point) => {
    const own = zones.find(zone => zone.tables.includes(table));
    const target = zones.find(zone => inside(zone, point)) ?? own;
    if (!target) return;
    const x = clamp(point.x, target.x + 24, target.x + target.width - 24);
    const y = clamp(point.y, target.y + LABEL - 10, target.y + target.height - 24);
    const change: FloorMoveChange = target.areaId !== null
      ? (target.areaId !== table.areaId ? { areaId: target.areaId } : {})
      : table.areaId !== null ? { areaId: null, location: target.location }
        : table.location !== target.location ? { location: target.location } : {};
    onMove?.(table, Math.round((x / BOARD.width) * 1000) / 10, Math.round((y / BOARD.height) * 1000) / 10, change);
  };

  const onPointerDown = (table: RestaurantTable, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !onMove) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = spots.get(table.id)!.point;
    drag.current = { id: table.id, start: toBoard(event), origin, point: origin, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    const point = toBoard(event);
    const dx = point.x - current.start.x;
    const dy = point.y - current.start.y;
    if (!current.moved && Math.hypot(dx * scale, dy * scale) < DRAG_THRESHOLD) return;
    current.moved = true;
    current.point = { x: clamp(current.origin.x + dx, 20, BOARD.width - 20), y: clamp(current.origin.y + dy, 20, BOARD.height - 20) };
    setDragging({ id: current.id, point: current.point });
  };
  const onPointerUp = (table: RestaurantTable) => {
    const current = drag.current;
    drag.current = null;
    if (!current?.moved) { setDragging(null); return; }
    suppressClick.current = true;
    save(table, current.point);
    onSelect(table.id);
    setDragging(null);
  };
  const onHandleDown = (kind: 'rotate' | 'resize', table: RestaurantTable, event: PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const center = spots.get(table.id)!.point;
    const start = toBoard(event);
    const shape = { floorRotation: table.floorRotation, floorScale: table.floorScale };
    handle.current = { kind, table, center, distance: Math.max(1, Math.hypot(start.x - center.x, start.y - center.y)), shape };
    setShaping({ id: table.id, ...shape });
  };
  const onHandleMove = (event: PointerEvent<HTMLSpanElement>) => {
    const current = handle.current;
    if (!current) return;
    const point = toBoard(event);
    const dx = point.x - current.center.x;
    const dy = point.y - current.center.y;
    if (current.kind === 'rotate') {
      // The knob sits above the table: pointing straight up is 0°.
      const degrees = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      setShaping({ id: current.table.id, ...current.shape, floorRotation: turn(event.shiftKey ? degrees : Math.round(degrees / ROTATE_STEP) * ROTATE_STEP) });
    } else {
      setShaping({ id: current.table.id, ...current.shape, floorScale: resize((current.shape.floorScale * Math.hypot(dx, dy)) / current.distance) });
    }
  };
  const onHandleUp = () => {
    const current = handle.current;
    handle.current = null;
    if (current && shaping && (shaping.floorRotation !== current.shape.floorRotation || shaping.floorScale !== current.shape.floorScale)) {
      onShape?.(current.table, { floorRotation: shaping.floorRotation, floorScale: shaping.floorScale });
    }
    setShaping(null);
  };

  const onKeyDown = (table: RestaurantTable, event: KeyboardEvent<HTMLButtonElement>) => {
    // R turns the table (Shift+R the other way); + and - resize it.
    const key = event.key.toLowerCase();
    if (onShape && (key === 'r' || key === '+' || key === '=' || key === '-')) {
      event.preventDefault();
      onShape(table, key === 'r'
        ? { floorRotation: turn(table.floorRotation + (event.shiftKey ? -ROTATE_STEP : ROTATE_STEP)), floorScale: table.floorScale }
        : { floorRotation: table.floorRotation, floorScale: resize(table.floorScale + (key === '-' ? -SCALE_STEP : SCALE_STEP)) });
      return;
    }
    const step = event.shiftKey ? 30 : 8;
    const moves: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const spot = spots.get(table.id)!.point;
    save(table, { x: spot.x + move.x, y: spot.y + move.y });
  };
  const dropZone = dragging ? zones.find(zone => inside(zone, dragging.point)) : undefined;

  return <div ref={frame} className="floor-canvas">
    <div ref={viewport} className="floor-viewport" dir="ltr" data-testid="floor-canvas" style={{ height: BOARD.height * base }}>
      <div className="floor-sizer" style={{ width: BOARD.width * scale, height: BOARD.height * scale }}>
        <div className="floor-board" style={{ width: BOARD.width, height: BOARD.height, transform: `scale(${scale})` }}>
          {zones.map(zone => {
            const theme = areaTheme(zone.theme);
            return <div key={zone.key} className={`floor-zone theme-${zone.theme.toLowerCase()} ${dropZone?.key === zone.key ? 'is-drop-target' : ''}`}
              data-testid="floor-zone" data-zone={zone.areaId ? zone.name : ''} data-theme={zone.theme.toLowerCase()}
              style={{ left: zone.x, top: zone.y, width: zone.width, height: zone.height }}>
              <span className="floor-zone-decor" aria-hidden="true" />
              <span className="floor-zone-label" dir="auto">
                <theme.icon size={15} weight="fill" aria-hidden="true" /><bdi>{zone.name}</bdi>
                <span className="floor-zone-count">{number(zone.tables.length)}</span>
              </span>
              {zone.tables.length === 0 && <span className="floor-zone-empty" dir="auto">{text('اسحب ترابيزة هنا', 'Drag a table here')}</span>}
            </div>;
          })}
          {zones.flatMap(zone => zone.tables).map(table => {
            const status = statusOf(table);
            const option = statusOption(status);
            const spot = spots.get(table.id)!;
            const point = dragging?.id === table.id ? dragging.point : spot.point;
            const size = tableLayout(table.shape, table.seats);
            const selected = table.id === selectedId;
            const live = shaping?.id === table.id ? shaping : null;
            const rotation = live?.floorRotation ?? table.floorRotation;
            // The owner's size is already in spot.scale; a live resize swaps it for the new one.
            const drawn = live ? (spot.scale / table.floorScale) * live.floorScale : spot.scale;
            const box = { width: size.width * drawn, height: size.height * drawn };
            const spotStyle = { left: point.x, top: point.y, width: box.width, height: box.height, '--spot-scale': drawn, '--spot-rotation': `${rotation}deg` } as CSSProperties;
            return <div key={table.id} className="floor-spot-wrap">
              <button type="button" data-table-id={table.id} data-testid="floor-spot" data-status={status.toLowerCase()} data-label={table.label}
                data-rotation={rotation} data-scale={live?.floorScale ?? table.floorScale}
                className={`floor-spot is-${status.toLowerCase()} ${selected ? 'is-selected' : ''} ${dragging?.id === table.id ? 'is-dragging' : ''}`}
                style={spotStyle}
                aria-pressed={selected}
                aria-describedby="floor-move-hint"
                onPointerDown={event => onPointerDown(table, event)} onPointerMove={onPointerMove} onPointerUp={() => onPointerUp(table)}
                onPointerCancel={() => { drag.current = null; setDragging(null); }}
                onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onSelect(table.id); }}
                onKeyDown={event => onKeyDown(table, event)}>
                <span className="floor-spot-body">
                  <TableGraphic shape={table.shape} seats={table.seats}>
                    <span className="floor-spot-face">
                      <bdi className="table-top-label">{table.label}</bdi>
                      {/* The visible name and seats lead its accessible name; status and the unit are read, not shown. */}
                      <span className="floor-spot-meta"><span className="floor-spot-dot" aria-hidden="true" /><UserIcon size={11} weight="bold" aria-hidden="true" />{number(table.seats)}
                        <span className="visually-hidden">{text(` أفراد، ${option.ar}`, ` seats, ${option.en}`)}</span></span>
                    </span>
                  </TableGraphic>
                </span>
              </button>
              {selected && !dragging && onShape && <span className="floor-handles" style={spotStyle} aria-hidden="true">
                <span className="floor-handle floor-handle-rotate" data-testid="rotate-handle" title={text('لفّ الترابيزة', 'Rotate')}
                  onPointerDown={event => onHandleDown('rotate', table, event)} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}>
                  <ArrowClockwiseIcon size={13} weight="bold" />
                </span>
                <span className="floor-handle floor-handle-resize" data-testid="resize-handle" title={text('كبّر أو صغّر الترابيزة', 'Resize')}
                  onPointerDown={event => onHandleDown('resize', table, event)} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}>
                  <ArrowsOutSimpleIcon size={12} weight="bold" />
                </span>
              </span>}
            </div>;
          })}
        </div>
      </div>
      {zones.length === 0 && <p className="floor-canvas-empty">{text('مفيش ترابيزات بالفلتر ده.', 'No tables match these filters.')}</p>}
    </div>
    <p id="floor-move-hint" className="visually-hidden">{text('اسحب الترابيزة أو استخدم الأسهم عشان تحرّكها، واسحبها لمنطقة تانية عشان تنقلها ليها. حرف R بيلفّها، و+ و- بيكبّروها ويصغّروها.', 'Drag the table, or use the arrow keys, to move it; drop it in another area to move it there. R rotates it, + and - resize it.')}</p>
    <div className="floor-zoom" role="group" aria-label={text('التكبير', 'Zoom')}>
      <button type="button" onClick={() => setZoom(value => clamp(Math.round((value + ZOOM.step) * 10) / 10, ZOOM.min, ZOOM.max))} disabled={zoom >= ZOOM.max} aria-label={text('كبّر', 'Zoom in')}><MagnifyingGlassPlusIcon size={18} /></button>
      <button type="button" onClick={() => setZoom(value => clamp(Math.round((value - ZOOM.step) * 10) / 10, ZOOM.min, ZOOM.max))} disabled={zoom <= ZOOM.min} aria-label={text('صغّر', 'Zoom out')}><MagnifyingGlassMinusIcon size={18} /></button>
      <button type="button" onClick={() => { setZoom(1); viewport.current?.scrollTo({ left: 0, top: 0 }); }} aria-label={text('رجّع العرض', 'Reset view')}><CrosshairIcon size={18} /></button>
    </div>
  </div>;
}
