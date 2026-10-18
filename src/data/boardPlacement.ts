import { t } from '../i18n';
import type { Device, ProjectData } from '../types';

/** A physical device may occupy a DIN row in one board at a time. */
export function getAvailableBoardDevices(data: ProjectData): Device[] {
  const placed = new Set(data.boards.flatMap(board => board.rows.flatMap(row => row.placements.map(placement => placement.deviceId))));
  return data.devices.filter(device => device.moduleWidth !== undefined && !placed.has(device.id));
}

/** Moving within a board preserves every electrical connection, including imported links. */
export function placeBoardDevice(data: ProjectData, boardId: string, rowId: string, deviceId: string, start?: number): ProjectData {
  const board = data.boards.find(candidate => candidate.id === boardId);
  if (!board) throw new Error(t('Az elosztó nem található.'));
  if (!board.rows.some(row => row.id === rowId)) throw new Error(t('Az elosztósor nem található.'));
  const device = data.devices.find(candidate => candidate.id === deviceId);
  if (!device) throw new Error(t('A készülék nem található.'));
  const occupiedBoard = data.boards.find(candidate => candidate.id !== boardId && candidate.rows.some(row => row.placements.some(placement => placement.deviceId === deviceId)));
  if (occupiedBoard) throw new Error(t('{code} már a(z) {board} elosztóban van. Előbb vedd le az ottani sínről.', { code: device.code, board: occupiedBoard.name }));
  if (start !== undefined && !Number.isFinite(start)) throw new Error(t('A kezdő modulhely érvénytelen.'));

  const next = structuredClone(data);
  const target = next.boards.find(candidate => candidate.id === boardId)!;
  for (const row of target.rows) row.placements = row.placements.filter(placement => placement.deviceId !== deviceId);
  const row = target.rows.find(candidate => candidate.id === rowId)!;
  const width = device.moduleWidth ?? 1;
  let slot = start ?? 0;
  if (start === undefined) {
    const occupied = row.placements.map(placement => ({ start: placement.start, end: placement.start + (data.devices.find(candidate => candidate.id === placement.deviceId)?.moduleWidth ?? 1) }))
      .filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start);
    // Manufacturer widths and imported positions may be fractional beyond 0.5 M.
    // Free-space search must retain those boundaries instead of rounding into a neighbour.
    const candidates = [...new Set([0, ...occupied.map(item => Math.max(0, item.end))])].sort((a, b) => a - b);
    slot = candidates.find(candidate => candidate + width <= row.capacity + 1e-8 && !occupied.some(item => candidate < item.end - 1e-8 && item.start < candidate + width - 1e-8))
      ?? Math.max(0, ...occupied.map(item => item.end));
  }
  // Explicit dragging keeps half-module snapping; automatic packing keeps exact widths.
  row.placements.push({ deviceId, start: Math.max(0, start === undefined ? slot : Math.round(slot * 2) / 2) });
  next.devices.find(candidate => candidate.id === deviceId)!.boardId = boardId;
  return next;
}
