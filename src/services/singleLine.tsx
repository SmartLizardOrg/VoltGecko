import { kindLabel } from '../catalog';
import { getLocale, t } from '../i18n';
import { getBoardConnectionIssues, getBoardDevices } from '../data/boardConnections';
import { endpointConductor, wiringEndpointLabel, getWiringIssues } from '../data/boardWiring';
import { wireColorAppearance } from '../data/wireColors';
import type { Board, Circuit, Device, ProjectData, WiringEndpoint, CableDetails } from '../types';

interface GraphNode {
  key: string;
  device?: Device;
  supply?: boolean;
  label?: string;
  detail?: string;
  bus?: boolean;
  missingId?: string;
  incoming: number;
  circuits: Circuit[];
  x: number;
  y: number;
  height: number;
  rank: number;
}
interface GraphEdge { from: string; to: string; id: string; index: number; label?:string; undirected?:boolean; color?:string; stripe?:string }
export interface SingleLineDrawing {
  svg: string;
  width: number;
  height: number;
  /** Complete card bounds let paginated exports choose cuts between devices. */
  blocks: { x: number; y: number; width: number; height: number }[];
}
const CARD_WIDTH = 264;
const COLUMN_GAP = 60;
const ROW_GAP = 100;
const MARGIN = 48;
const HEADER_HEIGHT = 170;

/** All user text is XML text, including attributes and titles; SVG has no HTML. */
const xml = (value: unknown): string => String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
const safeColor = (color: string): string => /^#[a-f\d]{6}$/i.test(color) ? color : '#287c68';
export const cableLabel = (cable?:CableDetails):string => cable ? [cable.material, cable.designation, cable.crossSectionMm2 !== undefined ? `${cable.cores ? `${cable.cores}×` : ''}${cable.crossSectionMm2} mm²` : '', cable.lengthM !== undefined ? `${cable.lengthM} m` : ''].filter(Boolean).join(' · ') : '';
export const circuitCableLabel=(circuit:Circuit):string=>{
  const details=circuit.cableDetails;
  if(!details)return circuit.cable??'';
  return details.designation||details.crossSectionMm2!==undefined ? cableLabel(details) : [circuit.cable,cableLabel(details)].filter(Boolean).join(' · ');
};
const deviceKey = (id: string): string => `device:${id}`;
const words = (value: string, maxLength: number, maxLines: number): string[] => {
  const remaining = Array.from(value.trim().replace(/\s+/g, ' '));
  const lines: string[] = [];
  while (remaining.length && lines.length < maxLines) {
    let end = Math.min(maxLength, remaining.length);
    if (end < remaining.length) {
      const space = remaining.slice(0, end + 1).lastIndexOf(' ');
      if (space >= maxLength / 2) end = space;
    }
    lines.push(remaining.splice(0, end).join('').trim());
    while (remaining[0] === ' ') remaining.shift();
  }
  if (remaining.length && lines.length) lines[lines.length - 1] = `${lines.at(-1)!.slice(0, Math.max(1, maxLength - 1))}…`;
  return lines;
};
function text(x: number, y: number, value: string, size = 12, fill = '#283c35', weight = 400, extra = ''): string {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" ${extra}>${xml(value)}</text>`;
}
function wrapped(x: number, y: number, value: string, maxLength: number, maxLines: number, size = 12, fill = '#283c35', weight = 400): string {
  return words(value, maxLength, maxLines).map((line, index) => text(x, y + index * (size + 4), line, size, fill, weight)).join('');
}

/** Iterative Kosaraju + DAG ranking retains every edge and never recurses on cycles. */
function rankGraph(nodes: GraphNode[], edges: GraphEdge[]): void {
  const adjacency = new Map(nodes.map(node => [node.key, [] as string[]]));
  const reversed = new Map(nodes.map(node => [node.key, [] as string[]]));
  for (const edge of edges) {
    adjacency.get(edge.from)!.push(edge.to);
    reversed.get(edge.to)!.push(edge.from);
  }
  const visited = new Set<string>();
  const order: string[] = [];
  for (const node of nodes) {
    if (visited.has(node.key)) continue;
    visited.add(node.key);
    const stack: { key: string; next: number }[] = [{ key: node.key, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const neighbours = adjacency.get(frame.key)!;
      if (frame.next < neighbours.length) {
        const next = neighbours[frame.next++];
        if (!visited.has(next)) { visited.add(next); stack.push({ key: next, next: 0 }); }
      } else { order.push(frame.key); stack.pop(); }
    }
  }
  const component = new Map<string, number>();
  let componentCount = 0;
  for (let index = order.length - 1; index >= 0; index--) {
    const key = order[index];
    if (component.has(key)) continue;
    const pending = [key];
    component.set(key, componentCount);
    while (pending.length) {
      for (const neighbour of reversed.get(pending.pop()!)!) {
        if (!component.has(neighbour)) { component.set(neighbour, componentCount); pending.push(neighbour); }
      }
    }
    componentCount++;
  }
  const successors = Array.from({ length: componentCount }, () => new Set<number>());
  const indegrees = new Array<number>(componentCount).fill(0);
  const ranks = new Array<number>(componentCount).fill(0);
  for (const edge of edges) {
    const from = component.get(edge.from)!; const to = component.get(edge.to)!;
    if (from !== to && !successors[from].has(to)) { successors[from].add(to); indegrees[to]++; }
  }
  const ready = indegrees.flatMap((degree, index) => degree === 0 ? [index] : []);
  for (let index = 0; index < ready.length; index++) {
    const from = ready[index];
    for (const to of successors[from]) {
      ranks[to] = Math.max(ranks[to], ranks[from] + 1);
      if (--indegrees[to] === 0) ready.push(to);
    }
  }
  for (const node of nodes) node.rank = ranks[component.get(node.key)!];
}

function symbol(device?: Device, supply = false): string {
  const common = 'fill="none" stroke="#287c68" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  if (supply) return `<g ${common}><path d="M0 0V34M-10 24 0 34 10 24"/><path d="M-11 7Q-6 -1 0 7T11 7"/></g>`;
  switch (device?.kind) {
    case 'breaker': case 'main': case 'switch': return `<g ${common}><path d="M0 0V10M0 25V36M0 25 11 10"/><circle cy="10" r="2" fill="#fff"/><circle cy="25" r="2" fill="#fff"/>${device.kind === 'breaker' ? '<path d="M-8 19H3"/>' : ''}</g>`;
    case 'rcd': case 'rcbo': return `<g ${common}><path d="M0 0V7M0 29V36"/><rect x="-12" y="7" width="24" height="22" rx="2"/>${text(0, 22, 'IΔ', 10, '#287c68', 600, 'text-anchor="middle"')}${device.kind === 'rcbo' ? '<path d="M-16 18H-12M12 18H16"/>' : ''}</g>`;
    case 'spd': return `<g ${common}><path d="M0 0V7M0 29V36"/><rect x="-12" y="7" width="24" height="22"/><path d="M3 10-4 19H3L-3 26"/></g>`;
    case 'relay': return `<g ${common}><path d="M0 0V7M0 29V36"/><rect x="-12" y="7" width="24" height="22"/><path d="M-9 26 9 10"/></g>`;
    default: return `<g ${common}><path d="M0 0V7M0 29V36"/><rect x="-12" y="7" width="24" height="22" rx="2"/><path d="M-7 12 7 24M7 12-7 24"/></g>`;
  }
}

/** Pure, self-contained SVG shared by the offline view, download and PDF export. */
export function buildSingleLineSvg(data: ProjectData, board: Board, combined=false): SingleLineDrawing {
  const devices = new Map(data.devices.map(device => [device.id, device]));
  const nodes = new Map<string, GraphNode>();
  const ensureDevice = (id: string) => {
    const key = deviceKey(id);
    if (!nodes.has(key)) {
      const device = devices.get(id);
      const circuits = device ? data.circuits.filter(circuit => circuit.protectionDeviceId === id || (!circuit.protectionDeviceId && circuit.id === device.circuitId)) : [];
      nodes.set(key, { key, device, missingId: device ? undefined : id, circuits, incoming: 0, x: 0, y: 0, height: 166 + circuits.length * 70, rank: 0 });
    }
    return key;
  };
  for (const row of board.rows) {
    for (const placement of [...row.placements].sort((a, b) => a.start - b.start)) {
      const device = devices.get(placement.deviceId);
      if (device && device.kind !== 'blank' && device.product?.mounting !== 'accessory') ensureDevice(device.id);
    }
  }
  for (const device of getBoardDevices(board, data.devices)) ensureDevice(device.id);
  const edges: GraphEdge[] = (board.connections ?? []).map((connection, index) => {
    const from = connection.fromDeviceId !== undefined ? ensureDevice(connection.fromDeviceId) : 'supply';
    if (from === 'supply' && !nodes.has(from)) nodes.set(from, { key: from, supply: true, incoming: 0, circuits: [], x: 0, y: 0, height: 118, rank: 0 });
    const to = ensureDevice(connection.toDeviceId);
    nodes.get(to)!.incoming++;
    return { from, to, id: connection.id, index };
  });
  const ensureEndpoint = (endpoint:WiringEndpoint):string => {
    if(endpoint.kind==='device') return ensureDevice(endpoint.deviceId);
    const key = endpoint.kind==='bus' ? `bus:${endpoint.busId}` : `infeed:${endpoint.infeedId}`;
    if(!nodes.has(key)) {
      const bus=endpoint.kind==='bus' ? data.boards.flatMap(item=>item.wiring?.buses??[]).find(item=>item.id===endpoint.busId) : undefined;
      const infeed=endpoint.kind==='infeed' ? data.boards.flatMap(item=>item.wiring?.infeeds??[]).find(item=>item.id===endpoint.infeedId) : undefined;
      const label=bus?.name??infeed?.name??t('Hiányzó végpont');
      const owner=data.boards.find(item=>item.wiring?.buses.some(value=>value.id===bus?.id)||item.wiring?.infeeds.some(value=>value.id===infeed?.id));
      const detail=[owner?.name,bus ? `${bus.conductor} · ${bus.capacity} ${t('kapocs')}` : infeed ? `${infeed.poles.join(' / ')} · ${cableLabel(infeed.cable)}` : t('A kapcsolat végpontja nem található a projektben.')].filter(Boolean).join(' · ');
      nodes.set(key,{key,label,detail,bus:!!bus,supply:infeed?.kind==='supply',incoming:0,circuits:[],x:0,y:0,height:132,rank:0});
    }
    return key;
  };
  for(const bus of board.wiring?.buses??[]) ensureEndpoint({kind:'bus',busId:bus.id,terminal:0});
  for(const infeed of board.wiring?.infeeds??[]) ensureEndpoint({kind:'infeed',infeedId:infeed.id,pole:0});
  for(const wire of board.wiring?.wires??[]) {
    const from=ensureEndpoint(wire.from),to=ensureEndpoint(wire.to);
    const appearance=wireColorAppearance(wire,endpointConductor(data,wire.from)??'L');
    // Physical wire order never asserts a supply direction. Keep every conductor,
    // same-device bridge and repeated edge; no spanning-tree inference occurs.
    nodes.get(from)!.incoming++; nodes.get(to)!.incoming++;
    edges.push({from,to,id:wire.id,index:edges.length,undirected:true,color:appearance.color,stripe:appearance.stripe,
      label:[`${wiringEndpointLabel(data,wire.from)} ↔ ${wiringEndpointLabel(data,wire.to)}`,cableLabel(wire.cable),wire.label].filter(Boolean).join(' · ')});
  }
  // Place the supply first regardless of the order in which a connection was entered.
  const ordered = [...nodes.values()].sort((a, b) => Number(!!b.supply) - Number(!!a.supply));
  // Physical conductors have no entered direction. Rank them from their nearest
  // source solely for layout; reversing click order cannot move a supply below
  // its consumers. Explicit device-level feed directions remain authoritative.
  const adjacency=new Map(ordered.map(node=>[node.key,[] as string[]]));
  for(const edge of edges){adjacency.get(edge.from)!.push(edge.to);if(edge.undirected)adjacency.get(edge.to)!.push(edge.from);}
  const distances=new Map<string,number>(),queue:string[]=[];
  const visit=()=>{for(let index=0;index<queue.length;index++){const key=queue[index];for(const target of adjacency.get(key)??[])if(!distances.has(target)){distances.set(target,distances.get(key)!+1);queue.push(target);}}queue.length=0;};
  for(const node of ordered.filter(node=>node.supply)){distances.set(node.key,0);queue.push(node.key);}visit();
  for(const node of ordered)if(!distances.has(node.key)){distances.set(node.key,0);queue.push(node.key);visit();}
  const rankingEdges=edges.map(edge=>edge.undirected&&((distances.get(edge.from)!>distances.get(edge.to)!)||(distances.get(edge.from)===distances.get(edge.to)&&edge.from>edge.to))?{...edge,from:edge.to,to:edge.from}:edge);
  rankGraph(ordered, rankingEdges);
  const layers = new Map<number, GraphNode[]>();
  for (const node of ordered) { const layer = layers.get(node.rank) ?? []; layer.push(node); layers.set(node.rank, layer); }
  const maxColumns = 6;
  const columns = Math.min(maxColumns, [...layers.values()].reduce((count, layer) => Math.max(count, layer.length), 1));
  const contentWidth = columns * CARD_WIDTH + Math.max(0, columns - 1) * COLUMN_GAP;
  let bottom = HEADER_HEIGHT;
  for (const [, layer] of [...layers.entries()].sort(([a], [b]) => a - b)) {
    for (let offset = 0; offset < layer.length; offset += maxColumns) {
      const row = layer.slice(offset, offset + maxColumns);
      const rowWidth = row.length * CARD_WIDTH + (row.length - 1) * COLUMN_GAP;
      row.forEach((node, index) => { node.x = MARGIN + (contentWidth - rowWidth) / 2 + index * (CARD_WIDTH + COLUMN_GAP); node.y = bottom; });
      bottom += Math.max(...row.map(node => node.height)) + ROW_GAP;
    }
  }
  if (!ordered.length) bottom = HEADER_HEIGHT + 170;
  const lookup = new Map(ordered.map(node => [node.key, node]));
  const rowBottoms = new Map<number, number>();
  for (const node of ordered) rowBottoms.set(node.y, Math.max(rowBottoms.get(node.y) ?? 0, node.y + node.height));
  let outerLaneCount = 0;
  const paths = edges.map(edge => {
    const from = lookup.get(edge.from)!; const to = lookup.get(edge.to)!;
    const sx = from.x + CARD_WIDTH / 2; const sy = from.y + from.height;
    const tx = to.x + CARD_WIDTH / 2; const ty = to.y;
    let path: string; let labelX: number; let labelY: number;
    if (to.rank === from.rank + 1 && ty > sy && ty - sy <= ROW_GAP + 2) {
      const channel = sy + 24 + (edge.index % 7) * 7;
      path = `M${sx} ${sy}V${channel}H${tx}V${ty - 5}`;
      labelX = sx + 8; labelY = channel - 6;
    } else {
      // Reuse an outside channel after 24 lanes so dense imports do not create an unbounded page width.
      const lane = MARGIN + contentWidth + 30 + (outerLaneCount++ % 24) * 13;
      const startY = rowBottoms.get(from.y)! + 24 + (edge.index % 5) * 7;
      const topY = to.y - 24 - (edge.index % 5) * 7;
      path = `M${sx} ${sy}V${startY}H${lane}V${topY}H${tx}V${ty - 5}`;
      labelX = lane + 4; labelY = startY - 5;
    }
    const fromName = from.label || (from.supply ? board.supplyLabel || t('Betáplálás') : from.device?.code || from.missingId || '—');
    const toName = to.label || to.device?.code || to.missingId || '—';
    const title=edge.label || t('Kapcsolat: {from} → {to}', { from: fromName, to: toName });
    const stripe=edge.stripe?`<path d="${path}" fill="none" stroke="${safeColor(edge.stripe)}" stroke-width="1.8" stroke-dasharray="7 7"/>`:'';
    return `<g data-connection-id="${xml(edge.id)}" data-connection-index="${edge.index}"><title>${xml(title)}</title><path d="${path}" fill="none" stroke="${safeColor(edge.color??'#698379')}" stroke-width="1.8"${edge.undirected?'':' marker-end="url(#single-line-arrow)"'}/>${stripe}${text(labelX, labelY, String(edge.index + 1), 10, '#667d72')}</g>`;
  }).join('');
  const issues = [...getBoardConnectionIssues(board, data.devices).filter(issue=>!combined||issue.kind!=='other-board'), ...(combined?data.boards.flatMap(item=>getWiringIssues(data,item)):getWiringIssues(data,board))];
  const noticeLines = issues.slice(0, 8).flatMap(issue => words(issue.message, Math.floor(contentWidth / 7), 2));
  if (issues.length > 8) noticeLines.push(t('{count} további jelzés az alkalmazásban.', { count: issues.length - 8 }));
  const footerY = bottom + 5;
  const width = Math.ceil(Math.max(640, MARGIN * 2 + contentWidth + (outerLaneCount ? 44 + Math.min(24, outerLaneCount) * 13 : 0)));
  const height = Math.ceil(footerY + 88 + (noticeLines.length ? noticeLines.length * 18 + 28 : 0));
  const cards = ordered.map(node => {
    const x = node.x; const y = node.y; const device = node.device;
    const isMissing = node.missingId !== undefined;
    const outline = isMissing ? '#c57a52' : '#c6d9cf';
    const label = node.label || (node.supply ? board.supplyLabel || t('Elosztó betáplálása') : device?.name || t('Hiányzó készülék'));
    const title = [device?.code || node.missingId, label, node.detail, device?.rating, device?.product?.reference || device?.model, ...node.circuits.map(circuit => `${circuit.code} · ${circuit.name} · ${circuit.cable || ''}${circuit.powerW !== undefined ? ` · ${circuit.powerW} W` : ''}`)].filter(Boolean).join('\n');
    const dataAttribute = device ? ` data-device-id="${xml(device.id)}" tabindex="0" role="button" aria-label="${xml(`${device.code} · ${device.name}`)}"` : '';
    let content = `<g${dataAttribute}><title>${xml(title)}</title><rect x="${x}" y="${y}" width="${CARD_WIDTH}" height="${node.height}" rx="8" fill="#fff" stroke="${outline}" stroke-width="1.5"/><path d="M${x + 10} ${y}H${x + CARD_WIDTH - 10}" stroke="${isMissing ? '#bd714d' : '#287c68'}" stroke-width="3"/><g transform="translate(${x + 33} ${y + 17})">${symbol(device, node.supply)}</g>`;
    content += wrapped(x + 59, y + 29, node.bus ? t('Sín') : node.supply ? t('Betáplálás') : device?.code || (node.label ? t('Külső bekötés') : t('Hiányzó készülék')), 23, 1, 14, '#1c5c49', 700);
    content += wrapped(x + 59, y + 49, label, 26, 2, 12, '#354c41', 500);
    if (node.detail) content += wrapped(x+17,y+96,node.detail,36,2,11,'#526b5d');
    else if (node.supply) content += text(x + 18, y + 95, t('A nyilak a megadott kapcsolat irányát jelzik.'), 10, '#647d70');
    else if (device) {
      content += wrapped(x + 17, y + 93, device.rating || kindLabel(device.kind), 37, 2, 11, '#526b5d');
      content += wrapped(x + 17, y + 126, device.product?.reference || device.model || '—', 37, 1, 11, '#526b5d', 500);
      if (!node.incoming) content += text(x + 17, y + 151, t('Nincs megadva a bemenet'), 10, '#9c6d28');
      else if(combined) content += wrapped(x+17,y+151,data.boards.find(item=>item.id===device.boardId||item.rows.some(row=>row.placements.some(p=>p.deviceId===device.id)))?.name??'',37,1,10,'#526b5d');
    } else content += wrapped(x + 17, y + 100, t('A kapcsolat végpontja nem található a projektben.'), 35, 3, 11, '#a16a44');
    node.circuits.forEach((circuit, index) => {
      const cy = y + 166 + index * 70;
      const color = safeColor(circuit.color);
      const metadata = [circuitCableLabel(circuit), circuit.powerW !== undefined ? `${circuit.powerW.toLocaleString(getLocale())} W` : '',circuit.phase].filter(Boolean).join(' · ');
      content += `<g><title>${xml(`${t('Áramkör-hozzárendelés')}: ${circuit.code} · ${circuit.name}\n${metadata}`)}</title><path d="M${x + 1} ${cy}H${x + CARD_WIDTH - 1}" stroke="#e2ebe5"/><rect x="${x + 11}" y="${cy + 12}" width="3" height="44" rx="1.5" fill="${color}"/>`;
      content += wrapped(x + 23, cy + 22, `${circuit.code} · ${circuit.name}`, 32, 2, 11, color, 600);
      content += wrapped(x + 23, cy + 56, metadata || '—', 34, 1, 10, '#647b6e');
      content += '</g>';
    });
    content += '</g>';
    return content;
  }).join('');
  const empty = ordered.length ? '' : `${text(MARGIN, HEADER_HEIGHT + 55, t('Nincs készülék az elosztóban'), 19, '#476657', 600)}${wrapped(MARGIN, HEADER_HEIGHT + 88, t('Helyezz el készülékeket az elosztón, majd add meg a kapcsolataikat.'), 70, 2, 13, '#6c8376')}`;
  let notices = '';
  if (noticeLines.length) {
    notices += text(MARGIN, footerY + 77, t('Kapcsolati jelzések'), 12, '#96692c', 600);
    notices += noticeLines.map((line, index) => text(MARGIN, footerY + 99 + index * 18, line, 11, '#96692c')).join('');
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="single-line-title single-line-description"><title id="single-line-title">${xml(`${board.name} · ${t('Egyvonalas rajz')}`)}</title><desc id="single-line-description">${xml(t('Az elosztó ténylegesen megadott kapcsolatai, irányjelöléssel.'))}</desc><defs><marker id="single-line-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#698379"/></marker></defs><rect width="${width}" height="${height}" fill="#fff"/><g font-family="Arial, Helvetica, sans-serif">${text(MARGIN, 36, t('Egyvonalas rajz').toLocaleUpperCase(getLocale()), 10, '#70877b', 600, 'letter-spacing="1.8"')}${wrapped(MARGIN, 66, board.name, Math.floor((width - MARGIN * 2) / 12), 1, 22, '#214f3d', 600)}${text(MARGIN, 93, t('{devices} készülék · {connections} kapcsolat', { devices: ordered.filter(node => node.device).length, connections: edges.length }), 11, '#6c8376')}${paths}${cards}${empty}${text(MARGIN, footerY + 15, t('A sín sorrendje nem határozza meg a villamos kapcsolatokat.'), 11, '#647b6e')}${text(MARGIN, footerY + 35, t('A rajz a megadott kapcsolatokat mutatja; a jelölések sematikusak.'), 11, '#647b6e')}${notices}</g></svg>`;
  return { svg, width, height, blocks: ordered.map(node => ({ x: node.x, y: node.y, width: CARD_WIDTH, height: node.height })) };
}

/** Shared-project overview preserves cross-board wiring without duplicating edges. */
export function buildProjectSingleLineSvg(data:ProjectData):SingleLineDrawing {
  const board:Board={id:'combined-project-view',name:data.name,rows:data.boards.flatMap(item=>item.rows),connections:data.boards.flatMap(item=>item.connections??[]),
    wiring:{buses:data.boards.flatMap(item=>item.wiring?.buses??[]),infeeds:data.boards.flatMap(item=>item.wiring?.infeeds??[]),wires:data.boards.flatMap(item=>item.wiring?.wires??[])}};
  return buildSingleLineSvg(data,board,true);
}
