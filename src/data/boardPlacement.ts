import { t } from '../i18n';
import { CATALOG } from '../catalog';
import type { Board, BoardRow, Device, ProjectData } from '../types';

/** Exact first fit: manufacturer widths need not be multiples of half a module. */
export function findFreeBoardSlot(
  row: BoardRow,
  devices: ReadonlyMap<string, Device>,
  width: number
): number | undefined {
  if (!Number.isFinite(row.capacity) || row.capacity <= 0 || !Number.isFinite(width) || width <= 0) return undefined;
  const occupied = row.placements.map((placement) => {
    const device = devices.get(placement.deviceId);
    const size = device?.moduleWidth ?? CATALOG.find((item) => item.kind === device?.kind)?.moduleWidth;
    return { start: placement.start, width: size };
  });
  // Unknown geometry cannot establish that a slot is free.
  if (
    occupied.some(
      (item) => !Number.isFinite(item.start) || item.start < 0 || !Number.isFinite(item.width) || item.width! <= 0
    )
  )
    return undefined;
  let start = 0;
  for (const other of occupied.sort((a, b) => a.start - b.start)) {
    if (start + width <= other.start + 1e-8) break;
    start = Math.max(start, other.start + other.width!);
  }
  return start + width <= row.capacity + 1e-8 ? start : undefined;
}

export interface BoardIssue {
  rowId: string;
  deviceId?: string;
  message: string;
}

export function getBoardIssues(board: Board, devices: Device[]): BoardIssue[] {
  // Imported generic geometry is rounded to six decimal module places.
  const epsilon = 1e-6;
  const result: BoardIssue[] = [];
  const lookup = new Map(devices.map((device) => [device.id, device]));
  const placed = new Set<string>();
  for (const row of board.rows) {
    if (!Number.isFinite(row.capacity) || row.capacity <= 0) {
      result.push({ rowId: row.id, message: t('{name}: a sor kapacitása legyen pozitív.', { name: row.name }) });
    }
    const occupied: { start: number; end: number; deviceId: string; code: string }[] = [];
    for (const placement of row.placements) {
      const device = lookup.get(placement.deviceId);
      if (!device) {
        result.push({
          rowId: row.id,
          deviceId: placement.deviceId,
          message: t('A sor egy már nem létező készülékre hivatkozik.')
        });
        continue;
      }
      if (placed.has(device.id))
        result.push({
          rowId: row.id,
          deviceId: device.id,
          message: t('{code}: többször szerepel az elosztóban.', { code: device.code })
        });
      placed.add(device.id);
      const width = device.moduleWidth ?? CATALOG.find((item) => item.kind === device.kind)?.moduleWidth ?? 1;
      if (!Number.isFinite(width) || width <= 0) {
        result.push({
          rowId: row.id,
          deviceId: device.id,
          message: t('{code}: a modulszélesség legyen pozitív.', { code: device.code })
        });
        continue;
      }
      if (!Number.isFinite(placement.start) || placement.start < 0) {
        result.push({
          rowId: row.id,
          deviceId: device.id,
          message: t('{code}: érvénytelen kezdőpozíció.', { code: device.code })
        });
        continue;
      }
      const end = placement.start + width;
      if (end > row.capacity + epsilon) {
        result.push({
          rowId: row.id,
          deviceId: device.id,
          message: t('{code}: túllóg a sor {capacity} modulos kapacitásán.', {
            code: device.code,
            capacity: row.capacity
          })
        });
      }
      for (const other of occupied) {
        if (placement.start < other.end - epsilon && end > other.start + epsilon) {
          result.push({
            rowId: row.id,
            deviceId: device.id,
            message: t('{code} és {other}: ütköző modulfoglalás.', { code: device.code, other: other.code })
          });
        }
      }
      occupied.push({ start: placement.start, end, deviceId: device.id, code: device.code });
    }
  }
  return result;
}

/** A physical device may occupy a DIN row in one board at a time. */
export function getAvailableBoardDevices(data: ProjectData): Device[] {
  const placed = new Set(
    data.boards.flatMap((board) => board.rows.flatMap((row) => row.placements.map((placement) => placement.deviceId)))
  );
  return data.devices.filter((device) => device.moduleWidth !== undefined && !placed.has(device.id));
}

/** Moving within a board preserves every electrical connection, including imported links. */
export function placeBoardDevice(
  data: ProjectData,
  boardId: string,
  rowId: string,
  deviceId: string,
  start?: number
): ProjectData {
  const board = data.boards.find((candidate) => candidate.id === boardId);
  if (!board) throw new Error(t('Az elosztó nem található.'));
  if (!board.rows.some((row) => row.id === rowId)) throw new Error(t('Az elosztósor nem található.'));
  const device = data.devices.find((candidate) => candidate.id === deviceId);
  if (!device) throw new Error(t('A készülék nem található.'));
  const occupiedBoard = data.boards.find(
    (candidate) =>
      candidate.id !== boardId &&
      candidate.rows.some((row) => row.placements.some((placement) => placement.deviceId === deviceId))
  );
  if (occupiedBoard)
    throw new Error(
      t('{code} már a(z) {board} elosztóban van. Előbb vedd le az ottani sínről.', {
        code: device.code,
        board: occupiedBoard.name
      })
    );
  if (start !== undefined && !Number.isFinite(start)) throw new Error(t('A kezdő modulhely érvénytelen.'));

  const next = structuredClone(data);
  const target = next.boards.find((candidate) => candidate.id === boardId)!;
  for (const row of target.rows) row.placements = row.placements.filter((placement) => placement.deviceId !== deviceId);
  const row = target.rows.find((candidate) => candidate.id === rowId)!;
  const width = device.moduleWidth ?? 1;
  let slot = start ?? 0;
  if (start === undefined) {
    const devices = new Map(data.devices.map((candidate) => [candidate.id, candidate]));
    // Manual placement can exceed capacity; the existing layout checks report it.
    slot =
      findFreeBoardSlot(row, devices, width) ??
      Math.max(
        0,
        ...row.placements
          .map((placement) => placement.start + (devices.get(placement.deviceId)?.moduleWidth ?? 1))
          .filter(Number.isFinite)
      );
  }
  // Explicit dragging keeps half-module snapping; automatic packing keeps exact widths.
  row.placements.push({ deviceId, start: Math.max(0, start === undefined ? slot : Math.round(slot * 2) / 2) });
  next.devices.find((candidate) => candidate.id === deviceId)!.boardId = boardId;
  return next;
}
