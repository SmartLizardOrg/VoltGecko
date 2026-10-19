import { describe, expect, it } from 'vitest';
import type { Point } from '../types';
import { automaticWireRoute, wireSegmentCrossesObstacle } from './boardWireRouting';
import type { RoutingTerminal, WiringObstacle } from './boardWireRouting';

const obstacles: WiringObstacle[] = [
  { x: 80, y: 130, width: 88, height: 100 },
  { x: 172, y: 130, width: 42, height: 100 },
  { x: 80, y: 360, width: 134, height: 100 },
  { x: 80, y: 590, width: 134, height: 100 }
];
const terminal = (x: number, y: number, direction: RoutingTerminal['direction']): RoutingTerminal =>
  ({ point: { x, y }, direction });

function expectClearRoute(points: Point[], from: RoutingTerminal, to: RoutingTerminal) {
  expect(points[0]).toEqual(from.point);
  expect(points.at(-1)).toEqual(to.point);
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index];
    expect(a.x === b.x || a.y === b.y).toBe(true);
    expect(a).not.toEqual(b);
    expect(obstacles.some((rect) => wireSegmentCrossesObstacle(a, b, rect))).toBe(false);
  }
  for (const [port, adjacent] of [[from, points[1]], [to, points.at(-2)!]] as const) {
    if (port.direction === 'up') expect(adjacent.y).toBeLessThan(port.point.y);
    if (port.direction === 'down') expect(adjacent.y).toBeGreaterThan(port.point.y);
    if (port.direction === 'left') expect(adjacent.x).toBeLessThan(port.point.x);
  }
}

describe('automatic cabinet wire routes', () => {
  it.each([
    ['same-row top terminals', terminal(124, 130, 'up'), terminal(193, 130, 'up')],
    ['same-row bottom terminals', terminal(124, 230, 'down'), terminal(193, 230, 'down')],
    ['opposite sides on the same row', terminal(124, 130, 'up'), terminal(193, 230, 'down')],
    ['facing terminals in adjacent rows', terminal(124, 230, 'down'), terminal(147, 360, 'up')],
    ['same-side terminals across rows', terminal(124, 130, 'up'), terminal(147, 360, 'up')],
    ['an intervening occupied row', terminal(124, 230, 'down'), terminal(147, 590, 'up')],
    ['a terminal and a bus above the cabinet', terminal(124, 130, 'up'), terminal(300, 55, 'down')],
    ['an external connection', terminal(124, 230, 'down'), terminal(885, 60, 'left')],
    ['an infeed connection', terminal(750, 152, 'down'), terminal(147, 360, 'up')]
  ])('keeps %s visible and orthogonal in either selection order', (_name, from, to) => {
    const route = automaticWireRoute(from, to, obstacles, 'wire-test');
    expectClearRoute(route, from, to);
    expect(automaticWireRoute(to, from, obstacles, 'wire-test')).toEqual([...route].reverse());
  });

  it('uses the inter-row gap when the terminals face each other', () => {
    const route = automaticWireRoute(terminal(124, 230, 'down'), terminal(147, 360, 'up'), obstacles, 'gap');
    expect(route.every((point) => point.x >= 124 && point.x <= 147 && point.y >= 230 && point.y <= 360)).toBe(true);
  });

  it('does not mutate terminal positions or obstacles', () => {
    const from = terminal(124, 130, 'up'), to = terminal(193, 230, 'down');
    const before = structuredClone({ from, to, obstacles });
    automaticWireRoute(from, to, obstacles, 'stable-wire');
    expect({ from, to, obstacles }).toEqual(before);
  });

  it.each([1, 6, 12])('turns in a %s px gap after leaving an infeed instead of crossing a nearby device', (gap) => {
    const source = { x: 95, y: 60, width: 140, height: 58 };
    const device = { x: 80, y: 118 + gap, width: 100, height: 100 };
    const route = automaticWireRoute(terminal(113, 110, 'down'), terminal(130, device.y + device.height, 'down'), [source, device], 'wire-test');
    expect(route[1].y).toBeGreaterThan(118);
    expect(route[1].y).toBeLessThan(device.y);
    expect(route.slice(1).some((point, index) => wireSegmentCrossesObstacle(route[index], point, device))).toBe(false);
  });
});
