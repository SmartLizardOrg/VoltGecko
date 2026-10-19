import { describe, expect, it } from 'vitest';
import { CATALOG, makeDevice } from '../catalog';
import { decodeProject, encodeProject, validateProject } from './archive';
import { checkpoint, createProject } from './project';

describe('project device variants', () => {
  it('round-trips all floor presets and their history alongside unmodified older devices', async () => {
    let document = createProject();
    document.data.devices.push(makeDevice('outlet', []));
    for (const entry of CATALOG.filter(entry => entry.variant)) {
      const device = makeDevice(entry.kind, document.data.devices, entry.variant);
      document.data.devices.push(device);
      document.data.sheets[0].placements.push({ deviceId: device.id, x: 100, y: 100, rotation: 0 });
    }
    document = checkpoint(document, 'Új eszköztípusok');
    document.data.devices.find(device => device.variant === 'switch-series')!.name = 'Nappali csillár';
    const restored = await decodeProject(await encodeProject(document));
    expect(restored).toEqual(document);
    expect(restored.data.devices[0]).not.toHaveProperty('variant');
    expect(restored.revisions[0].data.devices.find(device => device.variant === 'switch-series')!.name).toBe('Csillárkapcsoló');
  });

  it.each(['switch-unknown', 'outlet-double', null, 42, {}])('rejects incompatible or unknown working-device variant %j', variant => {
    const document = createProject();
    document.data.devices.push(makeDevice('switch', []));
    Object.assign(document.data.devices[0], { variant });
    expect(() => validateProject(document)).toThrow('készülékváltozat');
  });

  it('validates variants in history as well as the working copy', () => {
    const document = createProject();
    document.data.devices.push(makeDevice('switch', [], 'switch-two-way'));
    const saved = checkpoint(document);
    Object.assign(saved.revisions[0].data.devices[0], { variant: 'light-wall' });
    expect(() => validateProject(saved)).toThrow('készülékváltozat');
  });
});
