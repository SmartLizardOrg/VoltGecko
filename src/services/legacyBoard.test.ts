import { afterEach, describe, expect, it } from 'vitest';
import { decodeProject, encodeProject, validateProject } from '../data/archive';
import { createProject, getBoardIssues } from '../data/project';
import { setLanguage, t } from '../i18n';
import { importLegacyBoard, isLegacyBoard } from './legacyBoard';
import enLegacyBoard from '../locales/en-legacy-board';

function sample() {
  return {
    v: 2,
    project: { name: 'Lakás <A>& "ő"', author: 'Saját tervszerző', date: '2026-10-15' },
    rows: [{ mods: 18 }, { mods: 24 }], nid: 17,
    comps: [
      { id: 'c1', type: 'supply', row: 0, x: 0, poles: '3P+N', name: 'Betáp', cable: 'NYY-J 5×16 mm²' },
      { id: 'c2', type: 'main', row: 0, x: 4, poles: '4P', name: 'Leválasztó', rating: 63 },
      { id: 'c3', type: 'spd', row: 0, x: 8, poles: '3P+N', cls: 'T1+T2' },
      { id: 'c4', type: 'rccb', row: 0, x: 12, poles: '4P', rating: 40, sens: 30, rtype: 'A' },
      { id: 'c5', type: 'mcb', row: 1, x: 0, poles: '1P', name: 'Lámpa <script>', rating: 10, curve: 'B', cable: 'NYM-J 3×1,5 mm²', loadType: 'lamp', power: 600.25 },
      { id: 'c6', type: 'rcbo', row: 1, x: 1, poles: '3P+N', rating: 16, curve: 'C', sens: 30, rtype: 'A', cable: 'NYM-J 5×2,5 mm²', loadType: 'socket', power: 0 },
      { id: 'c7', type: 'contactor', row: 1, x: 5, poles: '4P', rating: 25, cable: 'NYM-J 5×2,5 mm²', loadType: 'motor', power: '' },
      { id: 'c8', type: 'meter', row: 1, x: 8, poles: '3P+N', name: 'Mérő' },
    ],
    wires: [
      { id: 'w1', a: { c: 'c1', s: 'bottom' }, b: { c: 'c2', s: 'top' } },
      { id: 'w2', a: { c: 'c4', s: 'top' }, b: { c: 'c2', s: 'bottom' } },
      { id: 'w3', a: { c: 'c2', s: 'bottom' }, b: { c: 'c3', s: 'top' } },
      { id: 'w4', a: { c: 'c4', s: 'bottom' }, b: { c: 'c5', s: 'top' } },
      { id: 'w5', a: { c: 'c4', s: 'bottom' }, b: { c: 'c6', s: 'top' } },
      { id: 'w6', a: { c: 'c4', s: 'bottom' }, b: { c: 'c7', s: 'top' } },
      { id: 'w7', a: { c: 'c7', s: 'bottom' }, b: { c: 'c8', s: 'top' } },
    ],
  };
}
afterEach(() => setLanguage('hu'));

describe('legacy board JSON v2 import', () => {
  it('recognizes its format without accepting unrelated JSON, and validates recognizable malformed data separately', () => {
    expect(isLegacyBoard(sample())).toBe(true);
    expect(isLegacyBoard({ v: 2, rows: 'broken' })).toBe(true);
    expect(isLegacyBoard({ v: 2, other: [] })).toBe(false);
    expect(isLegacyBoard({ schemaVersion: 1, data: {} })).toBe(false);
    expect(isLegacyBoard(null)).toBe(false);
    expect(() => importLegacyBoard({ v: 1, rows: [] })).toThrow('2-es');
  });

  it('preserves every generic component, physical width, placement and explicit circuit field without inventing manufacturer metadata', () => {
    const original = sample(); const before = structuredClone(original); const doc = importLegacyBoard(original);
    expect(original).toEqual(before);
    expect(doc.data.name).toBe(original.project.name);
    expect(doc.data.boards[0].rows.map(row => row.capacity)).toEqual([18, 24]);
    expect(doc.data.devices.map(device => device.kind)).toEqual(['custom', 'main', 'spd', 'rcd', 'breaker', 'rcbo', 'relay', 'custom']);
    expect(doc.data.devices.map(device => device.moduleWidth)).toEqual([4, 4, 4, 4, 1, 4, 3, 6]);
    expect(doc.data.boards[0].rows[1].placements.map(item => item.start)).toEqual([0, 1, 5, 8]);
    expect(doc.data.devices.every(device => !device.product && device.boardId === doc.data.boards[0].id)).toBe(true);
    expect(doc.data.devices[5].notes).toContain('4 M');
    expect(doc.data.devices[5].notes).toContain('gyártói adattal nem ellenőrzött');
    expect(doc.data.circuits).toHaveLength(3);
    expect(doc.data.circuits[0]).toMatchObject({ name: 'Lámpa <script>', cable: 'NYM-J 3×1,5 mm²', powerW: 600.25, loadType: 'lamp', protectionDeviceId: doc.data.devices[4].id });
    expect(doc.data.circuits[1]).toMatchObject({ powerW: 0, loadType: 'socket' });
    expect(doc.data.circuits[2]).toMatchObject({ loadType: 'motor' });
    expect(doc.data.circuits[2].powerW).toBeUndefined();
    expect(doc.data.circuits[2].protectionDeviceId).toBeUndefined();
    expect(doc.data.notes).toContain('Saját tervszerző'); expect(doc.data.notes).toContain('2026-10-15');
    expect(doc.data.devices[0].notes).toContain('NYY-J 5×16 mm²');
    expect(doc.data.devices[4].name).toBe('Lámpa <script>');
    expect(doc.revisions).toHaveLength(1); expect(doc.revisions[0].data).toEqual(doc.data);
    validateProject(doc);
  });

  it('orients opposite terminal sides from bottom to top and maps every endpoint to its imported device', () => {
    const doc = importLegacyBoard(sample()); const connections = doc.data.boards[0].connections!;
    expect(connections).toHaveLength(7);
    expect(connections[0]).toMatchObject({ fromDeviceId: doc.data.devices[0].id, toDeviceId: doc.data.devices[1].id });
    expect(connections[1]).toMatchObject({ fromDeviceId: doc.data.devices[1].id, toDeviceId: doc.data.devices[3].id });
    const ids = new Set(doc.data.devices.map(device => device.id));
    expect(connections.every(edge => ids.has(edge.fromDeviceId!) && ids.has(edge.toDeviceId))).toBe(true);
    expect(new Set([...doc.data.devices.map(device => device.id), ...connections.map(edge => edge.id)]).size).toBe(15);
  });

  it('keeps cycles, parallel edges, multiple feeds, self links and ambiguous connections without silently choosing a tree', () => {
    const input = sample();
    input.wires.push(
      { id: 'w8', a: { c: 'c8', s: 'bottom' }, b: { c: 'c1', s: 'top' } },
      { id: 'w9', a: { c: 'c1', s: 'bottom' }, b: { c: 'c2', s: 'top' } },
      { id: 'w10', a: { c: 'c3', s: 'top' }, b: { c: 'c4', s: 'top' } },
      { id: 'w11', a: { c: 'c5', s: 'bottom' }, b: { c: 'c6', s: 'bottom' } },
      { id: 'w12', a: { c: 'c7', s: 'bottom' }, b: { c: 'c7', s: 'top' } },
    );
    const doc = importLegacyBoard(input); const edges = doc.data.boards[0].connections!;
    expect(edges).toHaveLength(input.wires.length);
    expect(edges[7]).toMatchObject({ fromDeviceId: doc.data.devices[7].id, toDeviceId: doc.data.devices[0].id });
    expect(edges[9]).toMatchObject({ fromDeviceId: doc.data.devices[2].id, toDeviceId: doc.data.devices[3].id });
    expect(edges[11]).toMatchObject({ fromDeviceId: doc.data.devices[6].id, toDeviceId: doc.data.devices[6].id });
    expect(doc.data.notes).toContain('Kétértelmű'); expect(doc.data.notes).toContain('w10:'); expect(doc.data.notes).toContain('top'); expect(doc.data.notes).toContain('w11:');
    validateProject(doc);
  });

  it('round-trips all imported data and its history through the portable archive', async () => {
    const doc = importLegacyBoard(sample());
    expect(await decodeProject(await encodeProject(doc))).toEqual(doc);
  });

  it('preserves layout mistakes so the normal board checks can display collisions and overhangs', () => {
    const input = sample(); input.comps[5].x = 0.5; input.comps[7].x = 23;
    const doc = importLegacyBoard(input); const issues = getBoardIssues(doc.data.boards[0], doc.data.devices);
    expect(doc.data.boards[0].rows[1].placements[1].start).toBe(0.5);
    expect(issues.some(issue => issue.message.includes('ütköző'))).toBe(true);
    expect(issues.some(issue => issue.message.includes('túllóg'))).toBe(true);
  });

  it('handles prototype-like IDs as plain identifiers and does not reuse imported identities across distinct imports', () => {
    const input = sample(); input.comps[0].id = '__proto__'; input.wires[0].a.c = '__proto__';
    const first = importLegacyBoard(input); const second = importLegacyBoard(input);
    expect(first.data.boards[0].connections![0].fromDeviceId).toBe(first.data.devices[0].id);
    expect(first.data.devices[0].id).not.toBe(second.data.devices[0].id);
    expect(first.data.id).not.toBe(second.data.id);
  });

  it('rejects duplicate device or wire IDs, missing references, invalid terminal sides and unknown records', () => {
    const bad: { edit: (input: ReturnType<typeof sample>) => void; message: string }[] = [
      { edit: input => { input.comps[1].id = 'c1'; }, message: 'ismétlődő' },
      { edit: input => { input.wires[1].id = 'w1'; }, message: 'ismétlődő' },
      { edit: input => { input.wires[0].a.c = 'missing'; }, message: 'hiányzó készülék' },
      { edit: input => { input.wires[0].a.s = 'left'; }, message: 'kapocsoldal' },
      { edit: input => { input.comps[0].type = 'mystery'; }, message: 'készüléktípus' },
      { edit: input => { input.comps[0].poles = '7P'; }, message: 'pólusszám' },
    ];
    for (const { edit, message } of bad) { const input = sample(); edit(input); expect(() => importLegacyBoard(input)).toThrow(message); }
    expect(() => importLegacyBoard({ ...sample(), unknown: { important: 'data' } })).toThrow('adatvesztés');
    expect(() => importLegacyBoard({ ...sample(), comps: [{ ...sample().comps[0], customField: 'data' }] })).toThrow('adatvesztés');
  });

  it('rejects invalid row references and non-finite, negative or excessive specifications', () => {
    expect(() => importLegacyBoard({ ...sample(), rows: [] })).toThrow('Legalább');
    for (const mods of [0, -1, 2.5, 100001, NaN]) expect(() => importLegacyBoard({ ...sample(), rows: [{ mods }] })).toThrow();
    for (const row of [-1, 0.5, 2, Infinity]) { const input = sample(); input.comps[0].row = row; expect(() => importLegacyBoard(input)).toThrow(); }
    for (const power of [-1, Infinity, NaN, 1_000_000_001]) { const input = sample(); input.comps[4].power = power; expect(() => importLegacyBoard(input)).toThrow(); }
    const stringPower: unknown = { ...sample(), comps: [{ ...sample().comps[0], power: '600' }] };
    expect(() => importLegacyBoard(stringPower)).toThrow();
  });

  it('accepts an empty board and retains unknown load symbols as notes instead of inventing a known classification', () => {
    const empty = importLegacyBoard({ v: 2, project: { name: '' }, rows: [{ mods: 12 }], comps: [], wires: [] });
    expect(empty.data.devices).toEqual([]); expect(empty.data.boards[0].connections).toEqual([]); validateProject(empty);
    const input = sample(); input.comps[4].loadType = 'future-load';
    const doc = importLegacyBoard(input);
    expect(doc.data.circuits[0].loadType).toBeUndefined();
    expect(doc.data.circuits[0].notes).toContain('future-load');
    expect(doc.data.devices[4].notes).toContain('future-load');
  });

  it('does not change compatibility with older application projects', async () => {
    const old = createProject('Korábbi projekt');
    expect(old.data.boards[0].connections).toBeUndefined();
    expect(await decodeProject(await encodeProject(old))).toEqual(old);
  });

  it('provides complete English translations with matching placeholders and preserves user text', () => {
    const placeholders = (value: string) => [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(match => match[1]).sort();
    for (const [hu, en] of Object.entries(enLegacyBoard)) expect(placeholders(en), hu).toEqual(placeholders(hu));
    setLanguage('en'); const doc = importLegacyBoard(sample());
    expect(doc.data.name).toBe('Lakás <A>& "ő"');
    expect(doc.data.devices[4].name).toBe('Lámpa <script>');
    expect(t('Elosztó JSON v2 importálása')).toBe('Import board JSON v2');
    expect(doc.revisions[0].note).toBe('Import board JSON v2');
    expect(doc.data.notes).toContain('Original plan author: Saját tervszerző');
    expect(doc.data.devices[5].notes).toContain('has not been checked against manufacturer');
  });
});
