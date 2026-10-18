import { makeDevice, uid } from '../catalog';
import { checkpoint, createProject } from '../data/project';
import { t } from '../i18n';
import type { Board, Circuit, DeviceKind, ProjectDocument } from '../types';
import { importLegacyBoardV3 } from './legacyBoardV3';

type RecordValue = Record<string, unknown>;
type LegacyType = 'supply' | 'main' | 'mcb' | 'rccb' | 'rcbo' | 'spd' | 'contactor' | 'meter';
type Pole = '1P' | '1P+N' | '2P' | '3P' | '3P+N' | '4P';
interface Component {
  id: string; type: LegacyType; row: number; x: number; poles: Pole;
  rating?: number; curve?: string; sens?: number; rtype?: string; name?: string;
  cable?: string; loadType?: string; power?: number | ''; cls?: string;
}
interface Endpoint { c: string; s: 'top' | 'bottom' }
interface Wire { id: string; a: Endpoint; b: Endpoint }
interface LegacyBoard {
  v: 2; project: { name: string; author?: string; date?: string };
  rows: { mods: number }[]; comps: Component[]; wires: Wire[]; nid?: number;
}

const definitions: Record<LegacyType, { kind: DeviceKind; prefix: string; label: string }> = {
  supply: { kind: 'custom', prefix: 'T', label: 'Betáplálás' },
  main: { kind: 'main', prefix: 'Q', label: 'Főkapcsoló' },
  mcb: { kind: 'breaker', prefix: 'F', label: 'Kismegszakító' },
  rccb: { kind: 'rcd', prefix: 'FI', label: 'ÁVK' },
  rcbo: { kind: 'rcbo', prefix: 'F', label: 'ÁVK-kismegszakító' },
  spd: { kind: 'spd', prefix: 'SPD', label: 'Túlfeszültség-védelem' },
  contactor: { kind: 'relay', prefix: 'K', label: 'Kontaktor' },
  meter: { kind: 'custom', prefix: 'WH', label: 'Fogyasztásmérő' },
};
const poleWidths: Record<Pole, number> = { '1P': 1, '1P+N': 2, '2P': 2, '3P': 3, '3P+N': 4, '4P': 4 };
const typeWidths: Partial<Record<LegacyType, Partial<Record<Pole, number>>>> = {
  contactor: { '2P': 2, '4P': 3 }, meter: { '1P+N': 4, '3P+N': 6 },
};
const colors = ['#376fd0', '#d59a28', '#9e68bc', '#19998b', '#ce6986', '#64748b'];

function fail(message: string): never { throw new Error(t('Érvénytelen elosztó JSON: {message}', { message })); }
function record(value: unknown, path: string): asserts value is RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(t('{path}: objektum szükséges.', { path }));
}
function keys(value: RecordValue, allowed: readonly string[], path: string) {
  const unknown = Object.keys(value).find(key => !allowed.includes(key));
  if (unknown) fail(t('{path}: nem támogatott mező ({field}); az import megszakadt az adatvesztés elkerülésére.', { path, field: unknown }));
}
function text(value: unknown, path: string, max = 1000): asserts value is string {
  if (typeof value !== 'string' || value.length > max) fail(t('{path}: hibás vagy túl hosszú szöveg.', { path }));
}
function optionalText(value: unknown, path: string, max = 1000) { if (value !== undefined) text(value, path, max); }
function id(value: unknown, path: string): asserts value is string {
  text(value, path, 200);
  if (!value.trim() || /[\u0000-\u001f\u007f]/.test(value)) fail(t('{path}: hibás azonosító.', { path }));
}
function number(value: unknown, path: string, min: number, max: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(t('{path}: hibás vagy határon kívüli szám.', { path }));
}
function list(value: unknown, path: string, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(t('{path}: hibás vagy túl hosszú lista.', { path }));
}
function unique(value: unknown[], path: string): Set<string> {
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    record(entry, `${path}[${index}]`); id(entry.id, `${path}[${index}].id`);
    if (ids.has(entry.id)) fail(t('{path}: ismétlődő azonosító ({id}).', { path, id: entry.id }));
    ids.add(entry.id);
  });
  return ids;
}
function endpoint(value: unknown, path: string, deviceIds: Set<string>) {
  record(value, path); keys(value, ['c', 's'], path); id(value.c, `${path}.c`);
  if (!deviceIds.has(value.c)) fail(t('{path}: hiányzó készülék ({id}).', { path, id: value.c }));
  if (value.s !== 'top' && value.s !== 'bottom') fail(t('{path}: ismeretlen kapocsoldal.', { path }));
}
function validate(value: unknown): asserts value is LegacyBoard {
  record(value, 'JSON'); keys(value, ['v', 'project', 'rows', 'comps', 'wires', 'nid'], 'JSON');
  if (value.v !== 2) fail(t('Csak az elosztótervező 2-es JSON-változata támogatott.'));
  record(value.project, 'project'); keys(value.project, ['name', 'author', 'date'], 'project');
  text(value.project.name, 'project.name'); optionalText(value.project.author, 'project.author'); optionalText(value.project.date, 'project.date', 100);
  if (value.nid !== undefined) {
    number(value.nid, 'nid', 0, Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(value.nid)) fail(t('nid: egész számláló szükséges.'));
  }
  list(value.rows, 'rows', 1000);
  if (!value.rows.length) fail(t('Legalább egy elosztósor szükséges.'));
  value.rows.forEach((row, index) => {
    const path = `rows[${index}]`; record(row, path); keys(row, ['mods'], path);
    number(row.mods, `${path}.mods`, 1, 100_000);
    if (!Number.isInteger(row.mods)) fail(t('{path}: egész modulkapacitás szükséges.', { path }));
  });
  list(value.comps, 'comps', 20_000); const ids = unique(value.comps, 'comps');
  const rowCount = value.rows.length;
  value.comps.forEach((entry, index) => {
    const path = `comps[${index}]`; record(entry, path);
    keys(entry, ['id', 'type', 'row', 'x', 'poles', 'rating', 'curve', 'sens', 'rtype', 'name', 'cable', 'loadType', 'power', 'cls'], path);
    if (typeof entry.type !== 'string' || !Object.hasOwn(definitions, entry.type)) fail(t('{path}: ismeretlen készüléktípus.', { path }));
    if (typeof entry.poles !== 'string' || !Object.hasOwn(poleWidths, entry.poles)) fail(t('{path}: ismeretlen pólusszám.', { path }));
    number(entry.row, `${path}.row`, 0, rowCount - 1);
    if (!Number.isInteger(entry.row)) fail(t('{path}: egész sorindex szükséges.', { path }));
    // Preserve collisions and overhangs for the editor's normal issue reporting.
    number(entry.x, `${path}.x`, -100_000, 100_000);
    for (const key of ['rating', 'sens']) if (entry[key] !== undefined) number(entry[key], `${path}.${key}`, 0, 1_000_000);
    for (const key of ['curve', 'rtype', 'loadType', 'cls']) optionalText(entry[key], `${path}.${key}`, 100);
    for (const key of ['name', 'cable']) optionalText(entry[key], `${path}.${key}`);
    if (entry.power !== undefined && entry.power !== '') number(entry.power, `${path}.power`, 0, 1_000_000_000);
  });
  list(value.wires, 'wires', 20_000); unique(value.wires, 'wires');
  value.wires.forEach((wire, index) => {
    const path = `wires[${index}]`; record(wire, path); keys(wire, ['id', 'a', 'b'], path);
    endpoint(wire.a, `${path}.a`, ids); endpoint(wire.b, `${path}.b`, ids);
  });
}

/** Recognition is separate from validation, so malformed supported files receive the right error. */
export function isLegacyBoard(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && [2, 3].includes((value as RecordValue).v as number)
    && ['rows', 'comps', 'wires'].some(key => Object.hasOwn(value, key));
}

/** Imports only inert JSON data. The original HTML is never evaluated or embedded. */
export function importLegacyBoard(value: unknown): ProjectDocument {
  if (value && typeof value === 'object' && !Array.isArray(value) && (value as RecordValue).v === 3) return importLegacyBoardV3(value);
  validate(value);
  const doc = createProject(value.project.name);
  const board: Board = {
    id: uid(), name: value.project.name || t('Importált elosztó'),
    rows: value.rows.map((row, index) => ({ id: uid(), name: t('{number}. sor', { number: index + 1 }), capacity: row.mods, placements: [] })),
    connections: [],
  };
  doc.data.boards = [board];
  const mapped = new Map(value.comps.map(component => [component.id, uid()]));
  const codes = new Map<string, string>(); const counters = new Map<string, number>();
  [...value.comps].sort((a, b) => a.row - b.row || a.x - b.x).forEach(component => {
    const prefix = definitions[component.type].prefix;
    const count = (counters.get(prefix) ?? 0) + 1; counters.set(prefix, count); codes.set(component.id, `${prefix}${count}`);
  });
  for (const component of value.comps) {
    const def = definitions[component.type]; const hasLoad = ['mcb', 'rcbo', 'contactor'].includes(component.type);
    const device = makeDevice(def.kind, doc.data.devices);
    device.id = mapped.get(component.id)!; device.code = codes.get(component.id)!;
    device.name = component.name ?? t(def.label); device.boardId = board.id;
    device.moduleWidth = typeWidths[component.type]?.[component.poles] ?? poleWidths[component.poles];
    const rating = component.rating === undefined ? '' : `${component.curve ?? ''}${component.rating} A`;
    device.rating = [component.poles, rating, component.sens === undefined ? '' : `${component.sens} mA`, component.rtype, component.cls].filter(Boolean).join(' · ');
    const notes = [
      t('Elosztó JSON v2 import. Eredeti típus: {type}; pólusszám: {poles}; azonosító: {id}.', { type: component.type, poles: component.poles, id: component.id }),
      t('Az importált {width} M modulszélesség a régi általános rajzjeleket követi; gyártói adattal nem ellenőrzött.', { width: device.moduleWidth }),
      // Keep all values, even unexpected known fields, instead of silently discarding them.
      component.curve !== undefined ? t('Eredeti kioldási jelleg: {value}', { value: component.curve }) : '',
      component.rtype !== undefined ? t('Eredeti ÁVK-típus: {value}', { value: component.rtype }) : '',
      component.cls !== undefined ? t('Eredeti túlfeszültség-védelmi osztály: {value}', { value: component.cls }) : '',
      component.cable !== undefined ? t('Importált kábel: {value}', { value: component.cable }) : '',
      component.loadType !== undefined ? t('Eredeti fogyasztójel: {value}', { value: component.loadType }) : '',
      component.power !== undefined && component.power !== '' ? t('Importált teljesítmény: {power} W', { power: component.power }) : '',
    ];
    device.notes = notes.filter(Boolean).join('\n');
    if (hasLoad) {
      const circuitId = uid(); device.circuitId = circuitId;
      doc.data.circuits.push({
        id: circuitId, code: device.code, name: device.name, color: colors[doc.data.circuits.length % colors.length],
        ...(component.type === 'mcb' || component.type === 'rcbo' ? { protectionDeviceId: device.id } : {}),
        ...(component.cable !== undefined ? { cable: component.cable } : {}),
        ...(typeof component.power === 'number' ? { powerW: component.power } : {}),
        ...(['socket', 'lamp', 'motor', 'other'].includes(component.loadType ?? '') ? { loadType: component.loadType as Circuit['loadType'] } : {}),
        notes: component.loadType === undefined ? '' : t('Eredeti fogyasztójel: {value}', { value: component.loadType }),
      });
    }
    doc.data.devices.push(device);
    board.rows[component.row].placements.push({ deviceId: device.id, start: component.x });
  }
  const ambiguous: string[] = [];
  for (const wire of value.wires) {
    // Only bottom -> top establishes an explicit direction in the source.
    const reversed = wire.a.s === 'top' && wire.b.s === 'bottom';
    const from = reversed ? wire.b : wire.a; const to = reversed ? wire.a : wire.b;
    board.connections!.push({ id: uid(), fromDeviceId: mapped.get(from.c)!, toDeviceId: mapped.get(to.c)! });
    if (wire.a.s === wire.b.s) ambiguous.push(`${wire.id}: ${codes.get(wire.a.c)} (${wire.a.c}, ${wire.a.s}) → ${codes.get(wire.b.c)} (${wire.b.c}, ${wire.b.s})`);
  }
  const notes = [
    t('Elosztó JSON v2 import. A készülékek, sorpozíciók és kapcsolatok átvételre kerültek. A modulszélességek általános rajzjelekből származnak, nem gyártói termékadatok.'),
    value.project.author !== undefined ? t('Eredeti terv szerzője: {author}', { author: value.project.author }) : '',
    value.project.date !== undefined ? t('Eredeti terv dátuma: {date}', { date: value.project.date }) : '',
    ambiguous.length ? t('Kétértelmű kapocsoldalak: az alábbi kapcsolatok iránya a forrás a→b sorrendjét őrzi; a betáplálási irányt ellenőrizni kell.\n{connections}', { connections: ambiguous.join('\n') }) : '',
  ];
  doc.data.notes = notes.filter(Boolean).join('\n');
  if (doc.data.notes.length > 100_000) fail(t('Az importált megjegyzések túl hosszúak; az eredeti adatok nem kerültek csonkolásra.'));
  // nid only allocated future IDs in the old editor; all imported entities now use fresh stable IDs.
  return checkpoint(doc, t('Elosztó JSON v2 importálása'));
}
