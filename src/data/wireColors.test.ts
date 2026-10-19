import { describe, expect, it } from 'vitest';
import { decodeProject, encodeProject, validateProject } from './archive';
import { createProject } from './project';
import { conductorColors, defaultWireColor, GREEN_YELLOW, wireColorAppearance } from './wireColors';

function fixture() {
  const doc = createProject('Wire colours');
  doc.data.boards[0].wiring = {
    buses: [{ id: 'earth-bus', name: 'PE', conductor: 'PE', capacity: 8, position: 'bottom', terminalLabels: [] }],
    infeeds: [{ id: 'earth-source', name: 'Earth', kind: 'earth', poles: ['PE'] }],
    wires: ['#70a029', '#2f9e44', '#12ABef'].map((color, terminal) => ({
      id: `wire-${terminal}`,
      from: { kind: 'infeed', infeedId: 'earth-source', pole: 0 },
      to: { kind: 'bus', busId: 'earth-bus', terminal },
      color
    }))
  };
  doc.data.boards[0].wiring.wires.push({
    id: 'striped',
    from: { kind: 'infeed', infeedId: 'earth-source', pole: 0 },
    to: { kind: 'bus', busId: 'earth-bus', terminal: 3 },
    ...defaultWireColor('PE')
  });
  return doc;
}

describe('wire colour documentation', () => {
  it('keeps explicitly stored green and custom colours solid, including on PE wires', () => {
    for (const color of ['#70a029', GREEN_YELLOW.green, '#12ABef']) {
      expect(wireColorAppearance({ color }, 'PE')).toEqual({ color, stripe: undefined, swatch: color });
    }
    expect(wireColorAppearance(defaultWireColor('PE')).stripe).toBe(GREEN_YELLOW.yellow);
    expect(wireColorAppearance({}, 'PE').stripe).toBe(GREEN_YELLOW.yellow);
    expect(defaultWireColor('PEN')).toEqual({ color: '#539d77', colorPattern: undefined });
    expect(defaultWireColor('L2').color).toBe(conductorColors.L2);
    expect(defaultWireColor('L3').color).toBe(conductorColors.L3);
    expect(wireColorAppearance({ color: 'url(unsafe)' }).color).toBe(conductorColors.L);
  });

  it('roundtrips new two-tone metadata and all existing hex colours without mutating the source', async () => {
    const doc = fixture(), before = structuredClone(doc);
    const restored = await decodeProject(await encodeProject(doc));
    expect(restored).toEqual(before);
    expect(doc).toEqual(before);
    expect(restored.schemaVersion).toBe(1);
    expect(restored.data.boards[0].wiring!.wires.map((wire) => wire.color)).toEqual(['#70a029', '#2f9e44', '#12ABef', GREEN_YELLOW.green]);
    expect(restored.data.boards[0].wiring!.wires.map((wire) => wire.colorPattern)).toEqual([undefined, undefined, undefined, 'green-yellow']);
  });

  it('rejects unsupported pattern metadata and continues requiring hex base colours', () => {
    const doc = fixture(), wire = doc.data.boards[0].wiring!.wires[0];
    wire.colorPattern = 'url(unsafe)' as never;
    expect(() => validateProject(doc)).toThrow('ismeretlen vezetékszínminta');
    delete wire.colorPattern;
    wire.color = 'green-yellow';
    expect(() => validateProject(doc)).toThrow('a vezetékszín nem hatjegyű hexadecimális szín');
  });
});
