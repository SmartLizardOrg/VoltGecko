import type { PlanSheet, Point } from '../types';

/** Move a placement and its connected route ends, retaining adjacent right-angle bends. */
export function moveSheetDevice(sheet: PlanSheet, deviceId: string, point: Point): PlanSheet {
  const original = sheet.placements.find((placement) => placement.deviceId === deviceId);
  if (!original) return sheet;
  return {
    ...sheet,
    placements: sheet.placements.map((placement) =>
      placement.deviceId === deviceId ? { ...placement, ...point } : placement
    ),
    routes: sheet.routes.map((route) => {
      if ((route.fromDeviceId !== deviceId && route.toDeviceId !== deviceId) || !route.points.length) return route;
      const points = route.points.map((item) => ({ ...item }));
      const index = route.fromDeviceId === deviceId ? 0 : points.length - 1;
      const adjacent = points[index === 0 ? 1 : index - 1];
      // In a two-point route the adjacent point belongs to the opposite device.
      if (points.length > 2 && adjacent) {
        if (Math.abs(adjacent.y - original.y) < 0.5) adjacent.y = point.y;
        else if (Math.abs(adjacent.x - original.x) < 0.5) adjacent.x = point.x;
      }
      points[index] = { ...point };
      return { ...route, points };
    })
  };
}
