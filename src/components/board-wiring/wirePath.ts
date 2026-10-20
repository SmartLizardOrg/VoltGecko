import type { Point } from '../../types';

/** Round only the visible stroke; stored bends and terminal coordinates stay exact. */
export function roundedWirePath(points: Point[], radius = 5): string {
  const distinct = points.filter((point, index) => !index || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  if (!distinct.length) return '';
  let path = `M ${distinct[0].x} ${distinct[0].y}`;
  for (let index = 1; index < distinct.length - 1; index++) {
    const a = distinct[index - 1], b = distinct[index], c = distinct[index + 1];
    const incoming = Math.hypot(b.x - a.x, b.y - a.y), outgoing = Math.hypot(c.x - b.x, c.y - b.y);
    const bend = Math.min(Math.max(0, radius), incoming / 2, outgoing / 2);
    if (!bend || Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) < 1e-6) {
      path += ` L ${b.x} ${b.y}`;
      continue;
    }
    const before = { x: b.x + (a.x - b.x) * bend / incoming, y: b.y + (a.y - b.y) * bend / incoming };
    const after = { x: b.x + (c.x - b.x) * bend / outgoing, y: b.y + (c.y - b.y) * bend / outgoing };
    path += ` L ${before.x} ${before.y} Q ${b.x} ${b.y} ${after.x} ${after.y}`;
  }
  if (distinct.length > 1) path += ` L ${distinct.at(-1)!.x} ${distinct.at(-1)!.y}`;
  return path;
}
