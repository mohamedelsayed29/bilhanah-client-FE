import { describe, expect, it } from 'vitest';
import { smoothPath } from './SalesChart';

const numbers = (path: string) => path.match(/-?\d+(\.\d+)?/g)!.map(Number);

describe('the sales line', () => {
  it('passes through every point and never dips below a flat stretch', () => {
    const points = [{ x: 0, y: 100 }, { x: 10, y: 100 }, { x: 20, y: 20 }, { x: 30, y: 100 }];
    const path = smoothPath(points);
    expect(path.startsWith('M0,100')).toBe(true);
    expect(path.endsWith('30,100')).toBe(true);
    // Flat start: control points stay on y = 100 (no overshoot past the baseline).
    const values = numbers(path);
    expect(Math.max(...values.filter((_, index) => index % 2 === 1))).toBeLessThanOrEqual(100);
  });

  it('handles one point and none', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([{ x: 5, y: 7 }])).toBe('M5,7');
  });
});
