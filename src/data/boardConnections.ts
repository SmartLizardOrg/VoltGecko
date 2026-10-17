import { uid } from '../catalog';
import { t } from '../i18n';
import type { Board, Device, ProjectData } from '../types';

export interface BoardConnectionIssue { kind:string; message:string; deviceId?:string; connectionId?:string }

/** All referenced devices remain visible even after removal from a physical DIN row. */
export function getBoardDevices(board:Board, devices:Device[]):Device[] {
  const included = new Set(board.rows.flatMap(row=>row.placements.map(placement=>placement.deviceId)));
  devices.filter(device=>device.boardId===board.id&&device.moduleWidth!==undefined&&device.product?.mounting!=='accessory').forEach(device=>included.add(device.id));
  const endpoints = new Set<string>();
  for(const connection of board.connections??[]){if(connection.fromDeviceId)endpoints.add(connection.fromDeviceId);endpoints.add(connection.toDeviceId);}
  return devices.filter(device=>endpoints.has(device.id)||(included.has(device.id)&&device.kind!=='blank'&&device.product?.mounting!=='accessory'));
}

/** Documentation consistency only: never infers cable sizes or electrical compliance. */
export function getBoardConnectionIssues(board:Board, devices:Device[]):BoardConnectionIssue[] {
  const issues:BoardConnectionIssue[]=[];
  const lookup=new Map(devices.map(device=>[device.id,device]));
  const links=board.connections??[];
  const keys=new Set<string>(),incoming=new Map<string,number>();
  const otherBoardDevices=new Set<string>();
  const adjacency=new Map<string,string[]>(),indegree=new Map<string,number>();
  for(const connection of links){
    const from=connection.fromDeviceId,to=connection.toDeviceId;
    if(!lookup.has(to)||(from!==undefined&&!lookup.has(from))){
      issues.push({kind:'missing',connectionId:connection.id,message:t('Egy elosztókapcsolat hiányzó készülékre hivatkozik.')});continue;
    }
    for(const id of [from,to]){
      const device=id===undefined?undefined:lookup.get(id);
      if(device?.boardId&&device.boardId!==board.id&&!otherBoardDevices.has(device.id)){
        otherBoardDevices.add(device.id);issues.push({kind:'other-board',deviceId:device.id,message:t('{code} másik elosztóhoz van rendelve; ellenőrizd az elosztók közötti kapcsolatot.',{code:device.code})});
      }
    }
    if(from===to)issues.push({kind:'self',connectionId:connection.id,deviceId:to,message:t('{code}: önmagára mutató kapcsolat.',{code:lookup.get(to)!.code})});
    const key=JSON.stringify([from??null,to]);
    if(keys.has(key))issues.push({kind:'duplicate',connectionId:connection.id,message:t('Ismétlődő elosztókapcsolat: {from} → {to}.',{from:from?lookup.get(from)!.code:t('Betáplálás'),to:lookup.get(to)!.code})});
    keys.add(key);
    incoming.set(to,(incoming.get(to)??0)+1);
    if(from!==undefined){
      if(!adjacency.has(from))adjacency.set(from,[]);
      adjacency.get(from)!.push(to);
      if(!indegree.has(from))indegree.set(from,0);
      indegree.set(to,(indegree.get(to)??0)+1);
    }
  }
  for(const [id,count] of incoming)if(count>1)issues.push({kind:'multiple',deviceId:id,message:t('{code}: több bejövő kapcsolat; a táplálási rend ellenőrizendő.',{code:lookup.get(id)!.code})});
  // Kahn's algorithm also catches a cycle in a disconnected component.
  const queue=[...indegree].filter(([,degree])=>degree===0).map(([id])=>id);
  let processed=0;
  for(let index=0;index<queue.length;index++){
    const id=queue[index];processed++;
    for(const target of adjacency.get(id)??[]){const next=indegree.get(target)!-1;indegree.set(target,next);if(next===0)queue.push(target);}
  }
  if(processed<indegree.size)issues.push({kind:'cycle',message:t('Hurok található az elosztókapcsolatokban. Minden kapcsolat megmaradt; ellenőrizd a táplálási irányokat.')});
  return issues;
}

/** null removes the input; undefined connects to the board's virtual external supply. */
export function setBoardFeed(data:ProjectData,boardId:string,targetId:string,sourceId:string|null|undefined):ProjectData {
  const next=structuredClone(data),board=next.boards.find(item=>item.id===boardId);
  if(!board)throw new Error(t('Az elosztó nem található.'));
  const eligible=new Set(getBoardDevices(board,next.devices).map(device=>device.id));
  if(!eligible.has(targetId)||(sourceId!==null&&sourceId!==undefined&&!eligible.has(sourceId)))throw new Error(t('A kapcsolat készülékei legyenek az aktív elosztóban.'));
  board.connections=(board.connections??[]).filter(connection=>connection.toDeviceId!==targetId);
  if(sourceId!==null){
    if(sourceId===targetId)throw new Error(t('Egy készülék nem táplálhatja önmagát.'));
    if(sourceId!==undefined){
      const adjacency=new Map<string,string[]>();
      for(const link of board.connections){if(link.fromDeviceId){const targets=adjacency.get(link.fromDeviceId)??[];targets.push(link.toDeviceId);adjacency.set(link.fromDeviceId,targets);}}
      const pending=[targetId],visited=new Set<string>();
      for(let index=0;index<pending.length;index++){
        const id=pending[index];if(id===sourceId)throw new Error(t('Ez a kapcsolat hurkot hozna létre.'));
        if(visited.has(id))continue;visited.add(id);pending.push(...(adjacency.get(id)??[]));
      }
    }
    board.connections.push({id:uid(),toDeviceId:targetId,...(sourceId===undefined?{}:{fromDeviceId:sourceId})});
  }
  return next;
}
