import type { CSSProperties, ReactNode } from 'react';
import type { TableShape } from '@bilhanah/contracts';

/** Chair size along the table edge, its depth, the gap to the table, and the room each chair takes on an edge. */
const CHAIR = { length: 20, depth: 7, gap: 4, pitch: 30 } as const;
const RING = CHAIR.gap + CHAIR.depth;

type Chair = { x: number; y: number; angle: number };
type Layout = { width: number; height: number; table: { width: number; height: number }; chairs: Chair[] };

/** Centers of `count` chairs spread evenly along an edge of `length`. */
const spread = (count: number, length: number) => Array.from({ length: count }, (_, index) => (length / count) * (index + 0.5));

/** Edge chairs for a square or rectangular table: top and bottom first, then the ends. */
function edgeChairs(width: number, height: number, sides: { top: number; bottom: number; start: number; end: number }): Chair[] {
  const offset = CHAIR.gap + CHAIR.depth / 2;
  return [
    ...spread(sides.top, width).map(x => ({ x: RING + x, y: RING - offset, angle: 0 })),
    ...spread(sides.bottom, width).map(x => ({ x: RING + x, y: RING + height + offset, angle: 0 })),
    ...spread(sides.start, height).map(y => ({ x: RING - offset, y: RING + y, angle: 90 })),
    ...spread(sides.end, height).map(y => ({ x: RING + width + offset, y: RING + y, angle: 90 })),
  ];
}

/** Where the table and each of its chairs sit, in pixels, for a table seating `seats` guests. */
export function tableLayout(shape: TableShape, seats: number): Layout {
  if (shape === 'ROUND') {
    const diameter = Math.max(78, Math.ceil((seats * 28) / Math.PI));
    const size = diameter + RING * 2;
    const radius = diameter / 2 + CHAIR.gap + CHAIR.depth / 2;
    const chairs = Array.from({ length: seats }, (_, index) => {
      const angle = (index / seats) * 2 * Math.PI - Math.PI / 2;
      return { x: size / 2 + radius * Math.cos(angle), y: size / 2 + radius * Math.sin(angle), angle: (angle * 180) / Math.PI + 90 };
    });
    return { width: size, height: size, table: { width: diameter, height: diameter }, chairs };
  }
  let sides: { top: number; bottom: number; start: number; end: number };
  if (shape === 'SQUARE') {
    // Round-robin over the four edges so a square stays balanced: 6 seats → 2, 2, 1, 1.
    const edge = (order: number) => Math.floor(seats / 4) + (order < seats % 4 ? 1 : 0);
    sides = { top: edge(0), bottom: edge(1), start: edge(2), end: edge(3) };
  } else {
    // A long table seats guests along its sides, plus one at each end from six seats up.
    const ends = seats >= 6 ? 2 : 0;
    const along = seats - ends;
    sides = { top: Math.ceil(along / 2), bottom: Math.floor(along / 2), start: ends / 2, end: ends / 2 };
  }
  const longest = Math.max(sides.top, sides.bottom);
  const width = shape === 'SQUARE'
    ? Math.max(76, Math.max(longest, sides.start, sides.end) * CHAIR.pitch + 8)
    : Math.max(112, longest * CHAIR.pitch + 12);
  const height = shape === 'SQUARE' ? width : 66;
  return { width: width + RING * 2, height: height + RING * 2, table: { width, height }, chairs: edgeChairs(width, height, sides) };
}

/** A small outline of each shape (seen from above) for the shape picker; it follows the text color. */
export function TableShapeIcon({ shape, size = 18 }: { shape: TableShape; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    {shape === 'ROUND' && <circle cx="10" cy="10" r="6.5" />}
    {shape === 'SQUARE' && <rect x="4" y="4" width="12" height="12" rx="2" />}
    {shape === 'RECTANGLE' && <rect x="1.5" y="6" width="17" height="8" rx="2" />}
  </svg>;
}

/**
 * A table drawn from above with its chairs around it, as on a floor plan. `children` is
 * what is written on the table (its name, the bill); the drawing itself is decorative.
 */
export function TableGraphic({ shape, seats, children, className = '' }: { shape: TableShape; seats: number; children?: ReactNode; className?: string }) {
  const layout = tableLayout(shape, seats);
  return <span className={`table-graphic table-graphic-${shape.toLowerCase()} ${className}`} style={{ width: layout.width, height: layout.height }}>
    {layout.chairs.map((chair, index) => <span key={index} className="table-chair" aria-hidden="true"
      style={{ left: chair.x, top: chair.y, width: CHAIR.length, height: CHAIR.depth, transform: `translate(-50%, -50%) rotate(${chair.angle}deg)` } as CSSProperties} />)}
    <span className="table-top" style={{ left: RING, top: RING, width: layout.table.width, height: layout.table.height }}>{children}</span>
  </span>;
}
