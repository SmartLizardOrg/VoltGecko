import { describe, expect, it } from 'vitest';
import type { PlanSheet, Point } from '../types';
import { moveSheetDevice } from './floorPlan';

function sheet(points: Point[]): PlanSheet {
  return {
    id: 'sheet',
    name: 'Sheet',
    width: 500,
    height: 500,
    annotations: [],
    placements: [
      { deviceId: 'from', x: 0, y: 0, rotation: 0 },
      { deviceId: 'to', x: 100, y: 0, rotation: 0 }
    ],
    routes: [{ id: 'route', fromDeviceId: 'from', toDeviceId: 'to', kind: 'power', points }]
  };
}

describe('floor-plan device movement', () => {
  it.each(['from', 'to'])('preserves the opposite device endpoint of a two-point route when moving %s', (deviceId) => {
    const original = sheet([
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ]);
    const before = structuredClone(original);
    const moved = moveSheetDevice(original, deviceId, { x: 30, y: 40 });
    expect(moved.placements.find((placement) => placement.deviceId === deviceId)).toMatchObject({ x: 30, y: 40 });
    expect(moved.routes[0].points).toEqual(
      deviceId === 'from'
        ? [
            { x: 30, y: 40 },
            { x: 100, y: 0 }
          ]
        : [
            { x: 0, y: 0 },
            { x: 30, y: 40 }
          ]
    );
    expect(original).toEqual(before);
  });

  it('moves the adjacent bend to retain the route end alignment without moving the far endpoint', () => {
    const original = sheet([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
      { x: 100, y: 100 }
    ]);
    const moved = moveSheetDevice(original, 'from', { x: 10, y: 20 });
    expect(moved.routes[0].points).toEqual([
      { x: 10, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 100 },
      { x: 100, y: 100 }
    ]);
  });
});
