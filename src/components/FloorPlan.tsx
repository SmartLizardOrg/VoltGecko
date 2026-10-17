import { t, getLocale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent } from 'react';
import { Crosshair, Layers2, Maximize, Minus, MousePointer2, Plus, RotateCw, Route as RouteIcon, Ruler, Trash2 } from 'lucide-react';
import type { Asset, DeviceKind, PlanSheet, Point, ProjectData, Route } from '../types';
import { kindLabel, uid } from '../catalog';
import { SymbolGlyph } from './Symbol';
import './floorplan.css';

export interface FloorPlanProps {
  data: ProjectData;
  assets: Record<string, Asset>;
  sheetId: string;
  selectedId: string | null;
  tool: DeviceKind | 'select' | 'route' | 'control' | 'note' | 'scale';
  onSelect: (id: string | null) => void;
  onChange: (data: ProjectData) => void;
  onAddDevice: (kind: DeviceKind, sheetId: string, point: Point) => void;
  onNotify: (message: string) => void;
}

type View = { x: number; y: number; width: number; height: number };
type Drag = { mode: 'pan' | 'device' | 'note' | 'bend'; id: string; pointerId: number; start: Point; origin: Point; view: View; a: number; d: number; moved: boolean; bendIndex?: number };
type Pinch = { distance: number; point: Point; view: View; matrix: DOMMatrix };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pointOnSegment = (p: Point, a: Point, b: Point) => { const dx = b.x - a.x; const dy = b.y - a.y; const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return distance(p, { x: a.x + t * dx, y: a.y + t * dy }); };

export function FloorPlan({ data, assets, sheetId, selectedId, tool, onSelect, onChange, onAddDevice, onNotify }: FloorPlanProps) {
  const persistedSheet = data.sheets.find(s => s.id === sheetId);
  const [draftSheet, setDraftSheet] = useState<PlanSheet | null>(null);
  const draftRef = useRef<PlanSheet | null>(null);
  const sheet = draftSheet?.id === sheetId ? draftSheet : persistedSheet;
  const fit = (): View => ({ x: -48, y: -48, width: (sheet?.width ?? 1200) + 96, height: (sheet?.height ?? 800) + 96 });
  const [view, setView] = useState<View>(fit);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState({ background: true, devices: true, routes: true, notes: true, grid: false });
  const [fromId, setFromId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [scaleStart, setScaleStart] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);
  const dataRef = useRef(data);
  const suppressClick = useRef(false);
  dataRef.current = data;

  useEffect(() => { setView(fit()); setFromId(null); setScaleStart(null); setSelectedRouteId(null); setSelectedNoteId(null); setDraftSheet(null); draftRef.current = null; }, [sheetId]); // A sheet keeps its own document coordinates.
  useEffect(() => { setFromId(null); setScaleStart(null); }, [tool]);
  useEffect(() => {
    if (!selectedId) return;
    setSelectedRouteId(null); setSelectedNoteId(null);
    const placement = data.sheets.find(s => s.id === sheetId)?.placements.find(p => p.deviceId === selectedId);
    const element = svg.current;
    const matrix = element?.getScreenCTM();
    if (!placement || !element || !matrix) return;
    const screen = new DOMPoint(placement.x, placement.y).matrixTransform(matrix);
    const bounds = element.getBoundingClientRect();
    const margin = 24;
    if (screen.x < bounds.left + margin || screen.x > bounds.right - margin || screen.y < bounds.top + margin || screen.y > bounds.bottom - margin) {
      setView(current => ({ ...current, x: placement.x - current.width / 2, y: placement.y - current.height / 2 }));
    }
  }, [selectedId, sheetId]);

  if (!sheet) return <div className="floor-no-sheet">{t("Hozz létre egy tervlapot az alaprajz szerkesztéséhez.")}</div>;
  const background = sheet.backgroundAssetId ? assets[sheet.backgroundAssetId] : undefined;
  const selectedPlacement = sheet.placements.find(p => p.deviceId === selectedId);
  const selectedDevice = data.devices.find(d => d.id === selectedId);
  const selectedRoute = sheet.routes.find(r => r.id === selectedRouteId);
  const fromPlacement = sheet.placements.find(p => p.deviceId === fromId);
  const zoomPercent = Math.round((sheet.width + 96) / view.width * 100);

  const updateSheet = (update: (s: PlanSheet) => PlanSheet) => {
    if (drag.current?.moved && drag.current.mode !== 'pan') {
      const current = draftRef.current ?? dataRef.current.sheets.find(s => s.id === sheetId);
      if (current) { const next = update(current); draftRef.current = next; setDraftSheet(next); }
      return;
    }
    onChange({ ...dataRef.current, sheets: dataRef.current.sheets.map(s => s.id === sheetId ? update(s) : s) });
  };
  const worldPoint = (clientX: number, clientY: number) => {
    const m = svg.current?.getScreenCTM()?.inverse();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  const snapped = (p: Point): Point => ({ x: Math.max(0, Math.min(sheet.width, layers.grid ? Math.round(p.x / 10) * 10 : p.x)), y: Math.max(0, Math.min(sheet.height, layers.grid ? Math.round(p.y / 10) * 10 : p.y)) });
  const moveDevice = (id: string, point: Point) => updateSheet(s => {
    const original = s.placements.find(p => p.deviceId === id);
    if (!original) return s;
    const next = snapped(point);
    return { ...s, placements: s.placements.map(p => p.deviceId === id ? { ...p, ...next } : p), routes: s.routes.map(r => {
      if (r.fromDeviceId !== id && r.toDeviceId !== id) return r;
      const points = r.points.map(p => ({ ...p }));
      const i = r.fromDeviceId === id ? 0 : points.length - 1;
      const near = i === 0 ? 1 : i - 1;
      if (points[near]) {
        if (Math.abs(points[near].y - original.y) < .5) points[near].y = next.y;
        else if (Math.abs(points[near].x - original.x) < .5) points[near].x = next.x;
      }
      points[i] = next;
      return { ...r, points };
    }) };
  });
  const removeSelected = () => {
    if (selectedRouteId) { updateSheet(s => ({ ...s, routes: s.routes.filter(r => r.id !== selectedRouteId) })); setSelectedRouteId(null); }
    else if (selectedNoteId) { updateSheet(s => ({ ...s, annotations: s.annotations.filter(n => n.id !== selectedNoteId) })); setSelectedNoteId(null); }
    else if (selectedPlacement) { updateSheet(s => ({ ...s, placements: s.placements.filter(p => p.deviceId !== selectedId), routes: s.routes.filter(r => r.fromDeviceId !== selectedId && r.toDeviceId !== selectedId) })); onSelect(null); onNotify(t("Az eszköz lekerült a tervlapról. Az eszközlistában megmaradt.")); }
  };
  const zoom = (factor: number, point?: Point) => {
    const p = point ?? { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    setView(v => { const f = Math.max((sheet.width + 96) / 16, Math.min((sheet.width + 96) * 5, v.width * factor)) / v.width; return { x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, width: v.width * f, height: v.height * f }; });
  };
  const registerPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const matrix = svg.current?.getScreenCTM()?.inverse();
      if (matrix) { const mid = new DOMPoint((a.x + b.x) / 2, (a.y + b.y) / 2).matrixTransform(matrix); pinch.current = { distance: distance(a, b), point: mid, view, matrix }; drag.current = null; suppressClick.current = true; }
    }
  };
  const startDrag = (e: ReactPointerEvent, mode: Drag['mode'], id: string, origin: Point, bendIndex?: number) => {
    if (pinch.current || e.button > 0) return;
    const m = svg.current?.getScreenCTM()?.inverse();
    if (!m) return;
    drag.current = { mode, id, pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, origin, view, a: m.a, d: m.d, moved: false, bendIndex };
    svg.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = worldPoint(e.clientX, e.clientY);
    setCursor(p);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const initial = pinch.current;
      const f = Math.max(.08, Math.min(8, initial.distance / distance(a, b)));
      const middle = new DOMPoint((a.x + b.x) / 2, (a.y + b.y) / 2).matrixTransform(initial.matrix);
      setView({ x: initial.point.x - (middle.x - initial.view.x) * f, y: initial.point.y - (middle.y - initial.view.y) * f, width: initial.view.width * f, height: initial.view.height * f });
      return;
    }
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = (e.clientX - d.start.x) * d.a; const dy = (e.clientY - d.start.y) * d.d;
    if (Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < 3 && !d.moved) return;
    d.moved = true; suppressClick.current = true; setDragging(true);
    const next = { x: d.origin.x + dx, y: d.origin.y + dy };
    if (d.mode === 'pan') setView({ ...d.view, x: d.view.x - dx, y: d.view.y - dy });
    if (d.mode === 'device') moveDevice(d.id, next);
    if (d.mode === 'note') updateSheet(s => ({ ...s, annotations: s.annotations.map(n => n.id === d.id ? { ...n, ...snapped(next) } : n) }));
    if (d.mode === 'bend') updateSheet(s => ({ ...s, routes: s.routes.map(r => r.id === d.id ? { ...r, points: r.points.map((v, i) => i === d.bendIndex ? snapped(next) : v) } : r) }));
  };
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    // The SVG owns pointer capture during drags. Selection already happened on
    // pointerdown, so its synthetic canvas click must not clear that selection.
    if (drag.current?.mode && drag.current.mode !== 'pan') suppressClick.current = true;
    drag.current = null; setDragging(false);
    if (draftRef.current) {
      const committed = draftRef.current;
      draftRef.current = null;
      setDraftSheet(null);
      onChange({ ...dataRef.current, sheets: dataRef.current.sheets.map(s => s.id === sheetId ? committed : s) });
    }
    if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  };
  const deviceClick = (id: string) => {
    if (suppressClick.current) return;
    if (tool === 'route' || tool === 'control') {
      if (!fromId) { setFromId(id); onSelect(null); return; }
      if (fromId === id) { setFromId(null); return; }
      const a = sheet.placements.find(p => p.deviceId === fromId); const b = sheet.placements.find(p => p.deviceId === id);
      if (!a || !b) return;
      const kind = tool === 'route' ? 'power' : 'control';
      if (sheet.routes.some(r => r.kind === kind && ((r.fromDeviceId === fromId && r.toDeviceId === id) || (r.fromDeviceId === id && r.toDeviceId === fromId)))) { onNotify(t("Ez a kapcsolat már szerepel a tervlapon.")); setFromId(null); return; }
      const middle = (a.x + b.x) / 2;
      const route: Route = { id: uid(), fromDeviceId: fromId, toDeviceId: id, kind, circuitId: data.devices.find(d => d.id === fromId)?.circuitId ?? data.devices.find(d => d.id === id)?.circuitId, points: [{ x: a.x, y: a.y }, { x: middle, y: a.y }, { x: middle, y: b.y }, { x: b.x, y: b.y }] };
      updateSheet(s => ({ ...s, routes: [...s.routes, route] })); setFromId(null); onSelect(null); setSelectedRouteId(route.id); onNotify(t("Kapcsolat létrehozva. A töréspontokat húzással szerkesztheted.")); return;
    }
    onSelect(id); setSelectedRouteId(null); setSelectedNoteId(null);
  };
  const canvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (suppressClick.current) return;
    const p = snapped(worldPoint(e.clientX, e.clientY));
    if (tool === 'select') { onSelect(null); setSelectedRouteId(null); setSelectedNoteId(null); return; }
    if (tool === 'route' || tool === 'control') { setFromId(null); return; }
    if (tool === 'note') { const text = window.prompt(t("Megjegyzés a tervlapon:")); if (text?.trim()) updateSheet(s => ({ ...s, annotations: [...s.annotations, { id: uid(), ...p, text: text.trim() }] })); return; }
    if (tool === 'scale') {
      if (!scaleStart) { setScaleStart(p); return; }
      const measured = distance(scaleStart, p);
      if (measured < 1) { onNotify(t("A második pontot távolabb jelöld ki.")); return; }
      const answer = window.prompt(t("A kijelölt szakasz valós hossza méterben:"), '1');
      if (answer !== null) { const meters = Number(answer.replace(',', '.')); if (Number.isFinite(meters) && meters > 0) { updateSheet(s => ({ ...s, mmPerUnit: meters * 1000 / measured })); onNotify(t("A tervlap méretaránya beállítva.")); } else onNotify(t("Pozitív hosszúságot adj meg méterben.")); }
      setScaleStart(null); return;
    }
    onAddDevice(tool, sheetId, p);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input,textarea,select,button')) return;
    if (e.key === 'Escape') { onSelect(null); setSelectedRouteId(null); setSelectedNoteId(null); setFromId(null); setScaleStart(null); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
    if (selectedPlacement && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const n = e.shiftKey ? 20 : 5; moveDevice(selectedPlacement.deviceId, { x: selectedPlacement.x + (e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0), y: selectedPlacement.y + (e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0) }); }
  };
  const onWheel = (e: WheelEvent<SVGSVGElement>) => { zoom(Math.exp(Math.max(-.5, Math.min(.5, e.deltaY * .0015))), worldPoint(e.clientX, e.clientY)); };
  const colorFor = (deviceId: string, circuitId?: string) => data.circuits.find(c => c.id === (data.devices.find(d => d.id === deviceId)?.circuitId ?? circuitId))?.color ?? '#28775b';
  const routeLength = (route: Route) => route.points.slice(1).reduce((total, p, i) => total + distance(route.points[i], p), 0) * (sheet.mmPerUnit ?? 0) / 1000;
  const instruction = tool === 'route' || tool === 'control' ? fromId ? t("Válaszd ki a kapcsolat másik eszközét") : t("Válaszd ki a kapcsolat első eszközét") : tool === 'scale' ? scaleStart ? t("Jelöld ki a mérési szakasz másik végét") : t("Jelöld ki egy ismert hosszúságú szakasz két végét") : tool === 'note' ? t("Kattints a megjegyzés helyére") : tool !== 'select' ? t('{device} · kattints az elhelyezéshez', {device:kindLabel(tool)}) : '';

  return <div className={`floor-workspace ${tool !== 'select' ? 'floor-tool-active' : ''} ${dragging ? 'floor-is-dragging' : ''}`} onKeyDown={onKey} tabIndex={0} aria-label={t("Alaprajz szerkesztő. A kijelölt eszközt a nyilakkal mozgathatod.")}>
    <div className="floor-sheet-caption"><span className="floor-sheet-dot" />{sheet.name}<span className="floor-caption-separator">/</span><span>{t('{count} eszköz', {count:sheet.placements.length})}</span></div>
    <div className="floor-layer-tools"><button className={`floor-control ${layersOpen ? 'is-on' : ''}`} onClick={() => setLayersOpen(!layersOpen)} title={t("Rétegek")} aria-label={t("Rétegek")} aria-expanded={layersOpen}><Layers2 size={18} /></button>{layersOpen && <div className="floor-layers-popover"><strong>{t("Megjelenítés")}</strong>{([['background', t("Alaprajz")], ['devices', t("Eszközök és jelölések")], ['routes', t("Kapcsolatok")], ['notes', t("Megjegyzések")], ['grid', t("Rács és illesztés")]] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={layers[key]} onChange={e => setLayers({ ...layers, [key]: e.target.checked })} /><span>{label}</span></label>)}</div>}</div>
    {instruction && <div className="floor-instruction"><Crosshair size={15} /><span>{instruction}</span>{(fromId || scaleStart) && <button onClick={() => { setFromId(null); setScaleStart(null); }}>{t("Mégse")}</button>}</div>}
    <svg ref={svg} className="floor-svg" viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} role="img" aria-label={t('{name} villamos alaprajza', {name:sheet.name})} onPointerDownCapture={registerPointer} onPointerDown={e => { if (tool === 'select') startDrag(e, 'pan', '', { x: 0, y: 0 }); }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={e => { if (!drag.current && !pinch.current) pointers.current.delete(e.pointerId); }} onClick={canvasClick} onWheel={onWheel} onContextMenu={e => e.preventDefault()}>
      <defs><pattern id="floor-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r=".9" fill="#b8c4be" /></pattern><filter id="floor-paper-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="10" floodColor="#203e30" floodOpacity=".07" /></filter></defs>
      <rect className="floor-paper" width={sheet.width} height={sheet.height} fill="white" filter="url(#floor-paper-shadow)" />
      {background && layers.background && <image href={background.data} x="0" y="0" width={sheet.width} height={sheet.height} preserveAspectRatio="none" pointerEvents="none" />}
      {layers.grid && <rect width={sheet.width} height={sheet.height} fill="url(#floor-grid)" pointerEvents="none" />}
      {!background && !sheet.placements.length && <g pointerEvents="none" className="floor-empty-canvas"><rect x={sheet.width / 2 - 26} y={sheet.height / 2 - 67} width="52" height="42" rx="5" fill="none" stroke="#b6c6bc" strokeWidth="1.5" /><path d={`M${sheet.width / 2 - 15} ${sheet.height / 2 - 50}h30m-30 10h19`} stroke="#b6c6bc" strokeWidth="1.5" /><text x={sheet.width / 2} y={sheet.height / 2 + 4} textAnchor="middle" fill="#688273" fontSize="18" fontWeight="500">{t("Itt kezdődik a terved")}</text><text x={sheet.width / 2} y={sheet.height / 2 + 31} textAnchor="middle" fill="#91a296" fontSize="12">{t("Tölts fel egy alaprajzot, vagy helyezz el eszközöket.")}</text></g>}
      {layers.routes && sheet.routes.map(route => { const selected = route.id === selectedRouteId; const color = colorFor(route.fromDeviceId, route.circuitId); return <g key={route.id} onClick={e => { e.stopPropagation(); if (!suppressClick.current) { setSelectedRouteId(route.id); setSelectedNoteId(null); onSelect(null); } }} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => { e.stopPropagation(); const p = worldPoint(e.clientX, e.clientY); let index = 1; let best = Infinity; route.points.slice(1).forEach((v, i) => { const length = pointOnSegment(p, route.points[i], v); if (length < best) { best = length; index = i + 1; } }); updateSheet(s => ({ ...s, routes: s.routes.map(r => r.id === route.id ? { ...r, points: [...r.points.slice(0, index), p, ...r.points.slice(index)] } : r) })); setSelectedRouteId(route.id); }} className="floor-route"><polyline points={route.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="transparent" strokeWidth="18" /><polyline points={route.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={selected ? 3 : 2} opacity={selected ? 1 : .75} strokeDasharray={route.kind === 'control' ? '7 5' : undefined} strokeLinejoin="round" pointerEvents="none" />{selected && route.points.slice(1, -1).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="5" fill="white" stroke={color} strokeWidth="2" className="floor-bend" onPointerDown={e => { e.stopPropagation(); startDrag(e, 'bend', route.id, p, i + 1); }} />)}</g>; })}
      {fromPlacement && cursor && <path d={`M${fromPlacement.x} ${fromPlacement.y}H${cursor.x}V${cursor.y}`} fill="none" stroke="#20815d" strokeWidth="2" strokeDasharray="5 5" pointerEvents="none" />}
      {scaleStart && <g pointerEvents="none"><circle cx={scaleStart.x} cy={scaleStart.y} r="5" fill="#20815d" />{cursor && <path d={`M${scaleStart.x} ${scaleStart.y}L${cursor.x} ${cursor.y}`} stroke="#20815d" strokeWidth="2" strokeDasharray="5 3" />}</g>}
      {layers.devices && sheet.placements.map(placement => { const device = data.devices.find(d => d.id === placement.deviceId); if (!device) return null; const selected = device.id === selectedId; const connected = device.id === fromId; const color = colorFor(device.id); return <g key={device.id} transform={`translate(${placement.x} ${placement.y})`} className={`floor-device ${selected ? 'floor-device-selected' : ''}`} role="button" aria-label={`${device.code}, ${device.name}`} onClick={e => { e.stopPropagation(); deviceClick(device.id); }} onPointerDown={e => { e.stopPropagation(); if (tool === 'select') { onSelect(device.id); setSelectedRouteId(null); setSelectedNoteId(null); startDrag(e, 'device', device.id, placement); } }}>
        <title>{device.code} · {device.name}{device.room ? ` · ${device.room}` : ''}</title>
        {(selected || connected) && <circle r="25" fill={color} opacity=".12" />}
        <circle r="19" fill="white" fillOpacity=".94" stroke={selected || connected ? color : '#e2e8e4'} strokeWidth={selected || connected ? 1.5 : .8} />
        <g transform={`rotate(${placement.rotation})`}><SymbolGlyph kind={device.kind} color={color} /></g>
        {device.status === 'verified' && <circle cx="14" cy="-13" r="3.5" fill="#22a76e" stroke="white" strokeWidth="1.5" />}
        <text x="0" y="33" textAnchor="middle" fontSize="11" fontWeight="600" fill="#344d40" stroke="white" strokeWidth="3" paintOrder="stroke" pointerEvents="none">{device.code}</text>
      </g>; })}
      {layers.notes && sheet.annotations.map(note => <g key={note.id} transform={`translate(${note.x} ${note.y})`} className="floor-note" onClick={e => { e.stopPropagation(); setSelectedNoteId(note.id); setSelectedRouteId(null); onSelect(null); }} onPointerDown={e => { e.stopPropagation(); if (tool === 'select') { setSelectedNoteId(note.id); onSelect(null); startDrag(e, 'note', note.id, note); } }} onDoubleClick={e => { e.stopPropagation(); const text = window.prompt(t("Megjegyzés módosítása:"), note.text); if (text?.trim()) updateSheet(s => ({ ...s, annotations: s.annotations.map(n => n.id === note.id ? { ...n, text: text.trim() } : n) })); }}><rect x="-7" y="-17" width={Math.max(100, note.text.split('\n').reduce((max, line) => Math.max(max, line.length), 0) * 7.2 + 16)} height={Math.max(28, note.text.split('\n').length * 18 + 10)} rx="3" fill="#fffbe7" stroke={note.id === selectedNoteId ? '#b79733' : '#eadfae'} strokeWidth="1" /><text fill="#766534" fontSize="12" fontFamily="inherit">{note.text.split('\n').map((line, i) => <tspan key={i} x="0" dy={i ? 18 : 0}>{line}</tspan>)}</text></g>)}
    </svg>
    <div className="floor-bottom-info"><span><MousePointer2 size={13} />{dragging ? t("Mozgatás") : t("Húzás: mozgatás · görgetés: nagyítás")}</span>{sheet.mmPerUnit ? <span><Ruler size={13} />{t('{scale} m / 100 egység', {scale:(sheet.mmPerUnit * 100 / 1000).toLocaleString(getLocale(), { maximumFractionDigits: 2 })})}</span> : <span>{t("Méretarány nincs beállítva")}</span>}</div>
    {(selectedRoute || selectedNoteId || selectedPlacement) && <div className="floor-selection-tools">{selectedDevice && selectedPlacement && <><span><span className="floor-selected-code">{selectedDevice.code}</span>{kindLabel(selectedDevice.kind)}</span><button title={t("Forgatás 90°")} aria-label={t("Forgatás 90 fokkal")} onClick={() => updateSheet(s => ({ ...s, placements: s.placements.map(p => p.deviceId === selectedId ? { ...p, rotation: (p.rotation + 90) % 360 } : p) }))}><RotateCw size={15} /></button></>}{selectedRoute && <><span><RouteIcon size={15} />{selectedRoute.kind === 'control' ? t("Vezérlési kapcsolat") : t("Villamos kapcsolat")}{sheet.mmPerUnit ? ` · ${routeLength(selectedRoute).toLocaleString(getLocale(), { maximumFractionDigits: 1 })} m` : ''}</span><small>{t("Töréspont: húzás · új pont: dupla kattintás")}</small></>}{selectedNoteId && <span>{t("Megjegyzés · dupla kattintás: szerkesztés")}</span>}<button className="floor-delete-control" title={t("Eltávolítás a tervlapról")} aria-label={t("Kijelölt elem eltávolítása")} onClick={removeSelected}><Trash2 size={15} /></button></div>}
    <div className="floor-zoom-tools"><button className="floor-control" onClick={() => zoom(1.25)} title={t("Kicsinyítés")} aria-label={t("Kicsinyítés")}><Minus size={17} /></button><span>{zoomPercent}%</span><button className="floor-control" onClick={() => zoom(.8)} title={t("Nagyítás")} aria-label={t("Nagyítás")}><Plus size={17} /></button><i /><button className="floor-control" onClick={() => setView(fit())} title={t("Teljes tervlap")} aria-label={t("Teljes tervlap")}><Maximize size={16} /></button></div>
  </div>;
}

export default FloorPlan;
