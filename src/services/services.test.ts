import { describe, expect, it } from 'vitest';
import { importBackground, marinaKind, parseMarina } from './import';
import { decodeProject, encodeProject } from '../data/archive';
import { isDriveConnected, listDriveProjects, safeFilename } from './drive';

// Entirely synthetic fixture exercising the legacy field names and data types.
const marina = {
  canvas: { width: 1400, height: 900 },
  szobak: [{ id: 'demo-room', nev: 'Mintaszoba', pos: [920, 180] }],
  vilagitas: [
    { id: 'DEMO.LIGHT-01', nev: 'Minta mennyezeti lámpa', kor: 1, tipus: 'Mennyezeti spot', kod: 'DEMO-LIGHT', pos: [260, 340], desc: 'Mintajegyzet', img: 'demo-images/light.jpg' },
    { id: 'DEMO.LIGHT-02', nev: 'Minta mennyezeti lámpa', kor: 1, pos: [480, 340] },
  ],
  eszkozok: [
    { id: 'DEMO.01.SWITCH-01', kod: 'DEMO.01.SWITCH-01', nev: 'Minta kapcsoló', aramkor: 1, tipus: 'KAP', modell: 'DEMO-SWITCH', helyiseg: 'Mintafolyosó', pos: [140, 660] },
    { id: 'DEMO.01.HUB-01', nev: 'Minta központ', tipus: 'HUB', modell: 'DEMO-HUB', pos: [960, 580] },
    { id: 'DEMO.01.SENSOR-01', nev: 'Minta nyitásérzékelő', tipus: 'NYIT', pos: [1100, 280] },
  ],
};

describe('Marina rétegimport', () => {
  it('preserves all placements, room labels, models and shared source circuit references', () => {
    const doc = parseMarina(marina);
    expect(doc.data.devices).toHaveLength(5);
    expect(doc.data.sheets[0].placements).toHaveLength(5);
    expect(doc.data.sheets[0]).toMatchObject({ width: 1400, height: 900, annotations: [{ text: 'Mintaszoba', x: 920, y: 180 }] });
    expect(doc.data.circuits).toHaveLength(1);
    const circuitId = doc.data.circuits[0].id;
    expect(doc.data.devices.slice(0, 3).every(device => device.circuitId === circuitId)).toBe(true);
    expect(doc.data.devices.find(device => device.code === 'DEMO.LIGHT-01')).toMatchObject({ kind: 'light', model: 'DEMO-LIGHT' });
    expect(doc.data.devices.find(device => device.code === 'DEMO.01.SWITCH-01')).toMatchObject({ kind: 'switch', room: 'Mintafolyosó', model: 'DEMO-SWITCH' });
    expect(doc.data.sheets[0].routes).toEqual([]);
    expect(doc.revisions.at(-1)?.note).toBe('Marina JSON importálása');
  });

  it('round-trips the imported document and its history through the portable archive', async () => {
    const original = parseMarina(marina);
    const restored = await decodeProject(await encodeProject(original));
    expect(restored).toEqual(original);
  });

  it('keeps distinct devices even if the source repeats a code', () => {
    const doc = parseMarina({ eszkozok: [{ id: 'K1', pos: [1, 2] }, { id: 'K1', pos: [3, 4] }] });
    expect(new Set(doc.data.devices.map(device => device.id)).size).toBe(2);
    expect(new Set(doc.data.devices.map(device => device.code)).size).toBe(2);
  });

  it('rejects unrelated JSON and invalid geometry rather than silently creating a broken plan', () => {
    expect(() => parseMarina({ devices: [] })).toThrow('nem Marina');
    expect(() => parseMarina({ eszkozok: [], canvas: { width: -1, height: 400 } })).toThrow('mérete');
    expect(() => parseMarina({ eszkozok: [{ id: 'K1', pos: [null, 20] }] })).toThrow('pozíciója');
    expect(() => parseMarina({ szobak: [{ nev: 'Szoba' }] })).toThrow('pozíciója');
  });

  it('preserves unknown source types and maps supported smart-home types', () => {
    expect(marinaKind('DIM')).toBe('switch');
    expect(marinaKind('TER')).toBe('sensor');
    expect(marinaKind('HUB')).toBe('hub');
    const doc = parseMarina({ eszkozok: [{ tipus: 'KLÍMA', nev: 'Klíma', pos: [1, 2] }] });
    expect(doc.data.devices[0].kind).toBe('custom');
    expect(doc.data.devices[0].notes).toContain('KLÍMA');
  });
});

describe('Integrációs hibahatárok', () => {
  it('does not attempt a Drive request without an explicit connection', async () => {
    expect(isDriveConnected()).toBe(false);
    await expect(listDriveProjects()).rejects.toThrow('csatlakozz újra');
  });
  it('makes portable filenames without path components', () => {
    expect(safeFilename('../Terv: fürdő\\A?.')).not.toMatch(/[\\/:?]/);
    expect(safeFilename(' . ')).toBe('villamos-terv');
    expect(safeFilename('Őrmező – lakás')).toBe('Őrmező – lakás');
  });
  it('rejects empty and unsupported floorplan sources before invoking an image or PDF renderer', async () => {
    await expect(importBackground(new File([], 'empty.png', { type: 'image/png' }))).rejects.toThrow('üres');
    await expect(importBackground(new File(['<script>'], 'plan.html', { type: 'text/html' }))).rejects.toThrow('PDF, PNG vagy JPG');
  });
});
