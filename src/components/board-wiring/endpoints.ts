import { effectiveDevicePoles, wiringEndpointLabel } from '../../data/boardWiring';
import type { Conductor, ProjectData, WiringEndpoint } from '../../types';

export const encodeEndpoint = (endpoint: WiringEndpoint) =>
  JSON.stringify(
    endpoint.kind === 'device'
      ? { kind: endpoint.kind, deviceId: endpoint.deviceId, side: endpoint.side, pole: endpoint.pole }
      : endpoint.kind === 'bus'
        ? { kind: endpoint.kind, busId: endpoint.busId, terminal: endpoint.terminal }
        : { kind: endpoint.kind, infeedId: endpoint.infeedId, pole: endpoint.pole }
  );
export const parseEndpoint = (value: string): WiringEndpoint | undefined =>
  value ? (JSON.parse(value) as WiringEndpoint) : undefined;
export const conductorColors: Record<Conductor, string> = {
  L: '#86613d',
  L1: '#86613d',
  L2: '#263b49',
  L3: '#81909a',
  N: '#278ad4',
  PE: '#70a029',
  PEN: '#539d77'
};
export function sameEndpoint(a: WiringEndpoint, b: WiringEndpoint): boolean {
  if (a.kind === 'device' && b.kind === 'device')
    return a.deviceId === b.deviceId && a.side === b.side && a.pole === b.pole;
  if (a.kind === 'bus' && b.kind === 'bus') return a.busId === b.busId && a.terminal === b.terminal;
  return a.kind === 'infeed' && b.kind === 'infeed' && a.infeedId === b.infeedId && a.pole === b.pole;
}

export interface EndpointOption {
  value: WiringEndpoint;
  text: string;
  group: string;
}

export function getEndpointOptions(data: ProjectData): EndpointOption[] {
  const endpoints: EndpointOption[] = [];
  for (const cabinet of data.boards) {
    const ids = new Set([
      ...cabinet.rows.flatMap((row) => row.placements.map((p) => p.deviceId)),
      ...data.devices.filter((d) => d.boardId === cabinet.id && d.moduleWidth !== undefined).map((d) => d.id)
    ]);
    for (const device of data.devices.filter((d) => ids.has(d.id) && d.kind !== 'blank'))
      for (const side of ['top', 'bottom'] as const)
        effectiveDevicePoles(device).forEach((_, pole) => {
          const value: WiringEndpoint = { kind: 'device', deviceId: device.id, side, pole };
          endpoints.push({ value, text: wiringEndpointLabel(data, value), group: cabinet.id });
        });
    for (const bus of cabinet.wiring?.buses ?? [])
      for (let terminal = 0; terminal < bus.capacity; terminal++) {
        const value: WiringEndpoint = { kind: 'bus', busId: bus.id, terminal };
        endpoints.push({ value, text: wiringEndpointLabel(data, value), group: cabinet.id });
      }
    for (const infeed of cabinet.wiring?.infeeds ?? [])
      infeed.poles.forEach((_, pole) => {
        const value: WiringEndpoint = { kind: 'infeed', infeedId: infeed.id, pole };
        endpoints.push({ value, text: wiringEndpointLabel(data, value), group: cabinet.id });
      });
  }
  return endpoints;
}
