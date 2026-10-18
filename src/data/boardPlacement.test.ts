import { describe, expect, it } from 'vitest';
import { makeDevice } from '../catalog';
import { decodeProject, encodeProject } from './archive';
import { getBoardDevices } from './boardConnections';
import { getAvailableBoardDevices, getBoardIssues, placeBoardDevice } from './boardPlacement';
import { createProject } from './project';

function fixture() {
  const document = createProject();
  document.data.devices = Array.from({ length: 3 }, (_, index) => ({ ...makeDevice('breaker', []), id: `d${index}`, code: `QF${index + 1}`, moduleWidth: index === 2 ? 0.5 : 1 }));
  document.data.boards = [
    { id: 'a', name: 'A', rows: [{ id: 'a1', name: 'A1', capacity: 2, placements: [{ deviceId: 'd0', start: 0 }] }, { id: 'a2', name: 'A2', capacity: 2, placements: [] }], connections: [{ id: 'feed', toDeviceId: 'd0' }] },
    { id: 'b', name: 'B', rows: [{ id: 'b1', name: 'B1', capacity: 2, placements: [{ deviceId: 'd1', start: 0 }] }] },
  ];
  document.data.devices[0].boardId = 'a'; document.data.devices[1].boardId = 'b';
  return document;
}

describe('physical board placement ownership', () => {
  it('excludes devices already placed in any board from the add list', () => {
    const { data } = fixture();
    data.devices.push({ ...makeDevice('light', []), id: 'floor' });
    expect(getAvailableBoardDevices(data).map(device => device.id)).toEqual(['d2']);
  });

  it('refuses a second physical board through the shared handler without changing either board or graph', () => {
    const { data } = fixture(); const before = structuredClone(data);
    expect(() => placeBoardDevice(data, 'b', 'b1', 'd0')).toThrow('Előbb vedd le');
    expect(data).toEqual(before);
  });

  it('moves within the same board, keeps half-module snapping and retains every electrical link', () => {
    const { data } = fixture(); const next = placeBoardDevice(data, 'a', 'a2', 'd0', 0.74);
    expect(next.boards[0].rows[0].placements).toEqual([]);
    expect(next.boards[0].rows[1].placements).toEqual([{ deviceId: 'd0', start: 0.5 }]);
    expect(next.devices[0].boardId).toBe('a');
    expect(next.boards[0].connections).toEqual(data.boards[0].connections);
    expect(data.boards[0].rows[0].placements).toHaveLength(1);
  });

  it('assigns an unplaced device to the new board after explicit rail removal, preserving old graph endpoints', async () => {
    const document = fixture();
    document.data.boards[0].rows[0].placements = [];
    expect(getAvailableBoardDevices(document.data).map(device => device.id)).toEqual(['d0', 'd2']);
    const next = placeBoardDevice(document.data, 'b', 'b1', 'd0');
    expect(next.devices[0].boardId).toBe('b');
    expect(next.boards[0].connections).toEqual([{ id: 'feed', toDeviceId: 'd0' }]);
    expect(getBoardDevices(next.boards[0], next.devices).map(device => device.id)).toContain('d0');
    expect(next.boards[1].rows[0].placements).toContainEqual({ deviceId: 'd0', start: 1 });
    const loaded = await decodeProject(await encodeProject({ ...document, data: next }));
    expect(loaded.data).toEqual(next);
  });

  it('uses the first free half-module slot and retains overcapacity reporting when no slot fits', () => {
    const { data } = fixture();
    const half = placeBoardDevice(data, 'a', 'a1', 'd2');
    expect(half.boards[0].rows[0].placements).toContainEqual({ deviceId: 'd2', start: 1 });
    data.devices[0].moduleWidth = 2;
    const full = placeBoardDevice(data, 'a', 'a1', 'd2');
    expect(full.boards[0].rows[0].placements).toContainEqual({ deviceId: 'd2', start: 2 });
    expect(getBoardIssues(full.boards[0], full.devices).some(issue => issue.deviceId === 'd2' && issue.message.includes('túllóg'))).toBe(true);
  });

  it('keeps explicit collision positions and rejects missing targets and non-finite input', () => {
    const { data } = fixture();
    const overlap = placeBoardDevice(data, 'a', 'a1', 'd2', 0);
    expect(getBoardIssues(overlap.boards[0], overlap.devices).some(issue => issue.message.includes('ütköző'))).toBe(true);
    expect(() => placeBoardDevice(data, 'missing', 'a1', 'd2')).toThrow();
    expect(() => placeBoardDevice(data, 'a', 'missing', 'd2')).toThrow();
    expect(() => placeBoardDevice(data, 'a', 'a1', 'missing')).toThrow();
    expect(() => placeBoardDevice(data, 'a', 'a1', 'd2', NaN)).toThrow();
  });

  it('packs manufacturer fractional widths without rounding into the preceding module', () => {
    const { data } = fixture(); data.devices[0].moduleWidth = 0.75;
    const placed = placeBoardDevice(data, 'a', 'a1', 'd2');
    expect(placed.boards[0].rows[0].placements).toContainEqual({ deviceId: 'd2', start: 0.75 });
    expect(getBoardIssues(placed.boards[0], placed.devices)).toEqual([]);
  });
});
