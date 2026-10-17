import { AlertTriangle, Cable, Trash2 } from 'lucide-react';
import { t } from '../i18n';
import { getBoardConnectionIssues, getBoardDevices, setBoardFeed } from '../data/boardConnections';
import type { Board, ProjectData } from '../types';

interface Props { data:ProjectData; board:Board; onChange:(data:ProjectData)=>void; onNotify:(message:string)=>void; onSelect:(id:string)=>void }
export function BoardConnections({data,board,onChange,onNotify,onSelect}:Props){
  const devices=getBoardDevices(board,data.devices),issues=getBoardConnectionIssues(board,data.devices);
  const links=board.connections??[];
  const lookup=new Map(data.devices.map(device=>[device.id,device]));
  const remove=(id:string)=>onChange({...data,boards:data.boards.map(item=>item.id===board.id?{...item,connections:links.filter(link=>link.id!==id)}:item)});
  return <section className="board-connections">
    <h3><Cable size={17}/>{t('Elosztókapcsolatok')}</h3>
    <p className="subtle">{t('Válaszd ki, melyik készülékről kap táplálást az adott elem. Az egyvonalas rajz ezekből a kapcsolatokból készül.')}</p>
    <label className="supply-label">{t('Betáplálás megnevezése')}<input value={board.supplyLabel??''} maxLength={5000} placeholder={t('Például: 3×400/230 V, lakásbetáp')} onChange={event=>onChange({...data,boards:data.boards.map(item=>item.id===board.id?{...item,supplyLabel:event.target.value}:item)})}/></label>
    <div className="board-feed-list">{devices.map(device=>{
      const incoming=links.filter(link=>link.toDeviceId===device.id);
      const value=incoming.length>1?'multiple':incoming.length===0?'none':incoming[0].fromDeviceId===undefined?'supply':`device:${incoming[0].fromDeviceId}`;
      return <div className="board-feed" key={device.id}><button className="board-feed-device" onClick={()=>onSelect(device.id)}><strong>{device.code}</strong><span>{device.name}</span></button><select aria-label={t('{code} táplálása',{code:device.code})} value={value} onChange={event=>{try{const selected=event.target.value;onChange(setBoardFeed(data,board.id,device.id,selected==='none'?null:selected==='supply'?undefined:selected.slice(7)));}catch(error){onNotify(error instanceof Error?error.message:String(error));}}}>
        <option value="none">{t('Nincs megadva')}</option><option value="supply">{t('Külső betáplálás')}</option>{incoming.length>1&&<option value="multiple" disabled>{t('Több bejövő kapcsolat')}</option>}{devices.filter(source=>source.id!==device.id).map(source=><option key={source.id} value={`device:${source.id}`}>{source.code} · {source.name}</option>)}
      </select></div>;
    })}</div>
    {!devices.length&&<p className="subtle">{t('Még nincs elhelyezett készülék.')}</p>}
    {links.length>0&&<div className="board-link-list">{links.map(link=>{const from=link.fromDeviceId?lookup.get(link.fromDeviceId)?.code??'?':t('Külső betáplálás'),to=lookup.get(link.toDeviceId)?.code??'?';return <div key={link.id}><span>{from} → {to}</span><button className="icon-button danger-hover" aria-label={t('Kapcsolat törlése: {from} → {to}',{from,to})} onClick={()=>remove(link.id)}><Trash2 size={14}/></button></div>;})}</div>}
    {issues.length>0&&<div className="validation-box"><h3><AlertTriangle size={16}/>{t('Ellenőrizendő kiosztás')}</h3>{issues.map((issue,index)=><p key={index}>{issue.message}</p>)}</div>}
  </section>;
}
