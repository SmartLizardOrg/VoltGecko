import { t, getLocale } from '../i18n';
import { Plus, Trash2, AlertTriangle, LayoutGrid, ArrowRight } from 'lucide-react';
import type { Board, Device, ProjectData } from '../types';
import { uid, kindLabel } from '../catalog';
import { getBoardIssues } from '../data/project';
import { BoardConnections } from './BoardConnections';
import { getAvailableBoardDevices, placeBoardDevice } from '../data/boardPlacement';

interface Props { data: ProjectData; boardId:string; onBoardChange:(id:string)=>void; selectedId: string | null; onSelect: (id: string | null) => void; onChange: (data: ProjectData) => void; onNotify: (text: string) => void }
export function BoardEditor({ data, boardId:active, onBoardChange:setActive, selectedId, onSelect, onChange, onNotify }: Props) {
  const formatNumber = (value: number) => value.toLocaleString(getLocale());
  const board = data.boards.find(b => b.id === active) ?? data.boards[0];
  const update = (fn: (board: Board) => void) => { const next = structuredClone(data); const target = next.boards.find(b => b.id === board.id)!; fn(target); onChange(next); };
  const issues = board ? getBoardIssues(board, data.devices) : [];
  const available = getAvailableBoardDevices(data);
  const addBoard = () => {
    const name = prompt(t("Az elosztó neve:"), t('Elosztó {number}', {number:data.boards.length + 1})); if (!name?.trim()) return;
    const id = uid(); onChange({ ...data, boards: [...data.boards, { id, name: name.trim(), rows: [{id:uid(),name:t('{number}. sor', {number:1}),capacity:12,placements:[]}] }] }); setActive(id);
  };
  const place = (device: Device, rowId: string, start?: number) => {
    try { onChange(placeBoardDevice(data, board.id, rowId, device.id, start)); onSelect(device.id); }
    catch (error) { onNotify(error instanceof Error ? error.message : String(error)); }
  };
  if (!board) return <div className="empty"><LayoutGrid size={40}/><h2>{t("Kezdj egy elosztóval")}</h2><p>{t("Add meg a sorokat, majd helyezd el a készülékeket.")}</p><button className="primary" onClick={addBoard}><Plus size={16}/>{t("Elosztó létrehozása")}</button></div>;
  const total = board.rows.reduce((sum, r) => sum + r.capacity, 0);
  const used = board.rows.flatMap(r=>r.placements).reduce((sum,p)=>sum+(data.devices.find(d=>d.id===p.deviceId)?.moduleWidth??1),0);
  return <div className="board-editor">
    <div className="section-heading"><div><span className="eyebrow">{t("ELOSZTÓTERVEZŐ")}</span><h2>{board.name}</h2><p>{t("Készülékek és modulhelyek, egy helyen.")}</p></div><div className="row-actions"><select aria-label={t("Aktív elosztó")} value={board.id} onChange={e=>setActive(e.target.value)}>{data.boards.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select><button className="icon-button" title={t("Új elosztó")} onClick={addBoard}><Plus size={18}/></button></div></div>
    <div className="board-stats"><div><span>{t("Összes modulhely")}</span><strong>{formatNumber(total)}<small>M</small></strong></div><div><span>{t("Tervezett foglaltság")}</span><strong>{formatNumber(used)}<small>M</small></strong></div><div><span>{t("Szabad kapacitás")}</span><strong className={used>total?'danger-text':'green-text'}>{formatNumber(total-used)}<small>M</small></strong></div><div><span>{t("Tervezési jelzések")}</span><strong className={issues.length?'amber-text':''}>{issues.length}</strong></div></div>
    {board.product&&<div className="board-manufacturer"><strong>{board.product.manufacturer} · {board.product.reference}</strong><span>{board.product.range}</span><a href={board.product.sourceUrl} target="_blank" rel="noreferrer noopener">{t('Gyártói forrás')} · {board.product.sourcePage}</a></div>}
    <div className="board-surface">
      <div className="cabinet-label"><span>{t("DIN / MODULKIOSZTÁS")}</span><span>{t('{count} sor · {total} M', {count:board.rows.length,total:formatNumber(total)})}</span></div>
      {board.rows.map((row, rowIndex) => {
        const rowIssues = issues.filter(i=>i.rowId===row.id);
        return <div className="din-row" key={row.id}>
          <div className="din-row-heading"><input aria-label={t('{number}. sor neve', {number:rowIndex+1})} value={row.name} onChange={e=>update(b=>{b.rows[rowIndex].name=e.target.value;})}/><label>{t("Kapacitás")} <input aria-label={t('{number}. sor kapacitása', {number:rowIndex+1})} type="number" min="1" max="144" value={row.capacity} onChange={e=>{const n=Number(e.target.value);if(n>=1&&n<=144) update(b=>{b.rows[rowIndex].capacity=n;});}}/> M</label><button className="icon-button danger-hover" title={t("Sor törlése")} onClick={()=>{if(confirm(t("Törlöd a sort? A készülékek a projektben megmaradnak."))) update(b=>{b.rows.splice(rowIndex,1);});}}><Trash2 size={15}/></button></div>
          <div className="din-scroll"><div className="din-track" style={{width:Math.max(12,row.capacity)*46}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); const d=data.devices.find(d=>d.id===e.dataTransfer.getData('deviceId'));if(d)place(d,row.id,(e.clientX-e.currentTarget.getBoundingClientRect().left)/46);}}>
            <div className="din-rail"/>{Array.from({length:Math.ceil(row.capacity)},(_,i)=><div className="module-slot" key={i} style={{left:i*46}}><span>{i+1}</span></div>)}
            {row.placements.map(p=>{
              const device = data.devices.find(d=>d.id===p.deviceId); if(!device)return null;
              const circuit = data.circuits.find(c=>c.id===device.circuitId||c.protectionDeviceId===device.id);
              const invalid=rowIssues.some(i=>i.deviceId===device.id);
              return <button key={device.id} draggable onDragStart={e=>e.dataTransfer.setData('deviceId',device.id)} onClick={()=>onSelect(device.id)} title={`${device.code} · ${device.name} · ${formatNumber(device.moduleWidth??1)} M`} aria-label={`${device.code} ${device.name}`} className={`din-device ${selectedId===device.id?'selected':''} ${invalid?'invalid':''} ${device.kind==='blank'?'blank':''}`} style={{left:p.start*46+2,width:Math.max(.5,device.moduleWidth??1)*46-4,'--device-color':circuit?.color??'#247d69'} as React.CSSProperties}>
                <span className="terminal-dot"/><span className="din-code">{device.code}</span><span className="din-rating">{device.rating||'—'}</span><span className="breaker-toggle"/><span className="din-kind">{device.moduleWidth!>=2?kindLabel(device.kind):`${formatNumber(device.moduleWidth??1)} M`}</span><span className="terminal-dot bottom"/>
              </button>;
            })}
          </div></div>
          <div className="din-row-footer"><span>{t('{count} készülék', {count:row.placements.length})}</span><div className="row-actions"><select aria-label={t('{name}: készülék elhelyezése', {name:row.name})} defaultValue="" onChange={e=>{const d=available.find(d=>d.id===e.target.value);if(d)place(d,row.id);e.target.value='';}}><option value="">{t("+ Készülék elhelyezése")}</option>{available.map(d=><option value={d.id} key={d.id}>{d.code} · {d.name} ({formatNumber(d.moduleWidth??1)} M)</option>)}</select></div></div>
        </div>;
      })}
      <button className="add-row" onClick={()=>update(b=>b.rows.push({id:uid(),name:t('{number}. sor', {number:b.rows.length+1}),capacity:12,placements:[]}))}><Plus size={17}/>{t("Új DIN-sor")}</button>
    </div>
    {issues.length>0&&<div className="validation-box"><h3><AlertTriangle size={16}/>{t("Ellenőrizendő kiosztás")}</h3>{issues.map((i,n)=><p key={n}>{i.message}</p>)}</div>}
    {selectedId&&data.devices.find(d=>d.id===selectedId)?.moduleWidth!==undefined&&<div className="placement-editor"><strong>{t("Kijelölt készülék helye")}</strong><div className="row-actions"><select aria-label={t("Készülék sora")} value={board.rows.find(r=>r.placements.some(p=>p.deviceId===selectedId))?.id??''} onChange={e=>{const d=data.devices.find(d=>d.id===selectedId);if(d&&e.target.value)place(d,e.target.value);}}><option value="">{t("Nincs elhelyezve")}</option>{board.rows.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><label>{t("Kezdőhely")} <input aria-label={t("Kezdő modulhely")} type="number" min="1" step="0.5" value={(board.rows.flatMap(r=>r.placements).find(p=>p.deviceId===selectedId)?.start??0)+1} onChange={e=>{const row=board.rows.find(r=>r.placements.some(p=>p.deviceId===selectedId));const d=data.devices.find(d=>d.id===selectedId);if(row&&d&&Number(e.target.value)>=1)place(d,row.id,Number(e.target.value)-1);}}/></label><button className="quiet" onClick={()=>{update(b=>b.rows.forEach(r=>{r.placements=r.placements.filter(p=>p.deviceId!==selectedId);}));onNotify(t("A készülék lekerült az elosztóról."));}}>{t("Levétel a sínről")}</button></div></div>}
    {data.devices.some(d=>d.boardId===board.id&&d.product?.mounting==='accessory')&&<section className="board-accessories"><h3>{t('Elosztó tartozékai')}</h3><p className="subtle">{t('Tartozékok az anyaglistában, DIN-modulhely foglalása nélkül.')}</p>{data.devices.filter(d=>d.boardId===board.id&&d.product?.mounting==='accessory').map(d=><button key={d.id} className={selectedId===d.id?'selected':''} onClick={()=>onSelect(d.id)}><strong>{d.product!.reference}</strong><span>{d.name}</span><small>{d.quantity??1} {t('db')}</small></button>)}</section>}
    <BoardConnections data={data} board={board} onChange={onChange} onNotify={onNotify} onSelect={id=>onSelect(id)}/>
    <p className="subtle board-hint"><ArrowRight size={15}/>{t("A bal oldali készüléktárból adj hozzá elemeket. A sor alatti listából érintéssel is elhelyezhetők.")}</p>
  </div>;
}
