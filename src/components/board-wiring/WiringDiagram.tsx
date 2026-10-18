import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { t } from '../../i18n';
import { effectiveDevicePoles, endpointConductor, wiringEndpointLabel } from '../../data/boardWiring';
import type {
  Board,
  BoardBus,
  BoardInfeed,
  BoardWire,
  BoardWiring,
  Point,
  ProjectData,
  WiringEndpoint
} from '../../types';
import { conductorColors, encodeEndpoint, sameEndpoint } from './endpoints';

type Drag = {
  kind: 'point' | 'label' | 'bus' | 'infeed' | 'infeed-label';
  id: string;
  index?: number;
  point: Point;
  delta: Point;
};
interface WiringChanges {
  patchWire: (id: string, patch: Partial<BoardWire>) => void;
  patchBus: (id: string, patch: Partial<BoardBus>) => void;
  patchInfeed: (id: string, patch: Partial<BoardInfeed>) => void;
}

export function useWiringDiagram(
  data: ProjectData,
  board: Board,
  wiring: BoardWiring,
  { patchWire, patchBus, patchInfeed }: WiringChanges
) {
  const [drag, setDrag] = useState<Drag>();
  const svgRef = useRef<SVGSVGElement>(null);
  const width = Math.max(
    920,
    ...board.rows.map((row) => row.capacity * 46 + 220),
    ...wiring.buses.map((bus) => (bus.offset?.x ?? 80) + bus.capacity * 26 + 100),
    ...wiring.infeeds.map((source) => (source.position?.x ?? 0) + source.poles.length * 26 + 80),
    ...wiring.wires.flatMap((wire) => wire.points?.map((point) => point.x + 70) ?? [])
  );
  const height = Math.max(
    450,
    board.rows.length * 230 + 230,
    wiring.infeeds.length * 145 + 110,
    ...wiring.infeeds.map((source) => (source.position?.y ?? 0) + 100),
    ...wiring.buses.map((bus) => (bus.offset?.y ?? 0) + 80),
    ...wiring.wires.flatMap((wire) => wire.points?.map((point) => point.y + 70) ?? [])
  );
  const devicesById = new Map(data.devices.map((device) => [device.id, device]));
  const busesById = new Map(wiring.buses.map((bus) => [bus.id, bus]));
  const infeedsById = new Map(wiring.infeeds.map((source, index) => [source.id, { source, index }]));
  const devicePositions = new Map<string, { x: number; y: number; w: number }>();
  board.rows.forEach((row, index) =>
    row.placements.forEach((placement) => {
      const device = devicesById.get(placement.deviceId);
      if (device)
        devicePositions.set(device.id, {
          x: 80 + placement.start * 46,
          y: 130 + index * 230,
          w: Math.max(30, (device.moduleWidth ?? 1) * 46 - 4)
        });
    })
  );
  const busOrigin = (bus: BoardBus): Point => {
    const index = board.rows.findIndex((row) => row.id === bus.rowId);
    const original = {
      x: 80,
      y:
        index >= 0
          ? 130 + index * 230 + (bus.position === 'top' ? -56 : 154)
          : bus.position === 'top'
            ? 55
            : height - 48
    };
    return drag?.kind === 'bus' && drag.id === bus.id ? drag.point : (bus.offset ?? original);
  };
  const sourceOrigin = (source: BoardInfeed, index: number): Point =>
    drag?.kind === 'infeed' && drag.id === source.id
      ? drag.point
      : (source.position ?? { x: width - 160, y: 110 + index * 145 });
  const externalEndpoints = new Map<string, WiringEndpoint>();
  for (const wire of wiring.wires)
    for (const endpoint of [wire.from, wire.to]) {
      const local =
        endpoint.kind === 'device'
          ? devicePositions.has(endpoint.deviceId)
          : endpoint.kind === 'bus'
            ? busesById.has(endpoint.busId)
            : infeedsById.has(endpoint.infeedId);
      if (!local) externalEndpoints.set(encodeEndpoint(endpoint), endpoint);
    }
  const externalKeys = [...externalEndpoints.keys()];
  const endpointPoint = (endpoint: WiringEndpoint): Point => {
    if (endpoint.kind === 'device') {
      const position = devicePositions.get(endpoint.deviceId),
        device = devicesById.get(endpoint.deviceId);
      if (position && device) {
        const count = effectiveDevicePoles(device).length;
        return {
          x: position.x + (endpoint.pole === undefined || !count ? 0.5 : (endpoint.pole + 0.5) / count) * position.w,
          y: position.y + (endpoint.side === 'bottom' ? 100 : 0)
        };
      }
    } else if (endpoint.kind === 'bus') {
      const bus = busesById.get(endpoint.busId);
      if (bus) {
        const origin = busOrigin(bus);
        return { x: origin.x + endpoint.terminal * 26 + 13, y: origin.y };
      }
    } else {
      const infeed = infeedsById.get(endpoint.infeedId);
      if (infeed) {
        const origin = sourceOrigin(infeed.source, infeed.index);
        return { x: origin.x + endpoint.pole * 26 + 13, y: origin.y + 42 };
      }
    }
    return { x: width - 35, y: 60 + externalKeys.indexOf(encodeEndpoint(endpoint)) * 45 };
  };
  const route = (wire: BoardWire, index: number): Point[] => {
    const first = endpointPoint(wire.from),
      last = endpointPoint(wire.to),
      mid = (first.y + last.y) / 2 + (index % 7) * 5;
    const points = wire.points ?? [
      { x: first.x, y: mid },
      { x: last.x, y: mid }
    ];
    return [
      first,
      ...points.map((point, i) =>
        drag?.kind === 'point' && drag.id === wire.id && drag.index === i ? drag.point : point
      ),
      last
    ];
  };
  const wireLabelAnchor = (wire: BoardWire, index: number): Point => {
    const points = route(wire, index),
      middle = points[Math.floor(points.length / 2)];
    return { x: middle.x + 9, y: middle.y - 9 };
  };
  const wireLabelPoint = (wire: BoardWire, index: number): Point => {
    const anchor = wireLabelAnchor(wire, index);
    return drag?.kind === 'label' && drag.id === wire.id
      ? drag.point
      : { x: anchor.x + (wire.labelOffset?.x ?? 0), y: anchor.y + (wire.labelOffset?.y ?? 0) };
  };
  const svgPoint = (clientX: number, clientY: number): Point => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: Math.round(point.x), y: Math.round(point.y) };
  };
  const startDrag = (event: PointerEvent, kind: Drag['kind'], id: string, point: Point, index?: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    const cursor = svgPoint(event.clientX, event.clientY);
    setDrag({ kind, id, index, point, delta: { x: point.x - cursor.x, y: point.y - cursor.y } });
  };
  const commitDrag = () => {
    if (!drag) return;
    const value = drag;
    setDrag(undefined);
    if (value.kind === 'bus') patchBus(value.id, { offset: value.point });
    else if (value.kind === 'infeed') patchInfeed(value.id, { position: value.point });
    else if (value.kind === 'infeed-label') {
      const index = wiring.infeeds.findIndex((source) => source.id === value.id),
        source = wiring.infeeds[index];
      if (source) {
        const origin = sourceOrigin(source, index);
        patchInfeed(value.id, { labelOffset: { x: value.point.x - origin.x, y: value.point.y - origin.y - 12 } });
      }
    } else {
      const wire = wiring.wires.find((w) => w.id === value.id);
      if (!wire) return;
      const index = wiring.wires.indexOf(wire);
      if (value.kind === 'label') {
        const anchor = wireLabelAnchor(wire, index);
        patchWire(value.id, { labelOffset: { x: value.point.x - anchor.x, y: value.point.y - anchor.y } });
      } else {
        const points = route(wire, index).slice(1, -1);
        points[value.index ?? 0] = value.point;
        patchWire(value.id, { points });
      }
    }
  };
  return {
    svgRef,
    drag,
    setDrag,
    width,
    height,
    devicesById,
    devicePositions,
    busOrigin,
    sourceOrigin,
    externalEndpoints,
    endpointPoint,
    route,
    wireLabelPoint,
    svgPoint,
    startDrag,
    commitDrag
  };
}

type DiagramState = ReturnType<typeof useWiringDiagram>;
interface Props {
  data: ProjectData;
  board: Board;
  wiring: BoardWiring;
  diagram: DiagramState;
  from?: WiringEndpoint;
  to?: WiringEndpoint;
  selectedWireId?: string;
  onSelectWire: (id: string) => void;
  onSelectDevice: (id: string) => void;
  onSelectEndpoint: (endpoint: WiringEndpoint) => void;
}

export function WiringDiagram({
  data,
  board,
  wiring,
  diagram,
  from,
  to,
  selectedWireId,
  onSelectWire,
  onSelectDevice,
  onSelectEndpoint
}: Props) {
  const {
    svgRef,
    drag,
    setDrag,
    width,
    height,
    devicesById,
    devicePositions,
    busOrigin,
    sourceOrigin,
    externalEndpoints,
    endpointPoint,
    route,
    wireLabelPoint,
    svgPoint,
    startDrag,
    commitDrag
  } = diagram;
  const label = (endpoint: WiringEndpoint) => wiringEndpointLabel(data, endpoint);
  const selectedWire = wiring.wires.find((wire) => wire.id === selectedWireId);
  const selectedRoute = selectedWire ? route(selectedWire, wiring.wires.indexOf(selectedWire)) : [];
  const terminal = (endpoint: WiringEndpoint, point: Point, text: string) => {
    const selected = (from && sameEndpoint(from, endpoint)) || (to && sameEndpoint(to, endpoint)),
      color = conductorColors[endpointConductor(data, endpoint) ?? 'L'];
    return (
      <g
        key={encodeEndpoint(endpoint)}
        className={`wiring-terminal ${selected ? 'selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={label(endpoint)}
        onClick={(e) => {
          e.stopPropagation();
          onSelectEndpoint(endpoint);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectEndpoint(endpoint);
          }
        }}
      >
        <title>{label(endpoint)}</title>
        <circle className="wiring-terminal-hit" cx={point.x} cy={point.y} r={14} fill="transparent" />
        <circle cx={point.x} cy={point.y} r={8} fill={color} />
        <text x={point.x} y={point.y - 12} textAnchor="middle">
          {text}
        </text>
      </g>
    );
  };
  return (
    <div className="wiring-diagram-scroll">
      <svg
        ref={svgRef}
        className="wiring-diagram"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-label={t('Elosztó részletes huzalozási rajza')}
        onPointerMove={(event) => {
          if (drag) {
            const point = svgPoint(event.clientX, event.clientY);
            setDrag({ ...drag, point: { x: point.x + drag.delta.x, y: point.y + drag.delta.y } });
          }
        }}
        onPointerUp={commitDrag}
        onPointerCancel={() => setDrag(undefined)}
      >
        {board.rows.map((row, index) => (
          <g key={row.id}>
            <rect
              className="wiring-row"
              x={65}
              y={115 + index * 230}
              width={row.capacity * 46 + 30}
              height={130}
              rx={8}
            />
            <text className="wiring-row-label" x={80} y={100 + index * 230}>
              {row.name} · {row.capacity} M
            </text>
          </g>
        ))}
        {wiring.wires.map((wire, index) => {
          const points = route(wire, index);
          return (
            <g key={wire.id} className={`wiring-wire ${selectedWireId === wire.id ? 'selected' : ''}`}>
              <polyline
                className="wiring-wire-hit"
                points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                onClick={() => onSelectWire(wire.id)}
                role="button"
                tabIndex={0}
                aria-label={t('Vezeték: {from} → {to}', { from: label(wire.from), to: label(wire.to) })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectWire(wire.id);
                  }
                }}
              />
              <polyline
                className="wiring-wire-line"
                points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                stroke={wire.color ?? conductorColors[endpointConductor(data, wire.from) ?? 'L']}
              />
            </g>
          );
        })}
        {[...devicePositions].map(([id, position]) => {
          const device = devicesById.get(id)!;
          return (
            <g key={id}>
              <rect
                className={`wiring-device ${device.kind === 'blank' ? 'blank' : ''}`}
                x={position.x}
                y={position.y}
                width={position.w}
                height={100}
                rx={4}
                onClick={() => onSelectDevice(id)}
                role="button"
                tabIndex={0}
                aria-label={t('Készülék szerkesztése: {code}', { code: device.code })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelectDevice(id);
                }}
              />
              <text
                className="wiring-device-code"
                x={position.x + position.w / 2}
                y={position.y + 37}
                textAnchor="middle"
              >
                {device.code}
              </text>
              <text
                className="wiring-device-rating"
                x={position.x + position.w / 2}
                y={position.y + 58}
                textAnchor="middle"
              >
                {device.rating || '—'}
              </text>
              {device.electrical?.group && (
                <text x={position.x} y={position.y + 125}>
                  {device.electrical.group}
                </text>
              )}
              {device.kind !== 'blank' &&
                (['top', 'bottom'] as const).flatMap((side) =>
                  effectiveDevicePoles(device).map((pole, index) =>
                    terminal(
                      { kind: 'device', deviceId: id, side, pole: index },
                      endpointPoint({ kind: 'device', deviceId: id, side, pole: index }),
                      pole
                    )
                  )
                )}
            </g>
          );
        })}
        {wiring.buses.map((bus) => {
          const origin = busOrigin(bus);
          return (
            <g key={bus.id}>
              <rect
                className="wiring-bus"
                x={origin.x}
                y={origin.y - 5}
                width={bus.capacity * 26}
                height={10}
                fill={conductorColors[bus.conductor]}
              />
              <text
                className="wiring-move-label"
                x={origin.x}
                y={origin.y + 29}
                onPointerDown={(event) => startDrag(event, 'bus', bus.id, origin)}
              >
                {bus.name} · {bus.conductor}
              </text>
              {Array.from({ length: bus.capacity }, (_, terminalIndex) =>
                terminal(
                  { kind: 'bus', busId: bus.id, terminal: terminalIndex },
                  endpointPoint({ kind: 'bus', busId: bus.id, terminal: terminalIndex }),
                  bus.terminalLabels[terminalIndex] || String(terminalIndex + 1)
                )
              )}
            </g>
          );
        })}
        {wiring.infeeds.map((source, index) => {
          const origin = sourceOrigin(source, index),
            position =
              drag?.kind === 'infeed-label' && drag.id === source.id
                ? drag.point
                : { x: origin.x + (source.labelOffset?.x ?? 0), y: origin.y + 12 + (source.labelOffset?.y ?? 0) };
          return (
            <g key={source.id}>
              <rect
                className="wiring-source"
                x={origin.x - 5}
                y={origin.y - 8}
                width={Math.max(90, source.poles.length * 26 + 10)}
                height={58}
                rx={5}
                onPointerDown={(event) => startDrag(event, 'infeed', source.id, origin)}
              />
              <text
                className="wiring-move-label"
                x={position.x}
                y={position.y}
                onPointerDown={(event) => startDrag(event, 'infeed-label', source.id, position)}
              >
                {source.name}
              </text>
              {source.poles.map((pole, poleIndex) =>
                terminal(
                  { kind: 'infeed', infeedId: source.id, pole: poleIndex },
                  endpointPoint({ kind: 'infeed', infeedId: source.id, pole: poleIndex }),
                  pole
                )
              )}
            </g>
          );
        })}
        {[...externalEndpoints].map(([key, endpoint]) => {
          const point = endpointPoint(endpoint);
          return (
            <g key={key}>
              {terminal(endpoint, point, '↗')}
              <text x={point.x - 14} y={point.y + 5} textAnchor="end">
                {label(endpoint)}
              </text>
            </g>
          );
        })}
        {wiring.wires.map((wire, index) => {
          const position = wireLabelPoint(wire, index),
            text = wire.label || wire.cable?.designation;
          return text ? (
            <text
              key={wire.id}
              className="wiring-wire-label"
              x={position.x}
              y={position.y}
              onClick={() => onSelectWire(wire.id)}
              onPointerDown={(event) => startDrag(event, 'label', wire.id, position)}
            >
              {text}
            </text>
          ) : null;
        })}
        {selectedWire &&
          selectedRoute
            .slice(1, -1)
            .map((point, index) => (
              <circle
                className="wiring-route-handle"
                data-testid={`wire-bend-${index}`}
                key={index}
                cx={point.x}
                cy={point.y}
                r={7}
                onPointerDown={(event) => startDrag(event, 'point', selectedWire.id, point, index)}
              />
            ))}
      </svg>
    </div>
  );
}
