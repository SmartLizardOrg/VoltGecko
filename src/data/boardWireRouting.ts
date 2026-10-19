import type { Point } from '../types';

export interface WiringObstacle extends Point { width: number; height: number }
export interface RoutingTerminal {
  point: Point;
  direction: 'up' | 'down' | 'left' | 'right';
}

function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous?.x === point.x && previous.y === point.y) continue;
    result.push(point);
    while (result.length >= 3) {
      const [a, b, c] = result.slice(-3);
      const straight =
        (a.x === b.x && b.x === c.x && (b.y - a.y) * (c.y - b.y) >= 0) ||
        (a.y === b.y && b.y === c.y && (b.x - a.x) * (c.x - b.x) >= 0);
      if (!straight) break;
      result.splice(result.length - 2, 1);
    }
  }
  return result;
}

function escape({ point, direction }: RoutingTerminal, preferred: number, obstacles: WiringObstacle[]): Point {
  const vertical = direction === 'up' || direction === 'down';
  const sign = direction === 'up' || direction === 'left' ? -1 : 1;
  const origin = vertical ? point.y : point.x;
  let minimum = 0, maximum = Infinity;
  for (const rect of obstacles) {
    const perpendicular = vertical ? point.x : point.y;
    const lower = vertical ? rect.x : rect.y;
    const upper = lower + (vertical ? rect.width : rect.height);
    if (perpendicular <= lower || perpendicular >= upper) continue;
    const start = vertical ? rect.y : rect.x;
    const end = start + (vertical ? rect.height : rect.width);
    const near = Math.min((start - origin) * sign, (end - origin) * sign);
    const far = Math.max((start - origin) * sign, (end - origin) * sign);
    if (far <= 0) continue;
    // Infeed terminals lie slightly inside their source rectangle. Leave that
    // body, but turn before a nearby device even when the gap is narrow.
    if (near <= 0) minimum = Math.max(minimum, far);
    else maximum = Math.min(maximum, near);
  }
  const margin = Math.min(4, Math.max(0, (maximum - minimum) / 2));
  const distance = minimum < maximum
    ? Math.min(Math.max(preferred, minimum + margin), maximum - margin)
    : minimum;
  return {
    x: point.x + (direction === 'left' ? -distance : direction === 'right' ? distance : 0),
    y: point.y + (direction === 'up' ? -distance : direction === 'down' ? distance : 0)
  };
}

/** Open interiors: a terminal on the edge of its device is a valid endpoint. */
export function wireSegmentCrossesObstacle(a: Point, b: Point, rect: WiringObstacle): boolean {
  if (a.x === b.x)
    return a.x > rect.x && a.x < rect.x + rect.width &&
      Math.max(a.y, b.y) > rect.y && Math.min(a.y, b.y) < rect.y + rect.height;
  if (a.y === b.y)
    return a.y > rect.y && a.y < rect.y + rect.height &&
      Math.max(a.x, b.x) > rect.x && Math.min(a.x, b.x) < rect.x + rect.width;
  return false;
}

function hasReversal(points: Point[]): boolean {
  return points.some((point, index) => {
    if (!index || index === points.length - 1) return false;
    const before = points[index - 1], after = points[index + 1];
    return (point.x - before.x) * (after.x - point.x) +
      (point.y - before.y) * (after.y - point.y) < 0;
  });
}

/** Side-aware drawing geometry only; never changes connections or saved route points. */
export function automaticWireRoute(
  from: RoutingTerminal,
  to: RoutingTerminal,
  obstacles: WiringObstacle[],
  wireId: string
): Point[] {
  // Stable spacing: deleting another wire must not move this wire's corridor.
  let hash = 0;
  for (const char of wireId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const clearance = 24 + (hash % 6) * 5;
  const a = escape(from, clearance, obstacles), b = escape(to, clearance, obstacles);
  const left = Math.min(a.x, b.x, ...obstacles.map((rect) => rect.x)) - clearance;
  const right = Math.max(a.x, b.x, ...obstacles.map((rect) => rect.x + rect.width)) + clearance;
  const midY = (a.y + b.y) / 2, midX = (a.x + b.x) / 2;
  const candidates = [
    [a, { x: a.x, y: b.y }, b],
    [a, { x: b.x, y: a.y }, b],
    [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b],
    [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b],
    [a, { x: left, y: a.y }, { x: left, y: b.y }, b],
    [a, { x: right, y: a.y }, { x: right, y: b.y }, b]
  ].map((middle) => simplify([from.point, ...middle, to.point]));
  const score = (points: Point[]) => {
    let crossings = 0, length = 0;
    for (let index = 1; index < points.length; index++) {
      const p = points[index - 1], q = points[index];
      crossings += obstacles.filter((rect) => wireSegmentCrossesObstacle(p, q, rect)).length;
      length += Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
    }
    const forward = JSON.stringify(points), reverse = JSON.stringify([...points].reverse());
    return { points, crossings, reversal: hasReversal(points), length, key: forward < reverse ? forward : reverse };
  };
  const ranked = candidates.map(score).sort((a, b) =>
    a.crossings - b.crossings || Number(a.reversal) - Number(b.reversal) ||
    a.length - b.length || a.points.length - b.points.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
  // Overlapping user-placed objects can make a collision-free path impossible.
  return ranked[0].points;
}
