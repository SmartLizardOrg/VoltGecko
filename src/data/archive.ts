import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { uid } from '../catalog';
import { APP, stripProjectExtension } from '../config';
import { t } from '../i18n';
import type { Asset, ProjectDocument } from '../types';
import { effectiveDevicePoles } from './boardWiring';
import type { Device } from '../types';

// Limits are checked before ZIP extraction as well as after JSON parsing.
// Files are read in memory on phones, so failures should be explicit and early.
export const ARCHIVE_LIMITS = {
  archiveBytes: 200 * 1024 * 1024,
  expandedBytes: 300 * 1024 * 1024,
  assetBytes: 40 * 1024 * 1024,
  jsonBytes: 30 * 1024 * 1024,
  entries: 2001,
} as const;

type JsonObject = Record<string, unknown>;
const kinds = new Set(['outlet', 'switch', 'light', 'junction', 'sensor', 'relay', 'hub', 'breaker', 'rcd', 'rcbo', 'spd', 'main', 'blank', 'custom']);
const statuses = new Set(['planned', 'installed', 'verified']);
const assetMimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml', 'application/pdf']);
function fail(message: string): never { throw new Error(t('Érvénytelen projektfájl: {message}', { message: t(message) })); }
function object(value: unknown, label: string): asserts value is JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(t('{label} nem objektum.', { label: t(label) }));
}
function array(value: unknown, label: string, limit = 20_000): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > limit) fail(t('{label} hibás vagy túl hosszú lista.', { label: t(label) }));
}
function text(value: unknown, label: string, limit = 100_000): asserts value is string {
  if (typeof value !== 'string' || value.length > limit) fail(t('{label} hibás szöveg.', { label: t(label) }));
}
function identifier(value: unknown, label: string): asserts value is string {
  text(value, label, 200);
  if (!value.trim()) fail(t('{label} üres azonosító.', { label: t(label) }));
}
function finite(value: unknown, label: string, max = 1_000_000_000): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > max) fail(t('{label} hibás szám.', { label: t(label) }));
}
function optionalId(value: unknown, label: string) { if (value !== undefined) identifier(value, label); }
function timestamp(value: unknown, label: string): asserts value is string {
  text(value, label, 60);
  if (!Number.isFinite(Date.parse(value))) fail(t('{label} hibás dátum.', { label: t(label) }));
}
function uniqueIds(values: unknown[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    object(value, label); identifier(value.id, label);
    if (ids.has(value.id)) fail(t('{label}: ismétlődő azonosító ({id}).', { label: t(label), id: value.id }));
    ids.add(value.id);
  }
  return ids;
}
function reference(value: unknown, ids: ReadonlySet<string> | ReadonlyMap<string, unknown>, label: string, optional = false) {
  if (value === undefined && optional) return;
  identifier(value, label);
  if (!ids.has(value)) fail(t('{label}: hiányzó hivatkozás ({id}).', { label: t(label), id: value }));
}
function point(value: JsonObject, label: string) { finite(value.x, `${t(label)}.x`); finite(value.y, `${t(label)}.y`); }

const conductors = new Set(['L', 'L1', 'L2', 'L3', 'N', 'PE', 'PEN']);
function positive(value: unknown, label: string, max = 1_000_000_000, zero = false): asserts value is number {
  finite(value, label, max);
  if (zero ? value < 0 : value <= 0) fail('a villamos adat a megengedett tartományon kívül esik.');
}
function poles(value: unknown) {
  array(value, 'Készülékpólusok', 64);
  for (const conductor of value) if (typeof conductor !== 'string' || !conductors.has(conductor)) fail('ismeretlen vezetőfunkció.');
}
function cableDetails(value: unknown) {
  if (value === undefined) return;
  object(value, 'Kábeladatok');
  if (value.designation !== undefined) text(value.designation, 'Kábel megnevezése', 5000);
  if (value.cores !== undefined) { positive(value.cores, 'Érszám', 1000); if (!Number.isInteger(value.cores)) fail('az érszám pozitív egész szám legyen.'); }
  for (const key of ['crossSectionMm2', 'resistanceOhmPerKm']) if (value[key] !== undefined) positive(value[key], 'Kábeladatok', 1_000_000);
  if (value.lengthM !== undefined) positive(value.lengthM, 'Kábelhossz', 10_000_000, true);
  if (value.material !== undefined && value.material !== 'Cu' && value.material !== 'Al') fail('ismeretlen kábelanyag.');
}
/** Retained source metadata is plain bounded JSON, never executable state. */
function passiveJson(value: unknown, label: string) {
  object(value, label);
  let nodes = 0;
  const walk = (item: unknown, depth: number) => {
    if (++nodes > 100_000 || depth > 30) fail('a megőrzött forrásadat túl nagy vagy túl mély.');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') { text(item, label); return; }
    if (typeof item === 'number') { finite(item, label, 1e15); return; }
    if (Array.isArray(item)) { array(item, label, 100_000); item.forEach(child => walk(child, depth + 1)); return; }
    object(item, label);
    if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) fail('a megőrzött forrásadat csak egyszerű JSON lehet.');
    for (const [key, child] of Object.entries(item)) { text(key, label, 2000); walk(child, depth + 1); }
  };
  walk(value, 0);
}

function electrical(value: unknown) {
  if (value === undefined) return;
  object(value, 'Villamos adatok'); poles(value.poles);
  if (value.commonPoleGroups !== undefined) {
    array(value.commonPoleGroups, 'Közös kapocscsoportok', 64);
    const grouped = new Set<number>();
    for (const group of value.commonPoleGroups) {
      array(group, 'Közös kapocscsoport', 64);
      if (group.length < 2) fail('egy közös kapocscsoport legalább két kapcsot tartalmazzon.');
      let conductor: unknown;
      for (const index of group) {
        finite(index, 'Kapocsszám', 63);
        if (!Number.isInteger(index) || index < 0 || index >= (value.poles as unknown[]).length || grouped.has(index)) fail('hibás vagy átfedő közös kapocscsoport.');
        grouped.add(index);
        const current = (value.poles as unknown[])[index];
        if (conductor !== undefined && current !== conductor) fail('a közös kapcsok vezetőfunkciója legyen azonos.');
        conductor = current;
      }
    }
  }
  if (value.role !== undefined && !['supply', 'main', 'mcb', 'rccb', 'rcbo', 'spd', 'contactor', 'meter', 'terminal', 'mpcb', 'outlet'].includes(value.role as string)) fail('ismeretlen villamos készülékszerep.');
  if (value.phase !== undefined && !['L1', 'L2', 'L3'].includes(value.phase as string)) fail('ismeretlen fázis.');
  for (const key of ['currentA', 'residualCurrentMa']) if (value[key] !== undefined) positive(value[key], 'Villamos adatok', 1_000_000);
  for (const key of ['curve', 'residualType', 'spdClass', 'group', 'originalId', 'circuitNumbers', 'consumers']) if (value[key] !== undefined) text(value[key], 'Villamos adatok', 20_000);
}

function validateWiring(value: JsonObject, devices: unknown[]) {
  const deviceLookup = new Map(devices.map(item => { object(item, 'Készülék'); return [item.id as string, item] as const; }));
  const busLookup = new Map<string, JsonObject>(), infeedLookup = new Map<string, JsonObject>();
  const boardValues = value.boards as JsonObject[];
  for (const board of boardValues) {
    if (board.wiring === undefined) continue;
    object(board.wiring, 'Huzalozás');
    const wiring = board.wiring;
    array(wiring.buses, 'Sínek', 20_000); array(wiring.infeeds, 'Betáplálások', 1000); array(wiring.wires, 'Vezetékek', 50_000);
    uniqueIds(wiring.wires, 'Vezeték');
    for (const bus of wiring.buses) {
      object(bus, 'Sín'); identifier(bus.id, 'Sínazonosító');
      if (busLookup.has(bus.id)) fail('ismétlődő sínazonosító.'); busLookup.set(bus.id, bus);
      text(bus.name, 'Sín neve', 1000); positive(bus.capacity, 'Sín kapacitása', 10_000);
      if (!Number.isInteger(bus.capacity)) fail('a sín kapacitása pozitív egész szám legyen.');
      if (!conductors.has(bus.conductor as string)) fail('ismeretlen vezetőfunkció.');
      if (bus.position !== 'top' && bus.position !== 'bottom') fail('ismeretlen sínpozíció.');
      if (bus.rowId !== undefined) reference(bus.rowId, new Set((board.rows as JsonObject[]).map(row => row.id as string)), 'Sín sora');
      array(bus.terminalLabels, 'Kapocsfeliratok', 10_000); for (const label of bus.terminalLabels) text(label, 'Kapocsfelirat', 1000);
      if (bus.terminalLabels.length > bus.capacity) fail('több kapocsfelirat van, mint sínkapocs.');
      if (bus.offset !== undefined) { object(bus.offset, 'Sín eltolása'); point(bus.offset, 'Sín eltolása'); }
    }
    for (const infeed of wiring.infeeds) {
      object(infeed, 'Betáplálás'); identifier(infeed.id, 'Betáplálás-azonosító');
      if (infeedLookup.has(infeed.id)) fail('ismétlődő betáplálás-azonosító.'); infeedLookup.set(infeed.id, infeed);
      text(infeed.name, 'Betáplálás neve', 1000); poles(infeed.poles); cableDetails(infeed.cable);
      if (infeed.kind !== 'supply' && infeed.kind !== 'earth') fail('ismeretlen betáplálástípus.');
      for (const key of ['position', 'labelOffset']) if (infeed[key] !== undefined) { object(infeed[key], 'Betáplálás pozíciója'); point(infeed[key], 'Betáplálás pozíciója'); }
    }
    if (wiring.demandFactor !== undefined) { positive(wiring.demandFactor, 'Egyidejűségi tényező', 1, true); }
    if (wiring.labelOffsets !== undefined) { object(wiring.labelOffsets, 'Felirateltolások'); if (Object.keys(wiring.labelOffsets).length > 50_000) fail('túl sok felirateltolás.'); for (const offset of Object.values(wiring.labelOffsets)) { object(offset, 'Felirateltolás'); point(offset, 'Felirateltolás'); } }
    if (wiring.source !== undefined) passiveJson(wiring.source, 'Megőrzött forrásadat');
  }
  const endpoint = (item: unknown) => {
    object(item, 'Vezetékvégpont');
    let count: number;
    if (item.kind === 'device') {
      reference(item.deviceId, deviceLookup, 'Vezetékvégpont készüléke');
      if (item.side !== 'top' && item.side !== 'bottom') fail('ismeretlen készülékoldal.');
      // An unresolved imported whole-device endpoint stays explicitly unresolved.
      if (item.pole === undefined) return;
      count = effectiveDevicePoles(deviceLookup.get(item.deviceId as string) as unknown as Device).length;
    } else if (item.kind === 'bus') {
      reference(item.busId, busLookup, 'Vezetékvégpont sínje');
      count = busLookup.get(item.busId as string)!.capacity as number;
    } else if (item.kind === 'infeed') {
      reference(item.infeedId, infeedLookup, 'Vezetékvégpont betáplálása');
      count = (infeedLookup.get(item.infeedId as string)!.poles as unknown[]).length;
    } else return fail('ismeretlen vezetékvégpont-típus.');
    const index = item.kind === 'bus' ? item.terminal : item.pole;
    finite(index, 'Kapocsszám', 10_000);
    if (!Number.isInteger(index) || index < 0 || index >= count) fail('a vezetékvégpont kapocsszáma tartományon kívüli.');
  };
  for (const board of boardValues) if (board.wiring) {
    const wiring = board.wiring as JsonObject;
    for (const wire of wiring.wires as unknown[]) {
      object(wire, 'Vezeték'); endpoint(wire.from); endpoint(wire.to);
      if (wire.color !== undefined) { text(wire.color, 'Vezetékszín', 100); if (!/^#[0-9a-fA-F]{6}$/.test(wire.color)) fail('a vezetékszín nem hatjegyű hexadecimális szín.'); }
      if (wire.label !== undefined) text(wire.label, 'Vezetékfelirat', 5000);
      cableDetails(wire.cable);
      if (wire.points !== undefined) { array(wire.points, 'Vezeték nyomvonalpontjai', 10_000); for (const entry of wire.points) { object(entry, 'Vezeték nyomvonalpontja'); point(entry, 'Vezeték nyomvonalpontja'); } }
      if (wire.labelOffset !== undefined) { object(wire.labelOffset, 'Vezetékfelirat eltolása'); point(wire.labelOffset, 'Vezetékfelirat eltolása'); }
      if (wire.sourceRoute !== undefined) passiveJson(wire.sourceRoute, 'Megőrzött nyomvonal');
    }
  }
}

function manufacturerSource(value: unknown) {
  text(value, 'Gyártói forrás', 5000);
  try {
    const source = new URL(value);
    if (source.protocol !== 'https:' || source.username || source.password || /[\u0000-\u0020\u007f]/.test(value)) throw new Error();
  } catch { fail('a gyártói forrás kizárólag hitelesítés nélküli HTTPS-hivatkozás lehet.'); }
}

function productSnapshot(value: unknown) {
  if (value === undefined) return;
  object(value, 'Termékadatok');
  for (const [key, label] of [['reference', 'Termékazonosító'], ['manufacturer', 'Gyártó'], ['range', 'Termékcsalád'], ['sourceDocument', 'Forrásdokumentum']] as const) {
    identifier(value[key], label);
  }
  manufacturerSource(value.sourceUrl);
  if (value.supplementalSourceUrl !== undefined) manufacturerSource(value.supplementalSourceUrl);
  finite(value.sourcePage, 'Forrásoldal');
  if (!Number.isInteger(value.sourcePage) || value.sourcePage <= 0) fail('a forrás oldalszáma pozitív egész szám legyen.');
  timestamp(value.verifiedAt, 'Ellenőrzés időpontja');
  text(value.mounting, 'Szerelési mód', 100);
  if (!['din', 'accessory', 'enclosure'].includes(value.mounting)) fail('ismeretlen termékszerelési mód.');
  if (value.description !== undefined) {
    object(value.description, 'Termékleírás');
    text(value.description.hu, 'Magyar termékleírás', 20_000);
    text(value.description.en, 'Angol termékleírás', 20_000);
  }
  for (const key of ['poles', 'curve', 'residualType', 'voltage']) if (value[key] !== undefined) text(value[key], `${t('Termékadatok')}.${key}`, 1000);
  for (const key of ['moduleWidth', 'widthMm', 'currentA', 'breakingCapacityKa', 'residualCurrentMa', 'boardRows', 'modulesPerRow']) {
    if (value[key] === undefined) continue;
    finite(value[key], `${t('Termékadatok')}.${key}`);
    if (value[key] <= 0) fail('a termék számszerű adata legyen pozitív.');
    if ((key === 'boardRows' || key === 'modulesPerRow') && !Number.isInteger(value[key])) fail('a termék sor- és modulkapacitása pozitív egész szám legyen.');
  }
}

function validateData(value: unknown, assets: Set<string>, projectId?: string) {
  object(value, 'Projektadatok');
  identifier(value.id, 'Projektazonosító');
  if (projectId && value.id !== projectId) fail('egy előzmény másik projekthez tartozik.');
  text(value.name, 'Projektnév', 1000); text(value.site, 'Helyszín', 5000); text(value.client, 'Megrendelő', 5000); text(value.notes, 'Projektjegyzet');
  array(value.devices, 'Készülékek'); array(value.circuits, 'Áramkörök'); array(value.sheets, 'Tervlapok', 500); array(value.boards, 'Elosztók', 500);
  const devices = uniqueIds(value.devices, 'Készülék');
  const circuits = uniqueIds(value.circuits, 'Áramkör');
  uniqueIds(value.sheets, 'Tervlap'); const boards = uniqueIds(value.boards, 'Elosztó');
  for (const entry of value.devices) {
    object(entry, 'Készülék');
    for (const key of ['code', 'name', 'room', 'model', 'notes']) text(entry[key], `${t('Készülék')}.${key}`);
    text(entry.kind, 'Készüléktípus'); text(entry.status, 'Készülékállapot');
    if (!kinds.has(entry.kind) || !statuses.has(entry.status)) fail('ismeretlen készüléktípus vagy állapot.');
    finite(entry.heightMm, 'Szerelési magasság');
    if (entry.moduleWidth !== undefined) finite(entry.moduleWidth, 'Modulszélesség', 100_000);
    if (entry.rating !== undefined) text(entry.rating, 'Névleges adat');
    productSnapshot(entry.product);
    electrical(entry.electrical);
    reference(entry.boardId, boards, 'Készülék elosztója', true);
    if (entry.quantity !== undefined) {
      finite(entry.quantity, 'Darabszám', 1_000_000);
      if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) fail('a darabszám pozitív egész szám legyen.');
    }
    reference(entry.circuitId, circuits, 'Készülék áramköre', true);
    array(entry.photoIds, 'Készülékfotók', 1000);
    for (const photo of entry.photoIds) reference(photo, assets, 'Fotó');
  }
  for (const entry of value.circuits) {
    object(entry, 'Áramkör');
    for (const key of ['code', 'name', 'color', 'notes']) text(entry[key], `${t('Áramkör')}.${key}`);
    if (!/^#[0-9a-fA-F]{6}$/.test(entry.color as string)) fail('az áramkör színe nem hatjegyű hexadecimális szín.');
    reference(entry.protectionDeviceId, devices, 'Áramkör védelme', true);
    if (entry.cable !== undefined) text(entry.cable, 'Áramköri kábel', 5000);
    if (entry.powerW !== undefined) {
      finite(entry.powerW, 'Rögzített teljesítmény');
      if (entry.powerW < 0) fail('a rögzített teljesítmény nem lehet negatív.');
    }
    if (entry.loadType !== undefined && !['socket', 'lamp', 'motor', 'other'].includes(entry.loadType as string)) fail('ismeretlen fogyasztótípus.');
    if (entry.phase !== undefined && !['L1', 'L2', 'L3'].includes(entry.phase as string)) fail('ismeretlen fázis.');
    cableDetails(entry.cableDetails);
  }
  for (const sheet of value.sheets) {
    object(sheet, 'Tervlap'); text(sheet.name, 'Tervlap neve', 1000);
    finite(sheet.width, 'Tervlap szélessége'); finite(sheet.height, 'Tervlap magassága');
    if (sheet.width <= 0 || sheet.height <= 0) fail('a tervlap mérete legyen pozitív.');
    if (sheet.mmPerUnit !== undefined) { finite(sheet.mmPerUnit, 'Méretarány'); if (sheet.mmPerUnit <= 0) fail('a méretarány legyen pozitív.'); }
    reference(sheet.backgroundAssetId, assets, 'Alaprajz', true);
    array(sheet.placements, 'Elhelyezések'); array(sheet.routes, 'Kapcsolatok'); array(sheet.annotations, 'Feliratok');
    const placed = new Set<string>();
    for (const placement of sheet.placements) {
      object(placement, 'Elhelyezés'); reference(placement.deviceId, devices, 'Elhelyezett készülék');
      const deviceId = placement.deviceId as string;
      if (placed.has(deviceId)) fail('egy készülék ugyanazon a tervlapon kétszer szerepel.');
      placed.add(deviceId); point(placement, 'Elhelyezés'); finite(placement.rotation, 'Forgatás');
    }
    uniqueIds(sheet.routes, 'Kapcsolat');
    for (const route of sheet.routes) {
      object(route, 'Kapcsolat');
      reference(route.fromDeviceId, devices, 'Kapcsolat kezdete'); reference(route.toDeviceId, devices, 'Kapcsolat vége');
      reference(route.circuitId, circuits, 'Kapcsolat áramköre', true);
      if (route.kind !== 'power' && route.kind !== 'control') fail('ismeretlen kapcsolattípus.');
      array(route.points, 'Nyomvonalpontok', 10_000);
      for (const item of route.points) { object(item, 'Nyomvonalpont'); point(item, 'Nyomvonalpont'); }
    }
    uniqueIds(sheet.annotations, 'Felirat');
    for (const annotation of sheet.annotations) { object(annotation, 'Felirat'); text(annotation.text, 'Felirat szövege'); point(annotation, 'Felirat'); }
  }
  for (const board of value.boards) {
    object(board, 'Elosztó'); text(board.name, 'Elosztó neve', 1000); array(board.rows, 'Elosztósorok', 1000); uniqueIds(board.rows, 'Elosztósor');
    productSnapshot(board.product);
    if (board.supplyLabel !== undefined) text(board.supplyLabel, 'Betáplálás megnevezése', 5000);
    if (board.connections !== undefined) {
      array(board.connections, 'Elosztókapcsolatok');
      uniqueIds(board.connections, 'Elosztókapcsolat');
      for (const connection of board.connections) {
        object(connection, 'Elosztókapcsolat');
        reference(connection.fromDeviceId, devices, 'Elosztókapcsolat forrása', true);
        reference(connection.toDeviceId, devices, 'Elosztókapcsolat célja');
      }
    }
    for (const row of board.rows) {
      object(row, 'Elosztósor'); text(row.name, 'Sor neve', 1000); finite(row.capacity, 'Sor kapacitása', 100_000); array(row.placements, 'Modulok');
      // Invalid layout geometry is a recoverable planning issue, not file
      // corruption. Preserve it so the editor can display the exact collision.
      for (const placement of row.placements) {
        object(placement, 'Modulhely'); reference(placement.deviceId, devices, 'Modul készüléke'); finite(placement.start, 'Modul kezdőpozíció', 100_000);
      }
    }
  }
  validateWiring(value, value.devices);
}

const passiveSvgTags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'title', 'desc', 'symbol', 'use', 'image']);
const passiveSvgAttributes = new Set([
  'xmlns', 'xmlns:xlink', 'id', 'class', 'viewbox', 'width', 'height', 'x', 'y', 'dx', 'dy', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'x2', 'y1', 'y2', 'd', 'points', 'transform',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity',
  'font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'letter-spacing', 'word-spacing', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'textlength', 'lengthadjust',
  'shape-rendering', 'vector-effect', 'preserveaspectratio', 'gradientunits', 'gradienttransform', 'stop-color', 'stop-opacity', 'offset', 'clip-path', 'clip-rule', 'mask',
  'patternunits', 'patterncontentunits', 'patterntransform', 'href', 'xlink:href',
]);

function assertSafeSvg(bytes: Uint8Array) {
  const unsafe = (): never => fail('az SVG aktív, külső vagy nem támogatott tartalmat tartalmaz. Használj PNG vagy JPG képet.');
  // A small, explicit passive subset avoids relying on browser-specific SVG
  // execution rules. In particular, CSS/animation could mutate safe references.
  const svg = strFromU8(bytes).replace(/^\uFEFF/, '').replace(/^\s*<\?xml\s[^?]*\?>/i, '').replace(/<!--[\s\S]*?-->/g, '');
  if (/<!|<\?|@import/i.test(svg)) unsafe();
  const stack: string[] = [];
  let rootSeen = false;
  const remainder = svg.replace(/<\s*(\/?)\s*([A-Za-z][\w:.-]*)([^<>]*)>/g, (_match, closing: string, tag: string, raw: string) => {
    if (!passiveSvgTags.has(tag)) return unsafe();
    if (closing) {
      if (raw.trim() || stack.pop() !== tag) return unsafe();
      return '';
    }
    if (!stack.length) {
      if (rootSeen || tag !== 'svg') return unsafe();
      rootSeen = true;
    }
    const selfClosing = /\/\s*$/.test(raw);
    const attributes = selfClosing ? raw.replace(/\/\s*$/, '') : raw;
    const seenAttributes = new Set<string>();
    const leftover = attributes.replace(/([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g, (_attribute, originalName: string, _quote: string, rawValue: string) => {
      const name = originalName.toLowerCase();
      if (!passiveSvgAttributes.has(name) || seenAttributes.has(name)) return unsafe();
      seenAttributes.add(name);
      let value = rawValue.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_entity, hexadecimal: string | undefined, decimal: string | undefined) => {
        const code = Number.parseInt(hexadecimal ?? decimal!, hexadecimal ? 16 : 10);
        if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return unsafe();
        return String.fromCodePoint(code);
      }).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
      if (name === 'xmlns') { if (value !== 'http://www.w3.org/2000/svg') return unsafe(); return ''; }
      if (name === 'xmlns:xlink') { if (value !== 'http://www.w3.org/1999/xlink') return unsafe(); return ''; }
      if (name === 'href' || name === 'xlink:href') {
        if (!/^#[\w:.-]+$/.test(value) && !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return unsafe();
        return '';
      }
      // Reject escaped CSS tokens and every URL except a local paint reference.
      if (/\\|(?:https?|ftp|file|javascript|vbscript|data):|\/\//i.test(value)) return unsafe();
      value = value.replace(/url\(\s*["']?#[\w:.-]+["']?\s*\)/gi, '');
      if (/url\s*\(|@import/i.test(value)) return unsafe();
      return '';
    });
    if (leftover.trim()) return unsafe();
    if (!selfClosing) stack.push(tag);
    return '';
  });
  if (!rootSeen || stack.length || /[<>]/.test(remainder)) unsafe();
}

function decodeDataUrl(asset: Pick<Asset, 'mime' | 'data'>): Uint8Array<ArrayBuffer> {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(asset.data);
  if (!match || match[1] !== asset.mime || match[2].length % 4 !== 0) fail('hibás beágyazott melléklet.');
  if (match[2].length * 0.75 > ARCHIVE_LIMITS.assetBytes + 2) fail('egy melléklet meghaladja a 40 MB méretet.');
  let binary: string;
  try { binary = atob(match[2]); } catch { return fail('hibás base64 melléklet.'); }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (!bytes.length) fail('üres melléklet.');
  if (asset.mime === 'image/svg+xml') assertSafeSvg(bytes);
  return bytes;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
  let current = byte;
  for (let bit = 0; bit < 8; bit++) current = (current >>> 1) ^ ((current & 1) ? 0xedb88320 : 0);
  return current >>> 0;
});
function checksum(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDirectory(bytes: Uint8Array): Map<string, { size: number; crc: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65_557)) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
    end--;
  }
  if (end < 0 || end < bytes.length - 65_557) fail('a ZIP sérült vagy nem támogatott.');
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) fail('többrészes ZIP nem támogatott.');
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryStart = view.getUint32(end + 16, true);
  if (count > ARCHIVE_LIMITS.entries || count !== view.getUint16(end + 8, true)) fail('túl sok ZIP-bejegyzés.');
  if (directoryStart + directorySize !== end) fail('a ZIP könyvtára sérült vagy ZIP64 formátumú.');
  const result = new Map<string, { size: number; crc: number }>();
  let offset = directoryStart; let total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) fail('sérült ZIP-bejegyzés.');
    const flags = view.getUint16(offset + 8, true);
    const compression = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localStart = view.getUint32(offset + 42, true);
    if (offset + 46 + nameLength + extraLength + commentLength > end) fail('sérült ZIP-fájlnév.');
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (name !== 'project.json' && !/^assets\/\d{5}\.bin$/.test(name)) fail('ismeretlen vagy nem biztonságos ZIP-fájlnév.');
    if (result.has(name)) fail('ismétlődő ZIP-bejegyzés.');
    if ((flags & 1) || (compression !== 0 && compression !== 8)) fail('titkosított vagy nem támogatott ZIP-tömörítés.');
    total += size;
    if (size > (name === 'project.json' ? ARCHIVE_LIMITS.jsonBytes : ARCHIVE_LIMITS.assetBytes) || total > ARCHIVE_LIMITS.expandedBytes) fail('a kicsomagolt projekt túl nagy.');
    if (localStart + 30 > directoryStart || view.getUint32(localStart, true) !== 0x04034b50) fail('sérült ZIP-állományfejléc.');
    const localNameLength = view.getUint16(localStart + 26, true);
    const localExtraLength = view.getUint16(localStart + 28, true);
    const payloadStart = localStart + 30 + localNameLength + localExtraLength;
    if (payloadStart + compressedSize > directoryStart || view.getUint16(localStart + 8, true) !== compression) fail('sérült ZIP-adatméret.');
    if (strFromU8(bytes.subarray(localStart + 30, localStart + 30 + localNameLength)) !== name) fail('eltérő ZIP-fájlnév a fejlécben.');
    result.set(name, { size, crc });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== end) fail('a ZIP könyvtárának mérete hibás.');
  return result;
}

function dataUrl(mime: string, bytes: Uint8Array): string {
  // Avoid spreading large arrays, which exceeds the call stack for photographs.
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  }
  return `data:${mime};base64,${btoa(chunks.join(''))}`;
}

export function validateProject(value: unknown): asserts value is ProjectDocument {
  object(value, 'Projekt');
  if (value.schemaVersion !== 1) fail('nem támogatott formátumverzió. Frissítsd az alkalmazást, ha újabb programmal készült a fájl.');
  object(value.assets, 'Mellékletek');
  const assetKeys = Object.keys(value.assets);
  if (assetKeys.length >= ARCHIVE_LIMITS.entries) fail('túl sok melléklet.');
  const assets = new Set(assetKeys);
  let totalBytes = 0;
  for (const key of assetKeys) {
    const asset = value.assets[key]; object(asset, 'Melléklet');
    identifier(asset.id, 'Mellékletazonosító'); text(asset.name, 'Melléklet neve', 2000); text(asset.mime, 'Melléklet típusa', 100); text(asset.data, 'Melléklet adata', Math.ceil(ARCHIVE_LIMITS.assetBytes * 4 / 3) + 200);
    if (asset.id !== key || !assetMimes.has(asset.mime)) fail('hibás mellékletazonosító vagy nem támogatott fájltípus.');
    totalBytes += decodeDataUrl(asset as unknown as Asset).length;
    if (totalBytes > ARCHIVE_LIMITS.expandedBytes) fail('a mellékletek együttes mérete túl nagy.');
  }
  validateData(value.data, assets);
  object(value.data, 'Projektadatok');
  const projectId = value.data.id as string;
  array(value.revisions, 'Előzmények', 2000); const revisionIds = uniqueIds(value.revisions, 'Változat');
  optionalId(value.headRevisionId, 'Aktuális változat'); reference(value.headRevisionId, revisionIds, 'Aktuális változat', true);
  timestamp(value.updatedAt, 'Módosítás időpontja');
  if (value.lastExternalSaveAt !== undefined) timestamp(value.lastExternalSaveAt, 'Fájlmentés időpontja');
  if (value.lastDriveSaveAt !== undefined) timestamp(value.lastDriveSaveAt, 'Drive-mentés időpontja');
  const parents = new Map<string, string | undefined>();
  for (const revision of value.revisions) {
    object(revision, 'Változat'); timestamp(revision.createdAt, 'Változat időpontja'); text(revision.note, 'Változat megjegyzése');
    reference(revision.parentId, revisionIds, 'Előző változat', true); reference(revision.restoredFrom, revisionIds, 'Visszaállított változat', true);
    validateData(revision.data, assets, projectId);
    parents.set(revision.id as string, revision.parentId as string | undefined);
  }
  for (const id of revisionIds) {
    const visited = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined) {
      if (visited.has(current)) fail('körkörös előzményhivatkozás.');
      visited.add(current); current = parents.get(current);
    }
  }
}

export async function encodeProject(document: ProjectDocument): Promise<Blob> {
  validateProject(document);
  const manifest = structuredClone(document) as unknown as JsonObject;
  const storedAssets: Record<string, { id: string; name: string; mime: string; path: string }> = Object.create(null);
  const files: Record<string, Uint8Array> = {};
  Object.values(document.assets).forEach((asset, index) => {
    const path = `assets/${String(index + 1).padStart(5, '0')}.bin`;
    storedAssets[asset.id] = { id: asset.id, name: asset.name, mime: asset.mime, path };
    files[path] = decodeDataUrl(asset);
  });
  manifest.assets = storedAssets;
  const json = strToU8(JSON.stringify(manifest));
  if (json.length > ARCHIVE_LIMITS.jsonBytes) fail('a projekttörténet meghaladja a 30 MB méretet.');
  files['project.json'] = json;
  const encoded = zipSync(files, { level: 6 });
  if (encoded.length > ARCHIVE_LIMITS.archiveBytes) fail('a projektfájl meghaladja a 200 MB méretet.');
  return new Blob([new Uint8Array(encoded).buffer], { type: 'application/zip' });
}

export async function decodeProject(file: Blob): Promise<ProjectDocument> {
  if (file.size > ARCHIVE_LIMITS.archiveBytes) fail('a projektfájl meghaladja a 200 MB méretet.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let value: unknown;
  // Human-readable schema-v1 JSON is accepted for backup interoperability.
  const beginning = strFromU8(bytes.subarray(0, Math.min(200, bytes.length))).replace(/^\uFEFF/, '').trimStart();
  if (beginning.startsWith('{')) {
    if (bytes.length > ARCHIVE_LIMITS.jsonBytes) fail('a JSON meghaladja a 30 MB méretet.');
    try { value = JSON.parse(strFromU8(bytes).replace(/^\uFEFF/, '')); } catch { return fail('a JSON nem olvasható.'); }
  } else {
    const directory = zipDirectory(bytes);
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(t('Érvénytelen projektfájl: {message}', { message: '' }).trimEnd())) throw error;
      return fail('a ZIP sérült vagy nem támogatott.');
    }
    for (const [name, expected] of directory) {
      if (!files[name] || files[name].length !== expected.size || checksum(files[name]) !== expected.crc) fail('a ZIP egyik állománya sérült (méret vagy ellenőrző összeg).');
    }
    if (!files['project.json']) fail('hiányzik a project.json leíró.');
    try { value = JSON.parse(strFromU8(files['project.json'])); } catch { return fail('a projektleíró nem olvasható.'); }
    object(value, 'Projekt'); object(value.assets, 'Mellékletek');
    const assets: Record<string, Asset> = Object.create(null);
    const usedPaths = new Set<string>();
    for (const [key, entry] of Object.entries(value.assets)) {
      object(entry, 'Melléklet'); identifier(entry.id, 'Mellékletazonosító'); text(entry.name, 'Melléklet neve', 2000); text(entry.mime, 'Melléklet típusa', 100); text(entry.path, 'Melléklet útvonala', 200);
      if (!/^assets\/\d{5}\.bin$/.test(entry.path) || usedPaths.has(entry.path) || !files[entry.path]) fail('hiányzó vagy ismétlődő mellékletfájl.');
      usedPaths.add(entry.path);
      assets[key] = { id: entry.id, name: entry.name, mime: entry.mime, data: dataUrl(entry.mime, files[entry.path]) };
    }
    if (directory.size !== usedPaths.size + 1) fail('a ZIP nem hivatkozott állományt tartalmaz.');
    value.assets = assets;
  }
  validateProject(value);
  return value;
}

export async function assetFromFile(file: File): Promise<Asset> {
  if (!file.size || file.size > ARCHIVE_LIMITS.assetBytes) throw new Error(t('A kép vagy PDF legyen 0 és 40 MB közötti méretű.'));
  const extension = file.name.split('.').pop()?.toLowerCase();
  const fallback: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', pdf: 'application/pdf' };
  const mime = file.type || fallback[extension ?? ''];
  if (!assetMimes.has(mime)) throw new Error(t('PNG, JPG, WebP, GIF, BMP, SVG kép vagy PDF választható.'));
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (mime === 'image/svg+xml') assertSafeSvg(bytes);
  return { id: uid(), name: file.name, mime, data: dataUrl(mime, bytes) };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function saveProjectFile(document: ProjectDocument): Promise<void> {
  const stem = stripProjectExtension(document.data.name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 120).replace(/[. ]+$/, '');
  const filename = `${stem || t('projekt')}${APP.extension}`;
  type SaveFilePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }> }>;
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  // Open the picker in the user gesture, before asynchronous ZIP generation.
  const handle = picker ? await picker.call(window, { suggestedName: filename, types: [{ description: t('{app} projekt', { app: APP.name }), accept: { 'application/zip': [APP.extension] } }] }) : undefined;
  // The portable copy records this export, rather than retaining the previous
  // file-save date when it is opened on another device.
  const blob = await encodeProject({ ...document, lastExternalSaveAt: new Date().toISOString() });
  if (handle) {
    const writable = await handle.createWritable();
    try { await writable.write(blob); await writable.close(); }
    catch (error) { try { await writable.abort?.(); } catch { /* preserve the original write error */ } throw error; }
  } else downloadBlob(blob, filename);
}
