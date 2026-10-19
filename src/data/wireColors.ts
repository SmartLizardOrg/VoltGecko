import type { BoardWire, Conductor } from '../types';

export const GREEN_YELLOW = { green: '#2f9e44', yellow: '#f2cf1d' } as const;
export const wireColorPresets = [
  { label: 'Barna', color: '#7a4a1e' },
  { label: 'Fekete', color: '#1c1c1c' },
  { label: 'Szürke', color: '#8a8f95' },
  { label: 'Kék', color: '#2d6fd3' },
  { label: 'Zöld-sárga', color: GREEN_YELLOW.green, colorPattern: 'green-yellow' }
] as const;

export const conductorColors: Record<Conductor, string> = {
  L: wireColorPresets[0].color,
  L1: wireColorPresets[0].color,
  L2: wireColorPresets[1].color,
  L3: wireColorPresets[2].color,
  N: wireColorPresets[3].color,
  PE: GREEN_YELLOW.green,
  PEN: '#539d77'
};

export type WireColor = Pick<BoardWire, 'color' | 'colorPattern'>;

export function defaultWireColor(conductor: Conductor = 'L'): WireColor {
  return { color: conductorColors[conductor], colorPattern: conductor === 'PE' ? 'green-yellow' : undefined };
}

/** Only explicit pattern metadata makes a stored solid colour two-tone. */
export function wireColorAppearance(wire: WireColor, conductor: Conductor = 'L') {
  const defaults = defaultWireColor(conductor);
  const color = /^#[0-9a-f]{6}$/i.test(wire.color ?? '') ? wire.color! : defaults.color!;
  const striped = (wire.colorPattern ?? (wire.color === undefined ? defaults.colorPattern : undefined)) === 'green-yellow';
  const stripe = striped ? GREEN_YELLOW.yellow : undefined;
  return {
    color,
    stripe,
    swatch: stripe ? `repeating-linear-gradient(135deg, ${color} 0 5px, ${stripe} 5px 10px)` : color
  };
}
