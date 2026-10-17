import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, Maximize2, Minus, Network, Plus } from 'lucide-react';
import { t, useLanguage } from '../i18n';
import { getBoardConnectionIssues } from '../data/boardConnections';
import { buildSingleLineSvg } from '../services/singleLine';
import type { ProjectData } from '../types';
import './single-line.css';

interface Props {
  data: ProjectData;
  boardId: string;
  onBoardChange: (id: string) => void;
  onSelect: (id: string) => void;
}
const clampZoom = (value: number): number => Math.min(2.5, Math.max(.1, value));

export function SingleLine({ data, boardId, onBoardChange, onSelect }: Props) {
  const { language } = useLanguage();
  const board = data.boards.find(item => item.id === boardId) ?? data.boards[0];
  const drawing = useMemo(() => board ? buildSingleLineSvg(data, board) : undefined, [data, board, language]);
  const issues = useMemo(() => board ? getBoardConnectionIssues(board, data.devices) : [], [board, data.devices, language]);
  const stage = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  useEffect(() => { setFit(true); stage.current?.scrollTo({ top: 0, left: 0 }); }, [board?.id]);
  useEffect(() => {
    const viewport = stage.current;
    if (!viewport || !drawing || !fit) return;
    // Fit the width and retain vertical scrolling so a long feed chain keeps readable labels.
    const resize = () => setZoom(clampZoom(Math.min(1, (viewport.clientWidth - 32) / drawing.width)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [drawing, fit]);
  const changeZoom = (multiplier: number) => { setFit(false); setZoom(current => clampZoom(current * multiplier)); };
  const selectFromSvg = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const id = target.closest('[data-device-id]')?.getAttribute('data-device-id');
    if (id && data.devices.some(device => device.id === id)) onSelect(id);
  };
  const download = () => {
    if (!drawing || !board) return;
    const blob = new Blob([drawing.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${board.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim() || 'board'}-single-line.svg`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!board || !drawing) return <div className="empty"><Network size={40}/><h2>{t('Egyvonalas rajz')}</h2><p>{t('Előbb hozz létre egy elosztót az elosztónézetben.')}</p></div>;
  return <section className="single-line-view">
    <div className="single-line-heading">
      <div><span className="eyebrow">{t('KAPCSOLATI NÉZET')}</span><h2>{t('Egyvonalas rajz')}</h2><p>{t('Az elosztó ténylegesen megadott kapcsolatai, irányjelöléssel.')}</p></div>
      <select aria-label={t('Egyvonalas rajz elosztója')} value={board.id} onChange={event => onBoardChange(event.target.value)}>{data.boards.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </div>
    <div className="single-line-toolbar">
      <div className="single-line-zoom">
        <button className="icon-button" aria-label={t('Rajz kicsinyítése')} title={t('Rajz kicsinyítése')} onClick={() => changeZoom(1 / 1.2)} disabled={zoom <= .1001}><Minus size={17}/></button>
        <output aria-label={t('A rajz nagyítása')}>{Math.round(zoom * 100)}%</output>
        <button className="icon-button" aria-label={t('Rajz nagyítása')} title={t('Rajz nagyítása')} onClick={() => changeZoom(1.2)} disabled={zoom >= 2.499}><Plus size={17}/></button>
        <button className="quiet" aria-label={t('Rajz illesztése')} onClick={() => { setFit(true); stage.current?.scrollTo({ top: 0, left: 0 }); }}><Maximize2 size={15}/><span>{t('Illesztés')}</span></button>
      </div>
      <button className="quiet single-line-download" onClick={download}><Download size={15}/>{t('SVG letöltése')}</button>
    </div>
    <div ref={stage} className="single-line-stage" aria-label={t('Egyvonalas rajz munkaterülete')} tabIndex={0}>
      <div className="single-line-paper" style={{ width: drawing.width * zoom, height: drawing.height * zoom }}>
        <div className="single-line-svg" style={{ width: drawing.width, height: drawing.height, transform: `scale(${zoom})` }}
          onClick={event => selectFromSvg(event.target)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { if (event.target instanceof Element && event.target.closest('[data-device-id]')) { event.preventDefault(); selectFromSvg(event.target); } } }}
          dangerouslySetInnerHTML={{ __html: drawing.svg.replace('role="img"', 'role="group"') }}/>
      </div>
    </div>
    <div className="single-line-caption"><Network size={14}/><span>{t('Kattints egy készülékre az adatlap megnyitásához.')}</span></div>
    {issues.length > 0 && <section className="single-line-issues" aria-label={t('Kapcsolati jelzések')}>
      <h3><AlertTriangle size={16}/>{t('{count} kapcsolati jelzés', { count: issues.length })}</h3>
      <ul>{issues.map((issue, index) => <li key={`${issue.connectionId ?? issue.deviceId ?? issue.kind}-${index}`}>{issue.deviceId && data.devices.some(device => device.id === issue.deviceId) ? <button onClick={() => onSelect(issue.deviceId!)}>{issue.message}</button> : <span>{issue.message}</span>}</li>)}</ul>
    </section>}
  </section>;
}
