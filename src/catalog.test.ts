import { afterEach, describe, expect, it } from 'vitest';
import { CATALOG, catalogEntryId, deviceLabel, kindLabel, makeDevice } from './catalog';
import { setLanguage } from './i18n';
import type { Device } from './types';

afterEach(() => setLanguage('hu'));

describe('floor-device presets', () => {
  it('keeps the existing default devices and board widths while creating distinct floor presets', () => {
    const generic = makeDevice('custom', []);
    expect(generic).toMatchObject({ kind: 'custom', name: 'Egyedi készülék', moduleWidth: 1 });
    expect(generic).not.toHaveProperty('variant');
    expect(makeDevice('switch', [])).toMatchObject({ name: 'Kapcsoló', code: 'K1', heightMm: 1100 });
    const tv = makeDevice('custom', [], 'custom-tv');
    expect(tv).toMatchObject({ kind: 'custom', variant: 'custom-tv', name: 'TV-csatlakozó', code: 'TV1' });
    expect(tv.moduleWidth).toBeUndefined();
    expect(kindLabel('custom')).toBe('Egyedi készülék');
    expect(deviceLabel(tv)).toBe('TV-csatlakozó');
    expect(new Set(CATALOG.map(catalogEntryId)).size).toBe(CATALOG.length);
  });

  it('shares the code sequence across switch variants without reusing occupied project codes', () => {
    const devices: Device[] = [makeDevice('switch', [])];
    devices.push(makeDevice('switch', devices, 'switch-two-way'));
    devices.push(makeDevice('switch', devices, 'switch-series'));
    expect(devices.map(device => device.code)).toEqual(['K1', 'K2', 'K3']);
    devices.push({ ...makeDevice('light', []), code: 'K4' });
    const next = makeDevice('switch', devices, 'switch-intermediate');
    expect(next).toMatchObject({ code: 'K5', name: 'Keresztkapcsoló', variant: 'switch-intermediate' });
    expect(() => makeDevice('light', [], 'switch-two-way')).toThrow('Ismeretlen készülékváltozat');
  });

  it('localizes preset labels at creation and reports the preset type without changing user names', () => {
    const device = makeDevice('switch', [], 'switch-two-way');
    device.name = 'Előszoba bal oldali kapcsoló';
    setLanguage('en');
    expect(deviceLabel(device)).toBe('Two-way switch');
    expect(device.name).toBe('Előszoba bal oldali kapcsoló');
    expect(makeDevice('switch', [], 'switch-double-pole').name).toBe('Double-pole switch');
    expect(CATALOG.find(entry => entry.variant === 'custom-data')?.description).toBe('Data outlet (RJ45)');
  });
});
