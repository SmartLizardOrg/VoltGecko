import { describe, expect, it } from 'vitest';
import { roundedWirePath } from './wirePath';

describe('visible cabinet wire strokes', () => {
  it('rounds bends without changing the canonical route or its terminal coordinates', () => {
    const points = [{ x: 101, y: 230 }, { x: 101, y: 270 }, { x: 239, y: 270 }, { x: 239, y: 130 }];
    const saved = structuredClone(points);
    const path = roundedWirePath(points);
    expect(path).toMatch(/^M 101 230 /);
    expect(path).toMatch(/ L 239 130$/);
    expect(path.match(/ Q /g)).toHaveLength(2);
    expect(points).toEqual(saved);
  });

  it('keeps short and duplicate manual segments finite with an oversized radius', () => {
    const path = roundedWirePath([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 2 }, { x: 3, y: 2 }], 100);
    expect(path).not.toMatch(/NaN|Infinity/);
    const numbers = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(numbers.every(value => value >= 0 && value <= 3)).toBe(true);
    expect(path).toMatch(/^M 0 0 /);
    expect(path).toMatch(/ L 3 2$/);
  });

  it('supports empty, single-point and collinear manual routes', () => {
    expect(roundedWirePath([])).toBe('');
    expect(roundedWirePath([{ x: 4, y: 8 }])).toBe('M 4 8');
    expect(roundedWirePath([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }])).not.toContain('Q');
  });
});
